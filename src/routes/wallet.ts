/**
 * Apple Wallet Web Service protocol (Apple calls these; we never link to them):
 *
 *   POST   /wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial  register for push
 *   DELETE /wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial  unregister
 *   GET    /wallet/v1/devices/:deviceId/registrations/:passTypeId          what changed?
 *   GET    /wallet/v1/passes/:passTypeId/:serial                           fresh .pkpass
 *   POST   /wallet/v1/log                                                  device error logs
 *
 * Register/unregister/get-pass are authenticated with the per-pass secret:
 * "Authorization: ApplePass <authenticationToken>".
 */
import { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import {
  deleteRegistration,
  getPass,
  serialsUpdatedSince,
  upsertRegistration,
  type PassRow,
} from "../db.js";
import { buildPkpass, NotConfiguredError } from "../passBuilder.js";

export const walletRouter = Router();

/** Constant-time check of the ApplePass authorization header against the pass row. */
async function authedPass(req: Request, res: Response): Promise<PassRow | null> {
  const serial = req.params.serial ?? "";
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("ApplePass ") ? header.slice("ApplePass ".length) : "";
  const row = await getPass(serial);
  if (!row || !token) {
    res.status(401).end();
    return null;
  }
  const a = Buffer.from(token);
  const b = Buffer.from(row.auth_token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).end();
    return null;
  }
  return row;
}

walletRouter.post(
  "/v1/devices/:deviceId/registrations/:passTypeId/:serial",
  async (req, res) => {
    const row = await authedPass(req, res);
    if (!row) return;
    const pushToken = (req.body as { pushToken?: string } | undefined)?.pushToken;
    if (!pushToken) return void res.status(400).end();
    const { created } = await upsertRegistration(req.params.deviceId!, row.serial, pushToken);
    res.status(created ? 201 : 200).end();
  },
);

walletRouter.delete(
  "/v1/devices/:deviceId/registrations/:passTypeId/:serial",
  async (req, res) => {
    const row = await authedPass(req, res);
    if (!row) return;
    await deleteRegistration(req.params.deviceId!, row.serial);
    res.status(200).end();
  },
);

walletRouter.get("/v1/devices/:deviceId/registrations/:passTypeId", async (req, res) => {
  const updatedSince =
    typeof req.query.passesUpdatedSince === "string" ? req.query.passesUpdatedSince : undefined;
  const { serialNumbers, lastUpdated } = await serialsUpdatedSince(
    req.params.deviceId!,
    updatedSince,
  );
  if (serialNumbers.length === 0) return void res.status(204).end();
  res.json({ serialNumbers, lastUpdated });
});

walletRouter.get("/v1/passes/:passTypeId/:serial", async (req, res) => {
  const row = await authedPass(req, res);
  if (!row) return;
  try {
    const pkpass = buildPkpass(row);
    res
      .status(200)
      .set("Content-Type", "application/vnd.apple.pkpass")
      .set("Last-Modified", new Date(row.updated_at).toUTCString())
      .send(pkpass);
  } catch (err) {
    if (err instanceof NotConfiguredError) return void res.status(503).end();
    throw err;
  }
});

walletRouter.post("/v1/log", (req, res) => {
  // Device-side errors (bad pass, unreachable service) surface here — gold for debugging.
  const logs = (req.body as { logs?: string[] } | undefined)?.logs ?? [];
  for (const line of logs) console.warn("[wallet-device-log]", line);
  res.status(200).end();
});
