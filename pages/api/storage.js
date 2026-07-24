// pages/api/storage.js
//
// Minimal key-value storage API backed by Vercel's Redis (Redis Cloud)
// integration, which injects a single connection string:
//   STORAGE_REDIS_URL
//
// We reuse one Redis client across warm serverless invocations instead
// of reconnecting on every request (reconnecting every time works, but
// is slower and can exhaust connections under load).

import { createClient } from "redis";

const ALLOWED_KEYS = new Set(["requisitions", "customTitles", "approverPasscode"]);

function keyFor(key) {
  return `ethos-req:${key}`;
}

// Cache the client on the global object so it survives across
// invocations of the same warm serverless instance.
let clientPromise = global._redisClientPromise;

function getClient() {
  if (!clientPromise) {
    const client = createClient({ url: process.env.STORAGE_REDIS_URL });
    client.on("error", (err) => console.error("Redis client error", err));
    clientPromise = client.connect().then(() => client);
    global._redisClientPromise = clientPromise;
  }
  return clientPromise;
}

export default async function handler(req, res) {
  const { method } = req;

  let client;
  try {
    client = await getClient();
  } catch (err) {
    console.error("Redis connection failed", err);
    return res.status(500).json({ error: "Could not connect to storage" });
  }

  if (method === "GET") {
    const key = req.query.key;
    if (!key || !ALLOWED_KEYS.has(key)) {
      return res.status(400).json({ error: "Invalid or missing key" });
    }
    try {
      const value = await client.get(keyFor(key));
      if (value === null || value === undefined) {
        return res.status(404).json({ error: "Not found" });
      }
      return res.status(200).json({ key, value });
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
      await client.set(keyFor(key), value);
      return res.status(200).json({ key, value });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Storage write failed" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: `Method ${method} not allowed` });
}
