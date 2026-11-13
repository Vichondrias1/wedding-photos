# 💍 Wedding Photo Collector

A private website where your guests upload the photos and videos they take at your wedding — **no app, no sign-up, original quality** — and you download them all at once afterwards, sorted into one folder per guest.

It runs on your own free Cloudflare account, so there's no subscription and nobody else has your photos.

- **Guests** scan a QR code on the table → type their name (optional) → pick photos & videos → done. Big videos (up to 5 GB each) are fine.
- **You** get an admin page with a gallery, a video player, a per-guest filter, a storage meter, and a **Download all** button that saves everything as one zip.
- **Printable QR table cards** (4×6 inches) are built in.

> This guide is written for people who have never deployed a website. Follow it top to bottom; it takes about 45 minutes. Do it **at least two weeks before the wedding** so you have time to test.

---

## Contents

1. [What it costs](#1-what-it-costs)
2. [What you need](#2-what-you-need)
3. [Create a Cloudflare account](#3-create-a-cloudflare-account)
4. [Turn on R2 storage and add a $1 budget alert](#4-turn-on-r2-storage-and-add-a-1-budget-alert)
5. [Make your own copy of this project](#5-make-your-own-copy-of-this-project)
6. [Install the tools on your computer](#6-install-the-tools-on-your-computer)
7. [Put in your wedding details](#7-put-in-your-wedding-details)
8. [Install and deploy](#8-install-and-deploy)
9. [Set the admin password](#9-set-the-admin-password)
10. [Choose your web address](#10-choose-your-web-address)
11. [Test with real phones](#11-test-with-real-phones)
12. [Print the QR cards](#12-print-the-qr-cards)
13. [On the wedding day](#13-on-the-wedding-day)
14. [After the wedding](#14-after-the-wedding)
15. [Troubleshooting](#15-troubleshooting)
16. [How it works (for the curious)](#16-how-it-works-for-the-curious)

---

## 1. What it costs

**Almost certainly $0.** Everything runs on Cloudflare's free tiers:

| What | Free every month | What it means for you |
|---|---|---|
| R2 storage | **10 GB-month** | See below — this is the only limit that matters |
| R2 "Class A" operations (uploads, listing) | 1,000,000 | Thousands of times more than a wedding needs |
| R2 "Class B" operations (viewing, downloading) | 10,000,000 | Same |
| R2 egress (downloading your files) | **Free, unlimited** | Downloading everything costs nothing |
| Workers requests | 100,000 per day | Plenty |

**About "GB-month":** storage is measured as an *average over the month*. 10 GB kept for a whole month = 10 GB-month. But **60 GB kept for 5 days** is also about 10 GB-month (60 × 5 ÷ 30). So:

> ✅ **Download everything and delete it within about 5 days of the event, and you stay at $0** — even if guests upload a lot of video.

If you go over, the price is $0.015 per GB-month. Even 100 GB kept for a whole week costs about $0.30. The $1 budget alert in step 4 tells you long before it matters.

For reference: a phone photo is 2–6 MB, one minute of 4K video is about 350–400 MB, and 1080p is about 100–130 MB per minute.

---

## 2. What you need

- A computer (Windows or Mac) for setup. Guests only need their phones.
- A free [GitHub](https://github.com) account (where your copy of the code lives).
- A free [Cloudflare](https://dash.cloudflare.com/sign-up) account (where the website and photos live).
- A credit/debit card — Cloudflare asks for one to turn on R2, even on the free tier. You won't be charged if you follow this guide.

---

## 3. Create a Cloudflare account

1. Go to <https://dash.cloudflare.com/sign-up> and sign up with your email.
2. Verify your email address (check your inbox).
3. You don't need to add a website/domain. If Cloudflare asks, skip that step.

---

## 4. Turn on R2 storage and add a $1 budget alert

### Turn on R2

1. In the Cloudflare dashboard, open **Storage & databases → R2** in the left menu (on older layouts it's just **R2**).
2. Click **Purchase R2 plan** / **Enable R2**. Add your card and confirm the **free** plan. You won't be charged unless you go over the free amounts above.

You don't need to create a bucket by hand — step 8 does it for you.

### Add a $1 budget alert (strongly recommended)

This emails you if your bill ever goes above $1, so a surprise can't happen.

1. Click your account name (top right) → **Billing** (or **Manage account → Billing**).
2. Find **Budget alerts** (or **Billing notifications**) and create one for **$1**.
3. If you can't find it, go to **Notifications → Add → Usage-based billing**, choose **R2 storage**, and set a low threshold such as 15 GB.

Cloudflare moves menus around now and then. If a name above doesn't match exactly, look for the closest one.

---

## 5. Make your own copy of this project

1. Make sure you're logged in to GitHub.
2. On this project's GitHub page, click the green **Use this template** button → **Create a new repository**.
3. Give it a name (for example `our-wedding-photos`).
4. Choose **Private**. Your names, date and venue go into the code, and a private repo keeps them off the public internet. (If you want a public repo, see [Option B](#option-b-public-repo--keep-your-details-out-of-github) in step 7.)
5. Click **Create repository**.

---

## 6. Install the tools on your computer

You need two free programs: **Node.js** (runs the setup commands) and **Git** (downloads your code).

### Windows

1. Install **Node.js LTS** from <https://nodejs.org> (the big green "LTS" button). Click Next through the installer with the default options.
2. Install **Git** from <https://git-scm.com/download/win>. The default options are fine.
3. Open **PowerShell**: press the Windows key, type `PowerShell`, press Enter.

### Mac

1. Install **Node.js LTS** from <https://nodejs.org> (the "LTS" download, then open the `.pkg`).
2. Open **Terminal**: press ⌘ + Space, type `Terminal`, press Enter.
3. Type `git --version` and press Enter. If your Mac offers to install the "command line developer tools", click **Install** and wait for it to finish.

### Check it worked (both)

Type these one at a time and press Enter after each. Each should print a version number:

```bash
node --version
```

```bash
git --version
```

### Download your copy

On your new repository's GitHub page, click the green **Code** button and copy the HTTPS link. Then in PowerShell/Terminal (replace the link with yours):

```bash
cd Desktop
```

```bash
git clone https://github.com/YOUR-USERNAME/our-wedding-photos.git
```

```bash
cd our-wedding-photos
```

A folder called `our-wedding-photos` is now on your Desktop. **Keep PowerShell/Terminal open in this folder for the rest of the guide.** If you close it, open it again and run `cd Desktop/our-wedding-photos`.

> **Private repo and git asks for a password?** GitHub no longer accepts your account password here. The easiest fix is to install [GitHub Desktop](https://desktop.github.com), sign in, and use **File → Clone repository** instead.

---

## 7. Put in your wedding details

All your details live in **one file**: `src/config.js`. Open it in any text editor (Notepad on Windows, TextEdit on Mac, or the free [VS Code](https://code.visualstudio.com)).

| Setting | What it is | Example |
|---|---|---|
| `coupleNames` | Big title on the page | `"Alex & Sam"` |
| `weddingDate` | Shown under the names, exactly as you type it | `"September 18, 2027"` |
| `venue` | Shown next to the date (`""` to hide) | `"The Garden Pavilion"` |
| `welcomeMessage` | A short line for guests | `"Thank you for celebrating with us!…"` |
| `uploadOpens` | When guests can start uploading | `"2027-09-18T12:00:00-04:00"` |
| `uploadCloses` | When uploads stop | `"2027-09-25T23:59:59-04:00"` |
| `timezone` | Your time zone, for showing dates | `"America/New_York"`, `"Asia/Manila"`, `"Europe/London"` |
| `colors` | Background, buttons, text, and an accent for thin lines & the QR card border | ivory `#FBF8F1`, sage `#7D8F69` |
| `font` | `"serif"` (elegant) or `"modern"` | `"serif"` |
| `headerPhoto` | Optional photo at the top (`""` for none) | `"https://…/us.jpg"` or `"/header.jpg"` |
| `siteUrl` | Optional: the link printed on the QR card | `""` (uses the site's own address) |

**About the upload times:** the part after the time (`-04:00`, `+08:00`) is your time zone's offset from UTC. Manila is `+08:00`, New York is `-04:00` in summer and `-05:00` in winter, London is `+01:00` in summer. If you're not sure, search "UTC offset" plus your city and the wedding date. Outside the window, guests see "Uploads open on …" or "Uploads are closed" instead of the upload button.

**Header photo:** the easiest way is to leave it `""` and upload a photo later from the admin page (**Settings & clean-up → Header photo**). Or put an image file in the `public` folder (for example `public/header.jpg`) and set `headerPhoto: "/header.jpg"`.

Keep the quote marks and commas exactly as they are. Save the file.

### Option A: private repo (simplest)

Just edit `src/config.js` as above. To save the change to GitHub (optional, but a good backup):

```bash
git commit -am "Our wedding details"
```

```bash
git push
```

### Option B: public repo — keep your details out of GitHub

Leave `src/config.js` with the placeholder values and keep your real details in a file that never leaves your computer:

1. Copy `.dev.vars.example` to a new file called `.dev.vars` (same folder, note the dot at the start).
   - Windows: `copy .dev.vars.example .dev.vars`
   - Mac: `cp .dev.vars.example .dev.vars`
2. Open `.dev.vars` and fill in your real values. It's already listed in `.gitignore`, so git will never upload it.
3. After you deploy (step 8), run `npm run push-secrets`. This uploads every line of `.dev.vars` to Cloudflare as encrypted settings. Run it again whenever you change `.dev.vars`.

You can also type the same names (`COUPLE_NAMES`, `WEDDING_DATE`, …) into the Cloudflare dashboard under **Workers & Pages → wedding-photos → Settings → Variables and Secrets**. They're kept when you redeploy.

Your details still appear on the live website — that's the point — just not in your GitHub repo.

---

## 8. Install and deploy

Run these in PowerShell (Windows) or Terminal (Mac), inside your project folder. The commands are the same on both.

**1. Install the project's tools** (takes a minute):

```bash
npm install
```

**2. Log in to Cloudflare** — a browser window opens; click **Allow**:

```bash
npx wrangler login
```

**3. Create the storage bucket** (only once):

```bash
npx wrangler r2 bucket create wedding-photos
```

**4. Put your website online:**

```bash
npm run deploy
```

At the end it prints your address, like `https://wedding-photos.your-name.workers.dev`. Open it — you should see your names.

Whenever you change `src/config.js` later, run `npm run deploy` again.

> **Using Option B?** Now run `npm run push-secrets` (and answer **yes** if it asks to create the Worker).

---

## 9. Set the admin password

The admin page (`/admin`) is protected by a password that only lives in Cloudflare — it's never in your files.

```bash
npx wrangler secret put ADMIN_PASSWORD
```

Type a **long** password (at least 4 random words, like `maple-violin-harbor-sunrise`) and press Enter. Nothing shows while you type — that's normal.

Now open `https://YOUR-ADDRESS/admin` and log in. You stay logged in on that device for 30 days.

To change the password later, run the same command again.

> **Using Option B?** If `.dev.vars` contains `ADMIN_PASSWORD`, `npm run push-secrets` also sets it. Put your real password there, or delete that line and use the command above.

---

## 10. Choose your web address

Pick your final address **before you print QR cards** — changing it later breaks the printed codes.

### Option 1: free `workers.dev` address

Your site is at `https://wedding-photos.YOUR-SUBDOMAIN.workers.dev`. `YOUR-SUBDOMAIN` is chosen once for your whole Cloudflare account (it defaults to something based on your email).

To change it: Cloudflare dashboard → **Workers & Pages** → on the right side find **Subdomain** (or **Account details → Subdomain**) → **Change**. Something like `alexandsam` gives `https://wedding-photos.alexandsam.workers.dev`. It can take a few minutes to start working.

To change the `wedding-photos` part, edit `name = "wedding-photos"` in `wrangler.toml` (for example `name = "photos"`) and run `npm run deploy` again.

### Option 2: your own domain (looks nicer, costs ~$10/year)

If you own a domain (for example `alexandsam.com`) and it's managed by Cloudflare:

1. Cloudflare dashboard → **Workers & Pages** → **wedding-photos** → **Settings** → **Domains & Routes** → **Add** → **Custom domain**.
2. Type something like `photos.alexandsam.com` and confirm. HTTPS is set up for you automatically.

Optionally put that address in `siteUrl` in `src/config.js` (or `SITE_URL` in `.dev.vars`) so the QR card uses it by default.

---

## 11. Test with real phones

Do this a week or two before the wedding, with at least **one iPhone and one Android**.

Before the upload window opens, guests can't upload — but **you can, if you're logged in as admin on that phone**:

1. On the phone, open `https://YOUR-ADDRESS/admin` and log in.
2. Open `https://YOUR-ADDRESS/` (or tap **Upload page** on the admin page). You'll see "You're logged in as admin — uploads work even outside the upload window."
3. Upload a few photos **and a long video** (over 1 minute). Watch the progress bars.
4. Try switching to another app mid-upload, then come back. Try turning on airplane mode for a few seconds — it should retry, or show **Tap to retry**.
5. On your computer, open `/admin`: check the photos appear with thumbnails, the video plays, and the guest name is right.
6. Try **Download all** on your computer.
7. When you're happy, go to **Settings & clean-up → Delete all uploads…** and type `DELETE` to clear the test files.

To check what a normal guest sees, open the address in a private/incognito window.

**iPhone tip:** iOS sometimes converts photos to JPEG or videos to a more compatible format when you pick them in a browser. Photos still come through at full resolution. If you want the absolute originals from an iPhone, the guest can set **Settings → Photos → Transfer to Mac or PC → Keep Originals** — but most guests won't, and that's fine.

---

## 12. Print the QR cards

1. Log in at `/admin`, then click **QR card**.
2. Check the link under the code is your final address (edit it there if needed), and change the headline if you like.
3. Click **Print**. In the print dialog choose:
   - Paper size **4 × 6 in** (10 × 15 cm). Many printers have this as a "photo" size; a print shop can also print it.
   - Margins **None**, scale **100%**, and turn on **Background graphics**.
4. Print **one test card first**, scan it with two different phones, and make sure it opens your site.

Tip: to print on regular paper, choose **Save as PDF**, then print that PDF at 100% on letter/A4 paper and cut it out.

---

## 13. On the wedding day

- Put a QR card on every table, plus one at the entrance and the bar.
- Ask your host/MC to mention it: "Scan the card on your table to share your photos!"
- Venue Wi-Fi helps a lot with videos. Print the Wi-Fi name and password near the QR code if you can.
- Guests should keep the page open until everything finishes. The page keeps the screen awake and warns them if they try to leave. If an upload fails, it retries on its own, and they can **Tap to retry**.
- Peek at `/admin` from your phone to watch photos arrive. Check the storage meter.
- Guests who forget can still upload until the window closes (`uploadCloses`), from home.

---

## 14. After the wedding

Do this **within about 5 days** of the event to stay free (see [What it costs](#1-what-it-costs)).

### 1. Download everything

On a **computer**, open `/admin` in **Google Chrome** or **Microsoft Edge** and click **Download all (.zip)**. Pick where to save it; the zip is written straight to disk, so it works even for many GB. Inside there's one folder per guest, with the original filenames.

Keep the tab open until it says **Done**. It can take a while for large weddings — it's downloading everything.

In Safari or Firefox you'll get one button per guest instead (each guest's zip is built in memory, so very large ones may fail — use Chrome or Edge if that happens). You can also open any photo and click **Download**.

### 2. Back it up

Unzip it and check a few photos and videos open. Then keep **at least two copies**, for example an external drive plus Google Photos, iCloud, OneDrive or Dropbox.

### 3. Delete the files from Cloudflare

Only after your backups are safe: in `/admin`, **Settings & clean-up → Delete all uploads…** → type `DELETE`.

### 4. (Optional) Remove everything

- Delete the bucket: Cloudflare dashboard → **R2** → **wedding-photos** → **Settings** → **Delete bucket** (it must be empty first).
- Delete the website: **Workers & Pages** → **wedding-photos** → **Settings** → **Delete**.

### Alternative for big collections: rclone

For very large collections (50 GB+), the free tool [rclone](https://rclone.org/s3/#cloudflare-r2) can copy the whole bucket to your computer and resume if interrupted. Create an R2 API token (**R2 → Manage R2 API Tokens → Create**, read-only), follow rclone's Cloudflare R2 instructions, then run `rclone copy r2:wedding-photos ./wedding-backup`. Files arrive with ID names (the guest name and original filename are stored as metadata), so the zip download is friendlier for most people.

---

## 15. Troubleshooting

| Problem | Fix |
|---|---|
| `npm` or `node` "is not recognized" / "command not found" | Install Node.js (step 6), then **close and reopen** PowerShell/Terminal. |
| `npx wrangler login` doesn't open a browser | Copy the link it prints into your browser. |
| Deploy says the bucket `wedding-photos` doesn't exist | Run `npx wrangler r2 bucket create wedding-photos`. If R2 isn't enabled, do step 4 first. |
| Deploy error about R2 not being enabled / a payment method | Finish step 4 (turn on R2 in the dashboard). |
| Admin login says `ADMIN_PASSWORD is not set` | Run `npx wrangler secret put ADMIN_PASSWORD` (step 9). |
| "Wrong password" | Run `npx wrangler secret put ADMIN_PASSWORD` again to reset it. |
| Guests see "Uploads open on …" during the wedding | Check `uploadOpens` / `uploadCloses` and their `+HH:MM` offset, then redeploy (or re-run `npm run push-secrets` for Option B). |
| My config changes don't show up | Run `npm run deploy`. Option B: re-run `npm run push-secrets`. A value set in the dashboard or `.dev.vars` beats `config.js`. |
| `*.workers.dev` address doesn't load | New subdomains take a few minutes. Check **Workers & Pages → wedding-photos → Settings → Domains & Routes** that `workers.dev` is enabled. |
| An upload keeps failing | Usually weak signal. Tap **Tap to retry** on better Wi-Fi. Files over 5 GB aren't supported. |
| A photo or video has no thumbnail | The phone couldn't make one (common for some HEVC videos or HEIC photos). The file itself is fine — click it to view or download. |
| Video won't play in the admin page | Some formats (for example HEVC `.mov` from iPhones) only play in Safari or Edge. Download it and play it on your computer. |
| "Download all" only shows per-guest buttons | Your browser can't stream to disk. Use Chrome or Edge on a computer. |
| The download stopped halfway | Click **Download all** again and save over the old file. Nothing is deleted from Cloudflare until you choose to. |
| Storage meter is red | You're over 10 GB. That's fine for a few days — just download and delete soon (see costs). |

### Testing locally (optional, for tinkerers)

`npm run dev` runs the site at <http://localhost:8787> with a fake local bucket, using `.dev.vars` for settings. With it running, `npm test` (in a second window) checks the whole API — uploads, multipart, thumbnails, listing, login and the upload window. **The tests delete every file in the local test bucket.**

---

## 16. How it works (for the curious)

- **One Cloudflare Worker** (`src/index.js`) serves the pages and a small API. **One R2 bucket** stores the files. There's no database: each file's guest name and original filename are saved as R2 metadata.
- **Uploads go at original quality.** Files up to 90 MB are sent in one request and streamed straight into R2. Bigger files (up to 5 GB) are split into 25 MB pieces with R2 multipart upload, because Workers accept at most 100 MB per request. Each phone uploads 3 files at a time, retries on its own, and resumes big files from the last piece that worked.
- **Thumbnails are made on the guest's phone** (a ~480 px JPEG, or a frame from a video) and saved to `thumbs/<id>.jpg`. The free Worker plan gives only ~10 ms of CPU per request, so the server never processes images.
- **Download all** fetches every file in your browser and builds the zip there, streaming it straight to disk.
- **Admin login** uses an HttpOnly cookie signed with your admin password, so nothing has to be stored.
- **Libraries are bundled in `public/vendor`** (no outside CDNs), so the site keeps working years from now: [client-zip](https://github.com/Touffy/client-zip) for zips, [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) for the QR code, and the [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant) font.
- Unfinished multipart uploads (a guest closed the page mid-video) are cleaned up by R2 automatically after 7 days.

### Files

| File | What it is |
|---|---|
| `src/config.js` | **Your wedding details** |
| `src/index.js` | The Worker (server) |
| `public/pages/guest.html` | Guest upload page (`/`) |
| `public/pages/admin.html` | Admin gallery (`/admin`) |
| `public/pages/card.html` | Printable QR card (`/admin/card`) |
| `public/app.css` | Shared styles |
| `public/vendor/` | Bundled libraries and fonts |
| `wrangler.toml` | Cloudflare settings (Worker name, bucket name) |
| `.dev.vars.example` | Template for keeping real details out of git |
| `test/api.test.mjs` | API tests (`npm test`) |

### Security notes

- Anyone with the link can upload during the upload window — that's how guests use it without an account. Outside the window, only you (logged in as admin) can.
- Only the admin can see, download or delete files. Guests can't see each other's uploads.
- Use a long admin password. There's no lockout after wrong guesses (that would need a database), though each wrong attempt is slowed down.

## License

MIT — use it for your wedding, your friends' weddings, birthdays, reunions… Bundled libraries keep their own licences (see `public/vendor/README.md`).
