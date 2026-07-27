# Stampy — rules for any AI model working on this repo

**The rules live in [CLAUDE.md](./CLAUDE.md). Read that file before changing
anything.** This one is a pointer, not a second copy: it used to be a copy, it
drifted, and it spent a release telling models to call a function that had been
renamed and to obey seven invariants when there were twelve.

Read [README.md](./README.md) for the system overview.

The four things most expensive to get wrong, so that a model which reads only
this file still doesn't do the unrecoverable thing:

1. **A card's id can never change.** It is printed on QR posters, forms the
   Google class id re-sent on every stamp, and appears in the art URLs inside
   every issued Android card. Re-key one and that customer's card silently stops
   updating forever.
2. **Verify before claiming done:**
   `pnpm typecheck && pnpm test && pnpm e2e && pnpm test:migration && pnpm test:backup`
3. **Secrets live in Railway's Variables UI only** — never in files, never
   committed.
4. **Take a backup before anything irreversible.** Railway snapshots are a paid
   feature and this project is on the free plan, so `pnpm db:backup` is the only
   backup there is. `passes.serial` and `passes.auth_token` cannot be rebuilt —
   they are inside wallet cards already on customers' phones.

The founder is **non-technical**: give click-by-click browser instructions for
anything manual, run all commands for them, and prefer browser UIs over files
for anything they configure.
