# Ethos Solutions — Requisition Ledger (self-hosted version)

This is the same requisition tracker you tested inside Claude, rebuilt as a
real, standalone web app. It runs on Vercel, with a small database (Vercel's
Upstash/KV integration) standing in for Claude's storage. Once deployed,
**anyone with the link can use it — no Claude account, no login of any kind.**

## What's in this project

- `pages/index.js` — the page itself (loads the tool's markup + styles)
- `pages/api/storage.js` — a tiny API that reads/writes three pieces of data
  (requisitions, the standard title list, and the approver access code)
- `public/app.js` — all the tool's logic (unchanged from the Claude version,
  except it now calls `/api/storage` instead of Claude's `window.storage`)
- `public/ethos-logo.png` — your logo
- `styles/globals.css` — all the styling

You should not need to edit any of this to get it running. Everything below
is done in the Vercel and GitHub **websites**, not in this code.

## Step 1 — Put this project on GitHub

1. Go to [github.com](https://github.com) and sign up if you don't have an
   account (it's free).
2. Click **New repository**. Name it something like `ethos-requisitions`.
   Leave it empty (no README, no .gitignore — this project already has one).
3. On your own computer, open a terminal in this folder and run:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/ethos-requisitions.git
   git push -u origin main
   ```

   (Replace the URL with the one GitHub shows you after creating the repo.)

   If you don't have `git` installed or this feels unfamiliar, GitHub also
   lets you drag-and-drop the whole folder into the repo through the website
   — look for "uploading an existing file" on the new repo's page.

## Step 2 — Deploy it on Vercel

1. Go to [vercel.com](https://vercel.com) and sign up (free) — easiest is to
   sign up **with your GitHub account**, so the two are already connected.
2. Click **Add New → Project**.
3. Choose the `ethos-requisitions` repo you just pushed. Click **Import**.
4. Leave all the build settings as-is (Vercel auto-detects Next.js). Click
   **Deploy**.
5. Wait about a minute. You'll get a live URL like
   `https://ethos-requisitions.vercel.app`.

At this point the page will load, but adding a requisition will fail —
that's expected, because the database isn't connected yet. That's Step 3.

## Step 3 — Add the database (Vercel KV / Upstash)

1. In your new project on Vercel, click the **Storage** tab.
2. Click **Create Database**, choose **Upstash** (Redis), and follow the
   prompts — the free tier is enough for this tool.
3. When asked which project to connect it to, choose this one
   (`ethos-requisitions`). Vercel will automatically add two environment
   variables to your project: `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` — this is exactly what `pages/api/storage.js`
   expects, so you don't need to type anything in yourself.
4. Go to your project's **Deployments** tab and click **Redeploy** on the
   latest deployment, so the new environment variables take effect.

That's it — the live URL now works fully: adding, editing, and deleting
requisitions all persist in the database, for everyone who opens the link.

## Updating the tool later

Any time you want changes (new fields, new departments, styling, etc.),
bring the request back to Claude, get the updated files, replace the
changed files in this project folder, then:

```bash
git add .
git commit -m "Update tool"
git push
```

Vercel automatically redeploys within about a minute of every push — same
link, updated content.

## The approver access code

The default code is `ETHOS-HR-2026` (same as the Claude version). You can
change it any time from the "Approver access code" button in the app itself
— it's stored in the database, not in this code, so changing it doesn't
require touching any files or redeploying.

## Notes / honest limitations

- This app has **no login system** — anyone with the link can view, add,
  edit, and delete requisitions. That was already true when it was hosted on
  Claude; it's still true here. If you need real per-person accounts and
  permissions down the road, that's a meaningfully bigger project (adding
  authentication), not a small follow-up — let Claude know if you want to
  plan that out.
- The free tiers of Vercel and Upstash are generous and should comfortably
  cover a small internal tool like this one. If usage ever grows a lot,
  Vercel will prompt you to upgrade — it won't silently break.
