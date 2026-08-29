/**
 * `pnpm promote` — the one way code moves from staging to the live site.
 *
 * TWO STEPS, ON PURPOSE. The founder asked for a second confirmation even
 * after saying "push live", because saying it is exactly the moment a mistake
 * gets made:
 *
 *   pnpm promote             shows what WOULD go live. Pushes nothing. Fast.
 *   pnpm promote --confirm   runs the five suites, then pushes main → live.
 *
 * The first step is the one to run when they say "push live". Show them the
 * commit list it prints and wait for them to say yes to THAT. Never reach for
 * --confirm on your own, and never skip step one because the change looks
 * small — the whole point is that they see the list before it ships.
 *
 * Staging deploys automatically from `main`; the live Railway service deploys
 * from the `live` branch. Promoting pushes what is on GitHub's `main` (the
 * exact code staging has been running) to `live` — no merge commit, no
 * rebuild, nothing retyped, so the two cannot drift.
 *
 * Reminder it always prints, because live cannot print it: if the change being
 * promoted reads a NEW Railway variable, set it on the LIVE service BEFORE
 * confirming — a missing variable never crashes this app, it just silently
 * turns the feature off (invariant 1's flip side).
 */
import { execSync } from "node:child_process";

const confirmed = process.argv.includes("--confirm");

function run(cmd: string): void {
  execSync(cmd, { stdio: "inherit" });
}
function read(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8" }).trim();
}
function refuse(...lines: string[]): never {
  console.error("\nREFUSED: " + lines.join("\n  "));
  console.error("\nNothing was promoted; live is unchanged.");
  process.exit(1);
}

run("git fetch origin --quiet");

// Both gates run in BOTH steps: the dry run must describe the same push the
// confirm would make, or the list the founder approves is not the list.
if (read("git status --porcelain") !== "") {
  refuse(
    "there are uncommitted local changes.",
    "Commit or stash them first — the checks must test exactly the code being promoted.",
  );
}
const head = read("git rev-parse HEAD");
const remoteMain = read("git rev-parse origin/main");
if (head !== remoteMain) {
  refuse(
    "the local checkout is not the same as GitHub's main branch.",
    `local:       ${head}`,
    `GitHub main: ${remoteMain}`,
    "Push or pull first, so the checks test exactly what will go live.",
  );
}

const pending = read("git log origin/live..origin/main --oneline");
if (!pending) {
  console.log("\nLive is already running everything on main. Nothing to promote.");
  process.exit(0);
}
const count = pending.split("\n").length;

console.log(`\n${"=".repeat(64)}`);
console.log(`  ${count} change${count === 1 ? "" : "s"} would go LIVE (merchants would see this):`);
console.log(`${"=".repeat(64)}\n`);
console.log(pending.split("\n").map((l) => "  " + l).join("\n"));
console.log(`\n  live is currently on: ${read("git rev-parse --short origin/live")}`);
console.log(`  it would move to:     ${read("git rev-parse --short origin/main")}`);
console.log("\n  If any of these read a NEW Railway variable, set it on the LIVE");
console.log("  service FIRST — live will not complain if it is missing.\n");

if (!confirmed) {
  console.log("=".repeat(64));
  console.log("  NOTHING PUSHED. This was the preview.");
  console.log("  Live only moves once the founder confirms THIS list, then:");
  console.log("      pnpm promote --confirm");
  console.log("=".repeat(64));
  process.exit(0);
}

console.log("Confirmed. Running the five verification suites (a few minutes)…\n");
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
    refuse(`${cmd} failed.`);
  }
}

console.log("\nAll green. Pushing main → live…\n");
run("git push origin main:live");
console.log("\nPROMOTED ✅  Railway is now deploying this to the live site.");
console.log("Watch it at railway.app → the live service → Deployments.");
