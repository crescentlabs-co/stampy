/**
 * Minimal APNs client for Wallet pass updates, using Node's built-in HTTP/2
 * and a .p8 token (ES256 JWT) — no native dependencies.
 *
 * Pass-update pushes are special: the payload is EMPTY. The push just tells
 * the device "this pass changed"; the device then fetches the fresh .pkpass
 * from our web service, and iOS renders the changeMessage banner itself.
 */
import http2 from "node:http2";
import jwt from "jsonwebtoken";
import { config, setupStatus } from "./config.js";

const APNS_HOST = "https://api.push.apple.com"; // Wallet passes always use production APNs

let cachedJwt: { token: string; issuedAt: number } | null = null;

function apnsJwt(): string {
  // APNs rejects tokens older than 60 min; refresh after 45.
  if (cachedJwt && Date.now() - cachedJwt.issuedAt < 45 * 60 * 1000) return cachedJwt.token;
  const key = Buffer.from(config.apnsKeyB64, "base64").toString("utf8");
  const token = jwt.sign({}, key, {
    algorithm: "ES256",
    issuer: config.teamId,
    header: { alg: "ES256", kid: config.apnsKeyId },
  });
  cachedJwt = { token, issuedAt: Date.now() };
  return token;
}

export interface PushResult {
  token: string;
  ok: boolean;
  status: number;
  reason?: string;
}

/** Sends an empty pass-update push to one device token. */
export function pushToDevice(pushToken: string): Promise<PushResult> {
  return new Promise((resolve) => {
    const client = http2.connect(APNS_HOST);
    client.on("error", () =>
      resolve({ token: pushToken, ok: false, status: 0, reason: "connect-error" }),
    );

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${pushToken}`,
      authorization: `bearer ${apnsJwt()}`,
      "apns-topic": config.passTypeId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let status = 0;
    let body = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      client.close();
      let reason: string | undefined;
      if (body) {
        try {
          reason = (JSON.parse(body) as { reason?: string }).reason;
        } catch {
          reason = body.slice(0, 200);
        }
      }
      resolve({ token: pushToken, ok: status === 200, status, reason });
    });
    req.on("error", () => {
      client.close();
      resolve({ token: pushToken, ok: false, status: 0, reason: "stream-error" });
    });

    req.end(JSON.stringify({ aps: {} }));
  });
}

/** Pushes to every device registered for a pass. Never throws — returns per-token results. */
export async function pushPassUpdate(pushTokens: string[]): Promise<PushResult[]> {
  if (!setupStatus().canPush) {
    return pushTokens.map((t) => ({ token: t, ok: false, status: 0, reason: "apns-not-configured" }));
  }
  return Promise.all(pushTokens.map((t) => pushToDevice(t)));
}
