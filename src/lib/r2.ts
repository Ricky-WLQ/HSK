import { AwsClient } from "aws4fetch";

// Cloudflare R2 (S3-compatible) access for the TTS audio bank. Server-only:
// credentials come from env and never reach the client. The bucket is private;
// audio is streamed back through the authenticated app, not served publicly.
const ENDPOINT = process.env.R2_ENDPOINT;
const BUCKET = process.env.R2_BUCKET;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

let _client: AwsClient | null = null;
function client(): AwsClient | null {
  if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) return null;
  if (!_client) {
    _client = new AwsClient({
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
      region: "auto",
      service: "s3",
    });
  }
  return _client;
}

export function r2Configured(): boolean {
  return Boolean(ENDPOINT && BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY);
}

function urlFor(key: string): string {
  return `${ENDPOINT}/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Fetch an object's bytes, or null if missing / not configured / on error. */
export async function r2Get(key: string): Promise<ArrayBuffer | null> {
  const c = client();
  if (!c) return null;
  const res = await c.fetch(urlFor(key), { method: "GET" });
  if (res.status === 200) return await res.arrayBuffer();
  return null;
}

/** Store an object. Returns whether it succeeded (best-effort; never throws). */
export async function r2Put(
  key: string,
  body: ArrayBuffer,
  contentType = "audio/mpeg",
): Promise<boolean> {
  const c = client();
  if (!c) return false;
  try {
    const res = await c.fetch(urlFor(key), {
      method: "PUT",
      body,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}
