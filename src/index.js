// Wedding photo collector — one Cloudflare Worker + one R2 bucket.
// No database: guest name + original filename live in R2 customMetadata.
// Heavy work (thumbnails, zipping) happens in the browser because the free
// plan only gives the Worker ~10 ms of CPU per request. Streaming bytes from
// the request into R2 costs almost no CPU.

import defaults from "./config.js";

const MiB = 1024 * 1024;
const SINGLE_MAX = 95 * MiB; // Workers cap request bodies at 100 MB
const PART_MAX = 30 * MiB; // client sends 25 MiB parts
const FILE_MAX = 5 * 1024 * MiB; // 5 GiB per file
const THUMB_MAX = 2 * MiB;
const HEADER_MAX = 15 * MiB;
const SESSION_DAYS = 30;
const COOKIE = "wp_admin";
const HEADER_KEY = "site/header";

const KEY_RE = /^uploads\/([a-z0-9]{6,12}-[a-z0-9]{10})(\.[a-z0-9]{1,8})?$/;

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (err) {
      console.error(err && err.stack ? err.stack : err);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  // ---- pages ---------------------------------------------------------------
  if (method === "GET" || method === "HEAD") {
    if (path === "/") return page(env, url, "guest.html");
    if (path === "/admin") return page(env, url, "admin.html");
    if (path === "/admin/card") {
      if (!(await isAdmin(request, env))) return Response.redirect(new URL("/admin?next=card", url), 302);
      return page(env, url, "card.html");
    }
    if (path === "/header-photo") return headerPhoto(env);
  }
  if (path.startsWith("/pages")) return new Response("Not found", { status: 404 });

  // ---- public API ----------------------------------------------------------
  if (path === "/api/status" && method === "GET") {
    const cfg = config(env);
    return json({ ...windowState(cfg), isAdmin: await isAdmin(request, env) });
  }
  if (path === "/api/upload" && method === "PUT") return singleUpload(request, env, url);
  if (path === "/api/mpu/create" && method === "POST") return mpuCreate(request, env);
  if (path === "/api/mpu/part" && method === "PUT") return mpuPart(request, env, url);
  if (path === "/api/mpu/complete" && method === "POST") return mpuComplete(request, env);
  if (path === "/api/mpu/abort" && method === "POST") return mpuAbort(request, env);
  if (path === "/api/thumb" && method === "PUT") return thumbUpload(request, env, url);

  // ---- admin API -----------------------------------------------------------
  if (path === "/api/admin/login" && method === "POST") return login(request, env, url);
  if (path === "/api/admin/logout" && method === "POST") {
    return json({ ok: true }, 200, { "Set-Cookie": cookie(url, "", 0) });
  }
  if (path.startsWith("/api/admin/")) {
    if (!(await isAdmin(request, env))) return json({ error: "Please log in." }, 401);
    if (path === "/api/admin/files" && method === "GET") return listFiles(env);
    if (path === "/api/admin/file" && method === "GET") return getFile(request, env, url);
    if (path === "/api/admin/file" && method === "DELETE") return deleteFile(env, url);
    if (path === "/api/admin/thumb" && method === "GET") return getThumb(env, url);
    if (path === "/api/admin/delete-all" && method === "POST") return deleteAll(request, env);
    if (path === "/api/admin/header" && method === "PUT") return putHeader(request, env);
    if (path === "/api/admin/header" && method === "DELETE") {
      await env.BUCKET.delete(HEADER_KEY);
      return json({ ok: true });
    }
  }
  if (path.startsWith("/api/")) return json({ error: "Not found" }, 404);

  // ---- static files (fonts, scripts, styles) -------------------------------
  return env.ASSETS.fetch(request);
}

// ===========================================================================
//  Config
// ===========================================================================

const OVERRIDES = {
  COUPLE_NAMES: "coupleNames",
  WEDDING_DATE: "weddingDate",
  VENUE: "venue",
  WELCOME_MESSAGE: "welcomeMessage",
  UPLOAD_OPENS: "uploadOpens",
  UPLOAD_CLOSES: "uploadCloses",
  TIMEZONE: "timezone",
  FONT: "font",
  HEADER_PHOTO: "headerPhoto",
  SITE_URL: "siteUrl",
  STORAGE_LIMIT_GB: "storageLimitGB",
};
const COLOR_OVERRIDES = { COLOR_BACKGROUND: "background", COLOR_PRIMARY: "primary", COLOR_TEXT: "text" };

function config(env) {
  const cfg = { ...defaults, colors: { ...defaults.colors } };
  for (const [name, field] of Object.entries(OVERRIDES)) {
    if (typeof env[name] === "string" && env[name].trim() !== "") cfg[field] = env[name].trim();
  }
  for (const [name, field] of Object.entries(COLOR_OVERRIDES)) {
    if (typeof env[name] === "string" && env[name].trim() !== "") cfg.colors[field] = env[name].trim();
  }
  for (const k of Object.keys(cfg.colors)) {
    if (!/^#[0-9a-fA-F]{3,8}$/.test(cfg.colors[k])) cfg.colors[k] = defaults.colors[k];
  }
  cfg.storageLimitGB = Number(cfg.storageLimitGB) || 10;
  if (cfg.font !== "modern") cfg.font = "serif";
  return cfg;
}

function windowState(cfg) {
  const now = Date.now();
  const opens = Date.parse(cfg.uploadOpens);
  const closes = Date.parse(cfg.uploadCloses);
  let state = "open";
  if (!Number.isNaN(opens) && now < opens) state = "before";
  else if (!Number.isNaN(closes) && now >= closes) state = "after";
  return { state, open: state === "open", opens: cfg.uploadOpens, closes: cfg.uploadCloses, now };
}

async function canUpload(request, env) {
  if (windowState(config(env)).open) return true;
  return isAdmin(request, env);
}

function closedResponse(env) {
  const w = windowState(config(env));
  const msg = w.state === "before" ? "Uploads aren't open yet." : "Uploads are closed.";
  return json({ error: msg, state: w.state }, 403);
}

// ===========================================================================
//  Pages
// ===========================================================================

async function page(env, url, file) {
  const res = await env.ASSETS.fetch(new Request(new URL("/pages/" + file, url)));
  if (!res.ok) return new Response("Page missing: " + file, { status: 500 });
  const cfg = config(env);

  let header = cfg.headerPhoto;
  if (!header) {
    const head = await env.BUCKET.head(HEADER_KEY);
    if (head) header = "/header-photo?v=" + encodeURIComponent(head.etag);
  }
  const pub = {
    coupleNames: cfg.coupleNames,
    weddingDate: cfg.weddingDate,
    venue: cfg.venue,
    welcomeMessage: cfg.welcomeMessage,
    uploadOpens: cfg.uploadOpens,
    uploadCloses: cfg.uploadCloses,
    timezone: cfg.timezone,
    font: cfg.font,
    headerPhoto: header || "",
    headerFromBucket: !cfg.headerPhoto && !!header,
    siteUrl: cfg.siteUrl,
    storageLimitGB: cfg.storageLimitGB,
  };
  const c = cfg.colors;
  const inject =
    `<script>window.WEDDING=${JSON.stringify(pub).replace(/</g, "\\u003c")};</script>` +
    `<style>:root{--bg:${c.background};--primary:${c.primary};--text:${c.text};}</style>`;
  let html = await res.text();
  html = html.replace("<!--WEDDING-->", inject).replaceAll("{{COUPLE}}", escapeHtml(cfg.coupleNames));
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    },
  });
}

async function headerPhoto(env) {
  const obj = await env.BUCKET.get(HEADER_KEY);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("ETag", obj.httpEtag);
  return new Response(obj.body, { headers });
}

// ===========================================================================
//  Guest uploads
// ===========================================================================

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let rand = "";
  for (const b of bytes) rand += alphabet[b % 36];
  return Date.now().toString(36) + "-" + rand;
}

function cleanText(s, max) {
  return String(s || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanFilename(name) {
  const base = String(name || "").split(/[\\/]/).pop();
  return cleanText(base.replace(/[<>:"|?*]/g, "_"), 90) || "file";
}

function extOf(filename) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(filename);
  return m ? "." + m[1].toLowerCase() : "";
}

function cleanType(t) {
  t = String(t || "").toLowerCase();
  return /^(image|video)\/[a-z0-9.+-]+$/.test(t) ? t : "application/octet-stream";
}

function newObject(filename, guest, type) {
  const name = cleanFilename(filename);
  const id = newId();
  return {
    id,
    key: "uploads/" + id + extOf(name),
    httpMetadata: { contentType: cleanType(type) },
    // Encoded so names like "Niño" survive every R2 API path unchanged.
    customMetadata: {
      guest: encodeURIComponent(cleanText(guest, 50)),
      filename: encodeURIComponent(name),
      uploadedAt: new Date().toISOString(),
    },
  };
}

function contentLength(request) {
  const n = Number(request.headers.get("Content-Length"));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function singleUpload(request, env, url) {
  if (!(await canUpload(request, env))) return closedResponse(env);
  const len = contentLength(request);
  if (!len) return json({ error: "Empty upload." }, 411);
  if (len > SINGLE_MAX) return json({ error: "File too large for a single upload." }, 413);

  const obj = newObject(url.searchParams.get("name"), url.searchParams.get("guest"), request.headers.get("Content-Type"));
  await env.BUCKET.put(obj.key, request.body, {
    httpMetadata: obj.httpMetadata,
    customMetadata: obj.customMetadata,
  });
  return json({ id: obj.id, key: obj.key });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function mpuCreate(request, env) {
  if (!(await canUpload(request, env))) return closedResponse(env);
  const body = await readJson(request);
  const size = Number(body.size) || 0;
  if (size > FILE_MAX) return json({ error: "Files can be at most 5 GB." }, 413);
  const obj = newObject(body.name, body.guest, body.type);
  const mpu = await env.BUCKET.createMultipartUpload(obj.key, {
    httpMetadata: obj.httpMetadata,
    customMetadata: obj.customMetadata,
  });
  return json({ id: obj.id, key: obj.key, uploadId: mpu.uploadId });
}

function validKey(key) {
  return typeof key === "string" && KEY_RE.test(key);
}

async function mpuPart(request, env, url) {
  if (!(await canUpload(request, env))) return closedResponse(env);
  const key = url.searchParams.get("key");
  const uploadId = url.searchParams.get("uploadId");
  const part = Number(url.searchParams.get("part"));
  if (!validKey(key) || !uploadId || !Number.isInteger(part) || part < 1 || part > 10000) {
    return json({ error: "Bad part request." }, 400);
  }
  const len = contentLength(request);
  if (!len) return json({ error: "Empty part." }, 411);
  if (len > PART_MAX) return json({ error: "Part too large." }, 413);
  const mpu = env.BUCKET.resumeMultipartUpload(key, uploadId);
  const uploaded = await mpu.uploadPart(part, request.body);
  return json({ partNumber: uploaded.partNumber, etag: uploaded.etag });
}

async function mpuComplete(request, env) {
  // No window check here: if every part arrived in time, let the file finish.
  const { key, uploadId, parts } = await readJson(request);
  if (!validKey(key) || !uploadId || !Array.isArray(parts) || parts.length === 0) {
    return json({ error: "Bad complete request." }, 400);
  }
  const clean = parts
    .map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag || "") }))
    .sort((a, b) => a.partNumber - b.partNumber);
  const mpu = env.BUCKET.resumeMultipartUpload(key, uploadId);
  const obj = await mpu.complete(clean);
  return json({ key, size: obj.size });
}

async function mpuAbort(request, env) {
  const { key, uploadId } = await readJson(request);
  if (!validKey(key) || !uploadId) return json({ error: "Bad abort request." }, 400);
  try {
    await env.BUCKET.resumeMultipartUpload(key, uploadId).abort();
  } catch {
    /* already gone */
  }
  return json({ ok: true });
}

async function thumbUpload(request, env, url) {
  if (!(await canUpload(request, env))) return closedResponse(env);
  const key = url.searchParams.get("key");
  const m = validKey(key) && KEY_RE.exec(key);
  if (!m) return json({ error: "Bad thumbnail request." }, 400);
  const len = contentLength(request);
  if (!len) return json({ error: "Empty thumbnail." }, 411);
  if (len > THUMB_MAX) return json({ error: "Thumbnail too large." }, 413);
  if (!(await env.BUCKET.head(key))) return json({ error: "Original not found." }, 404);
  await env.BUCKET.put("thumbs/" + m[1] + ".jpg", request.body, {
    httpMetadata: { contentType: "image/jpeg" },
  });
  return json({ ok: true });
}

// ===========================================================================
//  Admin auth (stateless signed cookie — no database needed)
// ===========================================================================

const enc = new TextEncoder();

async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cookie(url, value, maxAge) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

async function login(request, env, url) {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: "ADMIN_PASSWORD is not set. See the README, step 'Set the admin password'." }, 500);
  }
  const { password } = await readJson(request);
  // Compare hashes so the comparison time doesn't depend on the password.
  const ok = safeEqual(await hmac("pw", String(password || "")), await hmac("pw", env.ADMIN_PASSWORD));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return json({ error: "Wrong password." }, 401);
  }
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const token = exp + "." + (await hmac(env.ADMIN_PASSWORD, "admin:" + exp));
  return json({ ok: true }, 200, { "Set-Cookie": cookie(url, token, SESSION_DAYS * 86400) });
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const raw = request.headers.get("Cookie") || "";
  const m = new RegExp("(?:^|;\\s*)" + COOKIE + "=(\\d+)\\.([a-f0-9]{64})").exec(raw);
  if (!m) return false;
  if (Number(m[1]) < Date.now()) return false;
  return safeEqual(m[2], await hmac(env.ADMIN_PASSWORD, "admin:" + m[1]));
}

// ===========================================================================
//  Admin: files
// ===========================================================================

function decode(s) {
  try {
    return decodeURIComponent(s || "");
  } catch {
    return s || "";
  }
}

async function listAll(env, options) {
  const out = [];
  let cursor;
  do {
    const page = await env.BUCKET.list({ ...options, cursor, limit: 1000 });
    out.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

async function listFiles(env) {
  const cfg = config(env);
  const objects = await listAll(env, { include: ["customMetadata", "httpMetadata"] });
  const thumbs = new Set();
  let totalBytes = 0;
  for (const o of objects) {
    totalBytes += o.size;
    if (o.key.startsWith("thumbs/")) thumbs.add(o.key.slice(7, -4));
  }
  const files = [];
  const guests = new Set();
  let photos = 0;
  let videos = 0;
  for (const o of objects) {
    const m = KEY_RE.exec(o.key);
    if (!m) continue;
    const meta = o.customMetadata || {};
    const type = (o.httpMetadata && o.httpMetadata.contentType) || "";
    const guest = decode(meta.guest);
    guests.add(guest || "(no name)");
    if (type.startsWith("video/")) videos++;
    else photos++;
    files.push({
      key: o.key,
      id: m[1],
      size: o.size,
      type,
      guest,
      filename: decode(meta.filename) || o.key.slice(8),
      uploadedAt: meta.uploadedAt || o.uploaded,
      hasThumb: thumbs.has(m[1]),
    });
  }
  files.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  return json({
    files,
    stats: {
      totalBytes,
      limitBytes: cfg.storageLimitGB * 1e9,
      fileCount: files.length,
      guestCount: guests.size,
      photos,
      videos,
    },
  });
}

async function getFile(request, env, url) {
  const key = url.searchParams.get("key");
  if (!validKey(key)) return json({ error: "Bad key." }, 400);
  const obj = await env.BUCKET.get(key, { range: request.headers, onlyIf: request.headers });
  if (!obj) return json({ error: "Not found." }, 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("ETag", obj.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=3600");
  const filename = decode(obj.customMetadata && obj.customMetadata.filename) || key.slice(8);
  const disposition = url.searchParams.get("dl") ? "attachment" : "inline";
  headers.set(
    "Content-Disposition",
    `${disposition}; filename="${filename.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );

  if (!("body" in obj) || !obj.body) return new Response(null, { status: 304, headers });

  let status = 200;
  if (obj.range && request.headers.has("Range")) {
    let offset;
    let length;
    if (typeof obj.range.suffix === "number") {
      length = Math.min(obj.range.suffix, obj.size);
      offset = obj.size - length;
    } else {
      offset = obj.range.offset || 0;
      length = obj.range.length ?? obj.size - offset;
    }
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("Content-Length", String(length));
    status = 206;
  } else {
    headers.set("Content-Length", String(obj.size));
  }
  return new Response(obj.body, { status, headers });
}

async function getThumb(env, url) {
  const key = url.searchParams.get("key");
  const m = validKey(key) && KEY_RE.exec(key);
  if (!m) return json({ error: "Bad key." }, 400);
  const obj = await env.BUCKET.get("thumbs/" + m[1] + ".jpg");
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
  });
}

async function deleteFile(env, url) {
  const key = url.searchParams.get("key");
  const m = validKey(key) && KEY_RE.exec(key);
  if (!m) return json({ error: "Bad key." }, 400);
  await env.BUCKET.delete([key, "thumbs/" + m[1] + ".jpg"]);
  return json({ ok: true });
}

async function deleteAll(request, env) {
  const { confirm } = await readJson(request);
  if (confirm !== "DELETE") return json({ error: 'Type DELETE to confirm.' }, 400);
  let deleted = 0;
  for (const prefix of ["uploads/", "thumbs/"]) {
    const objects = await listAll(env, { prefix });
    for (let i = 0; i < objects.length; i += 1000) {
      const keys = objects.slice(i, i + 1000).map((o) => o.key);
      await env.BUCKET.delete(keys);
      deleted += keys.length;
    }
  }
  return json({ ok: true, deleted });
}

async function putHeader(request, env) {
  const len = contentLength(request);
  const type = String(request.headers.get("Content-Type") || "");
  if (!len) return json({ error: "Empty image." }, 411);
  if (len > HEADER_MAX) return json({ error: "Header photo must be under 15 MB." }, 413);
  if (!type.startsWith("image/")) return json({ error: "Please choose an image." }, 415);
  await env.BUCKET.put(HEADER_KEY, request.body, { httpMetadata: { contentType: type } });
  return json({ ok: true });
}

// ===========================================================================
//  Helpers
// ===========================================================================

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
