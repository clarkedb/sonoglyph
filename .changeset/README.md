# Changesets

Every change that should reach npm carries a changeset: run
`pnpm changeset`, pick the packages you touched and the semver impact
(`feat:` PRs → minor, `fix:` → patch), and write one sentence a
consumer would want in the changelog. CI's release workflow accumulates
merged changesets into a bot-maintained "Version Packages" PR; merging
that PR publishes to npm with provenance.

Docs-, CI-, and playground-only changes don't need one.

Publish only ever runs through `pnpm publish` (the release workflow's
`release:publish` script): the dev `package.json`s point at TypeScript
source, and it is pnpm's `publishConfig` override that rewrites the
entrypoints to `dist/` at pack time — a bare `npm publish` would ship a
broken package.
