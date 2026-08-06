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
 *   - it is random, never derived from the merchant id, so knowing a shop
 *     exists tells you nothing about how to claim it;
 *   - it is single-use and short-lived, and re-issuing replaces the old one,
 *     which is what makes "revoke" simply "issue another" — and is also why
 *     the console has to warn before re-issuing, since the link already sent
 *     stops working the moment you do.
 *
 * **The token is stored in plain text, not only as a hash.** It began hash-only,
 * like a password-reset token, and that was given up deliberately: an operator
 * who closed the page had no way to find a link they had already sent, and their
 * only recourse was to mint a replacement — which silently killed the link in
 * the merchant's DM. Being able to re-read it is what removes that trap.
 *
 * What it costs, stated plainly so nobody has to rediscover it:
 *   - `merchants.claim_token` holds a live credential for an unclaimed shop, and
 *     it is inside every `pnpm db:backup` dump taken while the link is out.
 *     Anyone with the database or a dump can claim that shop.
 *   - The exposure is bounded: the column is cleared the instant the link is
 *     claimed or withdrawn, so only OUTSTANDING links are ever readable, and
 *     CLAIM_TTL_MS caps how long one can be outstanding.
 *   - The blast radius is bounded too, in both directions. Pre-claim a shop has
 *     no customers, no issued cards and a closed sign-up page, so a stolen claim
 *     costs a redesign rather than customer data — and `detachOwnerFromMerchant`
 *     takes a wrongly-claimed shop back without changing its card id.
 *
 * That last point is the load-bearing one. If detach is ever removed, this
 * trade stops being cheap and the plaintext should go back to being a hash.
 */
import { createHash } from "node:crypto";

/** A week, as agreed. Long enough for a merchant to get round to it. */
export const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Store and compare the hash, never the token. */
export const hashClaimToken = (t: string): string =>
  createHash("sha256").update(t).digest("hex");
