/**
 * Stop an embedded Postgres without ever hanging on it.
 *
 * embedded-postgres resolves `stop()` from the child process's `exit` event —
 * an event that has ALREADY fired when the server failed to start, so the
 * promise never settles. Every script here awaited it on the way to
 * `process.exit(1)`, so a run whose database never came up sat on that await,
 * drained an empty event loop and exited **0**: `pnpm test:backup` reported
 * success having tested nothing. That is precisely the failure the backup suite
 * exists to prevent, so the suites race the stop against a timer and set
 * `process.exitCode` BEFORE they get anywhere near it.
 *
 * Found when dev:local held port 5488 and the backup test went green in 4
 * seconds without connecting to anything.
 */
export async function stopPg(pg: { stop(): Promise<void> }): Promise<void> {
  await Promise.race([
    pg.stop().catch(() => {}),
    new Promise<void>((resolve) => {
      setTimeout(resolve, 5000).unref();
    }),
  ]);
}

/** What went wrong, when the failure itself carries no message. */
export function startupHint(err: unknown, port: number): unknown {
  return err ?? `the embedded Postgres never started — is something already on port ${port}? (pnpm dev:local holds 5488)`;
}
