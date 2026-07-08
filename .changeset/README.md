# Changesets

Every change that should reach npm carries a changeset: run
`pnpm changeset`, pick the packages you touched and the semver impact
(`feat:` PRs → minor, `fix:` → patch), and write one sentence a
consumer would want in the changelog. CI's release workflow accumulates
merged changesets into a bot-maintained "Version Packages" PR; merging
that PR publishes to npm with provenance.

Docs-, CI-, and playground-only changes don't need one.
