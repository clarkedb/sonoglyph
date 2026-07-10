# Agent instructions

Sonoglyph is a browser-first signal recognition framework — see
[docs/architecture.md](docs/architecture.md) for how it fits together and
[docs/roadmap.md](docs/roadmap.md) for the plan. Those two files are the
source of truth; update them when a change invalidates them.

Fresh clone or worktree: `pnpm run bootstrap` (verifies the pinned Node
version, installs deps and git hooks). Everyday commands: `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm dev` (playground).
Node version is pinned in `.nvmrc`; pnpm in `package.json#packageManager`.

The Rust core (`crates/`, the WASM DSP engine — see the roadmap's Phase 3) is
**optional**: TS-only work needs no Rust toolchain. When working in `crates/`,
`cargo test` / `cargo fmt` / `cargo clippy` provision the pinned toolchain from
`rust-toolchain.toml`; the same commands run in the `rust.yml` CI job.

## Skills

Skills follow the [Agent Skills](https://agentskills.io) open standard:
one directory per skill containing a `SKILL.md` with `name` and
`description` frontmatter.

- **Canonical location: `.agents/skills/<skill-name>/SKILL.md`.** This is
  the cross-tool directory (Cursor, Gemini CLI, VS Code read it natively).
  Skill content must stay tool-agnostic — no assumptions about which agent
  is running it.
- **Claude Code discovers skills via symlinks.** For every skill, add
  `.claude/skills/<skill-name>` as a relative symlink to the canonical
  directory:

  ```bash
  ln -s ../../.agents/skills/<skill-name> .claude/skills/<skill-name>
  ```

- Never create a real skill directory under `.claude/skills/` — that forks
  the source of truth. One skill, one directory, symlinked everywhere a
  tool needs it.

Existing skills: `create-pr` (verification + PR conventions), `verify`
(build/launch/drive recipe for the playground), and `review-pr`
(multi-agent PR review with a verifying judge pass).

## Design context

[website/PRODUCT.md](website/PRODUCT.md) governs design decisions for the
website (register, audience, brand personality, design principles). Read
it before any website design or copy work; update it when the strategy
changes, not per tweak.
