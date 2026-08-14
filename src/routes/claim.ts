/**
 * Claiming a shop we built.
 *
 *   GET  /claim/:token        the card we made, and a form to make the login
 *   POST /claim/:token/finish { email, password } → account + session
 *
 * The merchant, its card, its slug and its /j/ QR all exist before either of
 * these is called — see `createUnclaimedMerchant`. What is missing is a login,
 * and this is the only path that adds one to an existing shop.
 *
 * Deliberately NOT admin-gated: the whole point is that the merchant opens it.
 * The token is the authorisation, which is why it is single-use, short-lived,
 * stored only as a hash, and rate-limited here the same way login is.
 */
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { hashPassword, setSessionCookie } from "../auth.js";
import { hashClaimToken } from "../claim.js";
import { clear, hit, peek } from "../rateLimit.js";
import {
  attachOwnerToMerchant,
  cafeLogoVersion,
  cardsForMerchant,
  createOwner,
  getOwnerByEmail,
  linkOwnerCard,
  logOwnerLogin,
  merchantByClaimToken,
} from "../db.js";
import { claimPage, notReadyPage } from "../pages.js";

export const claimRouter = Router();

/**
 * Guessing a 32-byte token is not realistic, but the endpoint is unauthenticated
 * and public, so it gets the same treatment as login: failure-only counting, so
 * a merchant fumbling their password on the claim form is never locked out.
 */
const RL = { limit: 20, windowMs: 15 * 60_000 };

claimRouter.get("/:token", async (req, res) => {
  const merchant = await merchantByClaimToken(hashClaimToken(req.params.token ?? "")).catch(
    () => null,
  );
  // One page for every way a link can fail — spent, expired, withdrawn, wrong,
  // or for a shop since archived. Saying which would tell a stranger holding a
  // guessed token that they were close.
  if (!merchant) {
    return void res.status(404).type("html").send(
      notReadyPage("This link has already been used, or it has expired. Ask us for a new one."),
    );
  }
  const cards = await cardsForMerchant(merchant.id);
  const card = cards[0] ?? null;
  const logoVersion = card ? await cafeLogoVersion(card.id).catch(() => 0) : 0;
  res.type("html").send(claimPage(req.params.token!, merchant.name, card, logoVersion));
});

claimRouter.post("/:token/finish", async (req, res) => {
  const token = req.params.token ?? "";
  const key = `claim:${req.ip}`;
  const peeked = peek(key, RL.limit, RL.windowMs);
  if (!peeked.ok) {
    return void res
      .status(429)
      .json({ error: "too-many-attempts", retryAfterSeconds: peeked.retryAfterSeconds });
  }
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  const clean = (email ?? "").trim().toLowerCase();
  if (!clean.includes("@") || !password || password.length < 8) {
    hit(key, RL.limit, RL.windowMs);
    return void res.status(400).json({ error: "need-valid-email-and-8-char-password" });
  }

  const merchant = await merchantByClaimToken(hashClaimToken(token));
  if (!merchant) {
    hit(key, RL.limit, RL.windowMs);
    return void res.status(400).json({ error: "invalid-or-expired-link" });
  }
  // One merchant per login (the partial unique index). An operator attaching a
  // second shop to an existing account is a decision, not an accident on a
  // public form — so this is refused clearly rather than left to 500 on the
  // constraint.
  if (await getOwnerByEmail(clean)) {
    hit(key, RL.limit, RL.windowMs);
    return void res.status(409).json({ error: "email-taken" });
  }

  const owner = await createOwner(randomUUID(), clean, hashPassword(password));
  // Conditional on the shop still being unclaimed, so two people opening the
  // same link cannot both win — the second gets no row back.
  const claimed = await attachOwnerToMerchant(merchant.id, owner.id);
  if (!claimed) {
    hit(key, RL.limit, RL.windowMs);
    return void res.status(409).json({ error: "already-claimed" });
  }
  for (const card of await cardsForMerchant(merchant.id)) {
    await linkOwnerCard(owner.id, card.id);
  }
  // NO staff PIN is minted here.
  //
  // One used to be, and shown once on the next screen with "write this down
  // now". A PIN is stored only as a scrypt hash, so that screen was the single
  // moment it could ever be read — which made handing someone their shop also
  // a memory test, at the one point they are least ready for one.
  //
  // Minting it here without showing it would be worse than either: the owner
  // would have a live PIN nobody on earth can read, `hasStaffPin` would be true,
  // and the Shop tab's button would read "Reset" as though everything were set
  // up. So the mint goes with the reveal. The owner types their own under Shop,
  // and the dashboard says plainly that the counter cannot stamp until they do.
  clear(key);
  setSessionCookie(res, owner.id);
  void logOwnerLogin(owner.id);
  res.json({ ok: true });
});
