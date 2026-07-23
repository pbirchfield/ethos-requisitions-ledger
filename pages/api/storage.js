// pages/api/storage.js
//
// Minimal key-value storage API, backed by Upstash Redis (via the
// Vercel KV / Upstash marketplace integration). This mirrors the shape
// of Claude's window.storage.get/set so the frontend code barely changed.
//
// Env vars required (auto-added if you use the Vercel "Upstash" or "KV"
// integration from your project's Storage tab):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Only these keys can be read/written — prevents this endpoint from
// being used as an arbitrary key-value store by a stray request.
const ALLOWED_KEYS = new Set(["requisitions", "customTitles", "approverPasscode"]);

function keyFor(key) {
  return `ethos-req:${key}`;
}

export default async function handler(req, res) {
  const { method } = req;

  if (method === "GET") {
    const key = req.query.key;
    if (!key || !ALLOWED_KEYS.has(key)) {
      return res.status(400).json({ error: "Invalid or missing key" });
    }
    try {
      const value = await redis.get(keyFor(key));
      if (value === null || value === undefined) {
        return res.status(404).json({ error: "Not found" });
      }
      // Upstash may already return a parsed object; normalize to a string
      // the same way window.storage did, so JSON.parse() on the client works.
      const stringValue = typeof value === "string" ? value : JSON.stringify(value);
      return res.status(200).json({ key, value: stringValue });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Storage read failed" });
    }
  }

  if (method === "POST") {
    const { key, value } = req.body || {};
    if (!key || !ALLOWED_KEYS.has(key)) {
      return res.status(400).json({ error: "Invalid or missing key" });
    }
    if (typeof value !== "string") {
      return res.status(400).json({ error: "Value must be a string" });
    }
    try {
      await redis.set(keyFor(key), value);
      return res.status(200).json({ key, value });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Storage write failed" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: `Method ${method} not allowed` });
}
