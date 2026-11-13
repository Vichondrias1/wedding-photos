// API tests against a running `wrangler dev`.
//
//   Terminal 1:  npx wrangler dev                      (window as configured)
//   Terminal 2:  npm test
//
// Env: BASE (default http://localhost:8787), ADMIN_PASSWORD (default from .dev.vars),
//      EXPECT_OPEN=1 if the upload window is open, 0 if closed (default: auto-detect).
// WARNING: finishes by deleting every upload in the (local) bucket.

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8787";
let PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) {
  try {
    PASSWORD = /^ADMIN_PASSWORD=(.*)$/m.exec(readFileSync(".dev.vars", "utf8"))[1].trim();
  } catch {
    PASSWORD = "local-test-password";
  }
}
const MiB = 1024 * 1024;

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ✓ " + name);
  } catch (e) {
    failed++;
    console.log("  ✗ " + name + "\n      " + (e && e.message));
  }
}
function eq(actual, expected, label = "") {
  if (actual !== expected) throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function ok(cond, label) {
  if (!cond) throw new Error(label || "assertion failed");
}
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

async function req(path, opts = {}, cookie) {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  return fetch(BASE + path, { ...opts, headers, redirect: "manual" });
}

console.log(`Testing ${BASE}`);

// ---------------------------------------------------------------- pages
await test("guest page is served with config injected", async () => {
  const r = await req("/");
  eq(r.status, 200, "status");
  const html = await r.text();
  ok(html.includes("window.WEDDING="), "config script injected");
  ok(!html.includes("<!--WEDDING-->"), "placeholder replaced");
});
await test("raw page templates are not reachable", async () => {
  eq((await req("/pages/guest.html")).status, 404);
});
await test("static vendor files are served", async () => {
  const r = await req("/vendor/client-zip.js");
  eq(r.status, 200);
  ok((await r.text()).includes("downloadZip"), "client-zip content");
});
await test("QR card redirects to login when logged out", async () => {
  const r = await req("/admin/card");
  eq(r.status, 302);
});

// ---------------------------------------------------------------- auth
let cookie = "";
await test("admin API rejects anonymous requests", async () => {
  eq((await req("/api/admin/files")).status, 401);
});
await test("wrong password is rejected", async () => {
  const r = await req("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "nope" }) });
  eq(r.status, 401);
});
await test("forged cookie is rejected", async () => {
  const fake = `wp_admin=${Date.now() + 1e9}.${"a".repeat(64)}`;
  eq((await req("/api/admin/files", {}, fake)).status, 401);
});
await test("correct password sets an HttpOnly cookie", async () => {
  const r = await req("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: PASSWORD }) });
  eq(r.status, 200, "status");
  const set = r.headers.get("set-cookie") || "";
  ok(/HttpOnly/i.test(set) && /SameSite=Strict/i.test(set), "cookie flags: " + set);
  cookie = set.split(";")[0];
  eq((await req("/api/admin/files", {}, cookie)).status, 200, "files with cookie");
  eq((await req("/admin/card", {}, cookie)).status, 200, "card with cookie");
});

// Start from an empty bucket.
await req("/api/admin/delete-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) }, cookie);

// ---------------------------------------------------------------- window
const status = await (await req("/api/status")).json();
const open = process.env.EXPECT_OPEN ? process.env.EXPECT_OPEN === "1" : status.open;
console.log(`  (upload window is ${status.state}: opens ${status.opens}, closes ${status.closes})`);
if (process.env.EXPECT_OPEN) {
  await test(`window state is ${open ? "open" : "closed"} as expected`, async () => eq(status.open, open));
}
await test("status reports admin when logged in", async () => {
  eq((await (await req("/api/status", {}, cookie)).json()).isAdmin, true);
});

const small = randomBytes(1 * MiB);
await test(`guest single upload is ${open ? "allowed" : "blocked (403)"}`, async () => {
  const r = await req("/api/upload?name=guest.jpg&guest=Guest", { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: small });
  eq(r.status, open ? 200 : 403);
});
await test(`guest multipart create is ${open ? "allowed" : "blocked (403)"}`, async () => {
  const r = await req("/api/mpu/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "v.mp4", type: "video/mp4", size: 100 * MiB, guest: "G" }) });
  eq(r.status, open ? 200 : 403);
  if (open) {
    const { key, uploadId } = await r.json();
    await req("/api/mpu/abort", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, uploadId }) });
  }
});
await test(`guest thumbnail upload is ${open ? "allowed" : "blocked (403)"} by the window`, async () => {
  const r = await req("/api/thumb?key=uploads/abcdefgh-0123456789.jpg", { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: randomBytes(1000) });
  eq(r.status, open ? 404 : 403); // open → passes window check, then 404 because the original doesn't exist
});

// From here on upload as admin so the tests work whether or not the window is open.
await req("/api/admin/delete-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) }, cookie);

// ---------------------------------------------------------------- single upload
const name = "Niño's photo 📷.JPG";
const guest = "José Ñ. Cruz";
let singleKey = "";
await test("admin can upload outside the window (single PUT)", async () => {
  const q = new URLSearchParams({ name, guest });
  const r = await req("/api/upload?" + q, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: small }, cookie);
  eq(r.status, 200, "status");
  const j = await r.json();
  ok(/^uploads\/[a-z0-9]+-[a-z0-9]{10}\.jpg$/.test(j.key), "key format " + j.key);
  singleKey = j.key;
});
await test("downloaded file is byte-identical", async () => {
  const r = await req("/api/admin/file?key=" + encodeURIComponent(singleKey), {}, cookie);
  eq(r.status, 200);
  eq(r.headers.get("content-type"), "image/jpeg", "content-type");
  eq(sha(Buffer.from(await r.arrayBuffer())), sha(small), "sha256");
});
await test("download link uses the original (unicode) filename", async () => {
  const r = await req("/api/admin/file?dl=1&key=" + encodeURIComponent(singleKey), {}, cookie);
  const cd = r.headers.get("content-disposition") || "";
  ok(cd.startsWith("attachment"), "attachment: " + cd);
  ok(cd.includes("filename*=UTF-8''" + encodeURIComponent(name)), "filename*: " + cd);
  await r.arrayBuffer();
});
await test("range requests return 206 with the right bytes (video seeking)", async () => {
  const r = await req("/api/admin/file?key=" + encodeURIComponent(singleKey), { headers: { Range: "bytes=100-199" } }, cookie);
  eq(r.status, 206, "status");
  eq(r.headers.get("content-range"), `bytes 100-199/${small.length}`, "content-range");
  eq(sha(Buffer.from(await r.arrayBuffer())), sha(small.subarray(100, 200)), "slice");
  const r2 = await req("/api/admin/file?key=" + encodeURIComponent(singleKey), { headers: { Range: "bytes=-50" } }, cookie);
  eq(r2.status, 206, "suffix status");
  eq(sha(Buffer.from(await r2.arrayBuffer())), sha(small.subarray(small.length - 50)), "suffix slice");
});
await test("empty and oversize single uploads are refused", async () => {
  const e = await req("/api/upload?name=a.jpg", { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: Buffer.alloc(0) }, cookie);
  ok(e.status === 411 || e.status === 400, "empty → " + e.status);
  const big = await req("/api/upload?name=a.mp4", { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: Buffer.alloc(96 * MiB) }, cookie);
  eq(big.status, 413, "96 MiB");
});

// ---------------------------------------------------------------- thumbs
const thumb = randomBytes(40 * 1024);
await test("thumbnail upload + fetch", async () => {
  const r = await req("/api/thumb?key=" + encodeURIComponent(singleKey), { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: thumb }, cookie);
  eq(r.status, 200, "put");
  const g = await req("/api/admin/thumb?key=" + encodeURIComponent(singleKey), {}, cookie);
  eq(g.status, 200, "get");
  eq(sha(Buffer.from(await g.arrayBuffer())), sha(thumb), "sha256");
});
await test("thumbnail key is validated", async () => {
  eq((await req("/api/thumb?key=site/header", { method: "PUT", body: thumb }, cookie)).status, 400, "outside uploads/");
  eq((await req("/api/thumb?key=" + encodeURIComponent("uploads/../x"), { method: "PUT", body: thumb }, cookie)).status, 400, "traversal");
  eq((await req("/api/thumb?key=uploads/zzzzzzzz-0123456789.jpg", { method: "PUT", body: thumb }, cookie)).status, 404, "missing original");
  eq((await req("/api/thumb?key=" + encodeURIComponent(singleKey), { method: "PUT", body: Buffer.alloc(3 * MiB) }, cookie)).status, 413, "too big");
});

// ---------------------------------------------------------------- multipart
const bigFile = randomBytes(60 * MiB); // 25 + 25 + 10 MiB parts
let mpuKey = "";
await test("multipart upload (3 × 25 MiB parts) reassembles exactly", async () => {
  const c = await req("/api/mpu/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Wedding video.MOV", type: "video/quicktime", size: bigFile.length, guest: "Video Uncle" }) }, cookie);
  eq(c.status, 200, "create");
  const { key, uploadId } = await c.json();
  ok(key.endsWith(".mov"), "key ext " + key);
  const parts = [];
  const PART = 25 * MiB;
  for (let n = 1; (n - 1) * PART < bigFile.length; n++) {
    const body = bigFile.subarray((n - 1) * PART, Math.min(n * PART, bigFile.length));
    const q = new URLSearchParams({ key, uploadId, part: n });
    const p = await req("/api/mpu/part?" + q, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body }, cookie);
    eq(p.status, 200, "part " + n);
    parts.push(await p.json());
  }
  eq(parts.length, 3, "part count");
  const done = await req("/api/mpu/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, uploadId, parts: parts.reverse() }) }, cookie);
  eq(done.status, 200, "complete");
  eq((await done.json()).size, bigFile.length, "size");
  const g = await req("/api/admin/file?key=" + encodeURIComponent(key), {}, cookie);
  eq(sha(Buffer.from(await g.arrayBuffer())), sha(bigFile), "sha256");
  mpuKey = key;
});
await test("multipart abort works and bad requests are refused", async () => {
  const c = await req("/api/mpu/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x.mp4", type: "video/mp4", size: 200 * MiB }) }, cookie);
  const { key, uploadId } = await c.json();
  eq((await req("/api/mpu/abort", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, uploadId }) }, cookie)).status, 200, "abort");
  const bad = new URLSearchParams({ key: "site/header", uploadId, part: 1 });
  eq((await req("/api/mpu/part?" + bad, { method: "PUT", body: Buffer.alloc(10) }, cookie)).status, 400, "key outside uploads/");
  const bad2 = new URLSearchParams({ key, uploadId, part: 0 });
  eq((await req("/api/mpu/part?" + bad2, { method: "PUT", body: Buffer.alloc(10) }, cookie)).status, 400, "part 0");
  const huge = await req("/api/mpu/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x.mp4", size: 6 * 1024 * MiB }) }, cookie);
  eq(huge.status, 413, "6 GiB file");
});

// ---------------------------------------------------------------- list
await test("list returns decoded names, guests, thumbs and stats", async () => {
  const j = await (await req("/api/admin/files", {}, cookie)).json();
  eq(j.files.length, 2, "file count");
  const one = j.files.find((f) => f.key === singleKey);
  eq(one.filename, name, "filename");
  eq(one.guest, guest, "guest");
  eq(one.hasThumb, true, "hasThumb");
  eq(one.size, small.length, "size");
  const vid = j.files.find((f) => f.key === mpuKey);
  eq(vid.type, "video/quicktime", "video type");
  eq(vid.hasThumb, false, "video hasThumb");
  eq(j.stats.fileCount, 2, "stats.fileCount");
  eq(j.stats.guestCount, 2, "stats.guestCount");
  eq(j.stats.photos, 1, "photos");
  eq(j.stats.videos, 1, "videos");
  eq(j.stats.totalBytes, small.length + bigFile.length + thumb.length, "totalBytes includes thumbs");
});

// ---------------------------------------------------------------- header photo
await test("header photo upload is served publicly and shown on the guest page", async () => {
  const img = randomBytes(5000);
  eq((await req("/api/admin/header", { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: img }, cookie)).status, 200, "put");
  const g = await req("/header-photo");
  eq(g.status, 200, "get");
  eq(sha(Buffer.from(await g.arrayBuffer())), sha(img), "sha");
  ok((await (await req("/")).text()).includes("/header-photo?v="), "guest page references it");
  eq((await req("/api/admin/header", { method: "DELETE" }, cookie)).status, 200, "delete");
  eq((await req("/header-photo")).status, 404, "gone");
});

// ---------------------------------------------------------------- delete
await test("delete one file removes it and its thumbnail", async () => {
  eq((await req("/api/admin/file?key=" + encodeURIComponent(singleKey), { method: "DELETE" }, cookie)).status, 200, "delete");
  eq((await req("/api/admin/file?key=" + encodeURIComponent(singleKey), {}, cookie)).status, 404, "file gone");
  eq((await req("/api/admin/thumb?key=" + encodeURIComponent(singleKey), {}, cookie)).status, 404, "thumb gone");
});
await test("delete all needs the DELETE confirmation", async () => {
  eq((await req("/api/admin/delete-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, cookie)).status, 400, "no confirm");
  eq((await req("/api/admin/delete-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) })).status, 401, "anonymous");
  const r = await req("/api/admin/delete-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) }, cookie);
  eq(r.status, 200, "delete all");
  const j = await (await req("/api/admin/files", {}, cookie)).json();
  eq(j.files.length, 0, "empty");
  eq(j.stats.totalBytes, 0, "no bytes left");
});
await test("logout clears the cookie", async () => {
  const r = await req("/api/admin/logout", { method: "POST" }, cookie);
  ok(/Max-Age=0/.test(r.headers.get("set-cookie") || ""), "Max-Age=0");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
