/**
 * Google Wallet save/delete callbacks — the Android churn signal.
 *
 * Google POSTs here when a customer saves a pass to Google Wallet and again
 * when they delete it. Until this existed, Android churn was invisible: an
 * Android card that was added and one that was never opened looked identical,
 * and "did this message make people delete the card" could only ever be
 * answered about iPhones.
 *
 *   POST /google/callback?token=<GOOGLE_CALLBACK_SECRET>
 *
 * The founder pastes that URL into the Google Wallet Business Console once.
 *
 * ## What authenticates this, and what does not
 *
 * Google signs the body with ECv2 (an intermediate signing key, itself signed
 * by a rotating root key fetched from Google). **That signature is NOT verified
 * here.** Implementing ECv2 by hand is a large amount of subtle cryptography —
 * key rotation, a specific byte serialisation, intermediate key expiry — and
 * getting it subtly wrong produces something that looks verified and isn't,
 * which is worse than not claiming to verify at all.
 *
 * Instead, three things have to line up:
 *
 *  1. the shared secret in the URL, which only Google's console and Railway hold;
 *  2. `objectId` must resolve to a pass this server actually issued — the serial
 *     is a UUID, so it cannot be guessed;
 *  3. the nonce must not have been seen before, so a captured callback can't be
 *     replayed to fake repeated churn.
 *
 * The worst a forgery achieves is a wrong analytics row plus suppressing nudges
 * to one customer. That is the risk being accepted, deliberately and in writing.
 * If this ever gates something that matters, verify the signature properly first.
 */
import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { getPass, logEvent, seenGoogleNonce } from "../db.js";

export const googleCallbackRouter = Router();

/** Google's payload: an outer envelope whose signedMessage is a JSON string. */
interface SignedMessage {
  classId?: string;
  objectId?: string;
  eventType?: string;
  expTimeMillis?: number | string;
  nonce?: string;
}

function secretOk(given: string): boolean {
  const want = config.googleCallbackSecret;
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The serial is the last dot-separated segment of `<issuerId>.<serial>`, and a
 * serial is a UUID — which contains no dots, so splitting on the last one is
 * safe even if the issuer id ever gains a segment.
 */
export function serialFromObjectId(objectId: string): string {
  const at = objectId.lastIndexOf(".");
  return at === -1 ? objectId : objectId.slice(at + 1);
}

googleCallbackRouter.post("/callback", async (req, res) => {
  // 200 on every rejection below. Google retries a non-2xx with backoff for
  // hours, so an unconfigured or hostile caller must not turn into a retry
  // storm against an endpoint that will never accept it.
  if (!secretOk(String(req.query.token ?? ""))) {
    if (!config.googleCallbackSecret) {
      console.warn("[google-callback] refused: GOOGLE_CALLBACK_SECRET is not set in Railway");
    }
    return void res.status(200).json({ ok: false, reason: "callback-not-configured" });
  }

  const body = req.body as { signedMessage?: string } | undefined;
  let msg: SignedMessage;
  try {
    // signedMessage is a JSON *string* inside the envelope, not an object.
    msg = typeof body?.signedMessage === "string" ? JSON.parse(body.signedMessage) : {};
  } catch {
    return void res.status(200).json({ ok: false, reason: "unparseable" });
  }

  const objectId = String(msg.objectId ?? "");
  const eventType = String(msg.eventType ?? "").toLowerCase();
  const nonce = String(msg.nonce ?? "");
  if (!objectId || !eventType) return void res.status(200).json({ ok: false, reason: "incomplete" });

  const serial = serialFromObjectId(objectId);
  const pass = await getPass(serial);
  // An object id that names no pass of ours is either a forgery or a stale
  // object from another environment. Either way there is nothing to record.
  if (!pass) return void res.status(200).json({ ok: false, reason: "no-such-pass" });

  if (nonce && (await seenGoogleNonce(nonce))) {
    return void res.status(200).json({ ok: true, reason: "duplicate" });
  }

  // Google's vocabulary is "save" and "del"; ours is shared with Apple's
  // web service so both platforms answer the same question the same way.
  const type = eventType === "del" ? "pass_removed" : eventType === "save" ? "pass_added" : null;
  if (!type) return void res.status(200).json({ ok: false, reason: `unknown-event:${eventType}` });

  await logEvent(pass.card_id, serial, type, {
    actor: "customer",
    platform: "google",
    metadata: { platform_source: "google-callback", nonce, classId: msg.classId ?? "", eventType },
  });

  res.status(200).json({ ok: true });
});
