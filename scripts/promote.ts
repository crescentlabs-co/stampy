/**
 * `pnpm promote` — the one way code moves from staging to the live site.
 *
 * Staging deploys automatically from `main`; the live Railway service deploys
 * from the `live` branch. Promoting means pushing what is on GitHub's `main`
 * (the exact code staging has been running) to `live` — no merge commit, no
 * rebuild, nothing retyped, so the two cannot drift.
 *
 * It refuses unless:
 *   1. the local checkout IS GitHub's main (so the checks test what ships), and
 *   2. all five verification suites pass (CLAUDE.md's gate).
 *
 * Reminder it always prints, because live cannot print it: if the change being
 * promoted reads a NEW Railway variable, set it on the LIVE service BEFORE
 * running this — a missing variable never crashes this app, it just silently
 * turns the feature off (invariant 1's flip side).
 */
import { execSync } from "node:child_process";

function run(cmd: string): void {
  execSync(cmd, { stdio: "inherit" });
}
function read(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

console.log("Promote: staging (main) → live\n");
console.log("If this change added a new Railway variable, set it on the LIVE");
console.log("service first — live will not complain if it is missing.\n");

run("git fetch origin");

if (read("git status --porcelain") !== "") {
  console.error("\nREFUSED: there are uncommitted local changes. Commit or stash them first —");
  console.error("the checks below must test exactly the code being promoted.");
  process.exit(1);
}
const head = read("git rev-parse HEAD");
const remoteMain = read("git rev-parse origin/main");
if (head !== remoteMain) {
  console.error("\nREFUSED: the local checkout is not the same as GitHub's main branch.");
  console.error(`  local:        ${head}`);
  console.error(`  GitHub main:  ${remoteMain}`);
  console.error("Push or pull first, so the checks test exactly what will go live.");
  process.exit(1);
}

console.log("\nRunning the five verification suites (this takes a few minutes)…\n");
for (const cmd of [
  "pnpm typecheck",
  "pnpm test",
  "pnpm e2e",
  "pnpm test:migration",
  "pnpm test:backup",
]) {
  console.log(`\n=== ${cmd} ===`);
  try {
    run(cmd);
  } catch {
    console.error(`\nREFUSED: ${cmd} failed. Nothing was promoted; live is unchanged.`);
    process.exit(1);
  }
}

console.log("\nAll green. Pushing main → live…\n");
run("git push origin main:live");
console.log("\nPROMOTED ✅  Railway is now deploying this to the live site.");
console.log("Watch it at railway.app → the live service → Deployments.");
