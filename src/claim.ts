/**
 * The claim link — how a shop we built gets a login.
 *
 * Merchants are onboarded done-for-you: we agree over DM, build their card in
 * the admin console, and send them one link. Opening it shows the card we made
 * and asks for an email and a password; that creates their account, attaches it
 * to the merchant record that already exists, and drops them on a dashboard
 * that is already set up.
 *
 * It is a tokenised invite, NOT a login mechanism. After claiming, they sign in
 * with email and password like anyone else. That distinction matters: making
 * email a requirement to log in would break the boots-with-zero-secrets
 * invariant, because Resend is optional and an unconfigured deployment would
 * lock every owner out permanently.
 *
 * The token is a credential travelling through a DM, so:
 *   - only its sha256 hash is stored, exactly like a password-reset token, so a
 *     link that has been sent cannot be read back out of the database or out of
 *     a backup dump (which holds these rows);
 *   - it is random, never derived from the merchant id, so knowing a shop
 *     exists tells you nothing about how to claim it;
 *   - it is single-use and short-lived, and re-issuing replaces the old one,
 *     which is what makes "revoke" simply "issue another".
 */
import { createHash } from "node:crypto";

/** A week, as agreed. Long enough for a merchant to get round to it. */
export const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Store and compare the hash, never the token. */
export const hashClaimToken = (t: string): string =>
  createHash("sha256").update(t).digest("hex");
