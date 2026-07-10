// Enforces that publishing is opt-in: a package reaches npm only when it is
// deliberately set up for it. `pnpm publish -r` (see `release:publish`)
// publishes every workspace package that isn't `private`, so a newly scaffolded
// package with no `private` field would be published the moment it lands --
// with its dev entrypoints pointing at raw TypeScript source, that ships a
// broken tarball.
//
// The invariant this guards: a package is EITHER private (opted out) OR fully
// publish-ready (opted in) -- it has a `publishConfig` rewriting its entrypoints
// to `dist/` and a `build` script that produces them. There is no in-between.
// A public package missing that setup fails this check, so the fix is an
// explicit decision: add `"private": true` to keep developing it, or finish the
// publish setup (publishConfig + build + tsconfig.build.json) to release it.
//
// Runs in `release:publish` before anything is published, and in CI lint so the
// drift is caught on the PR that introduces it rather than at release time.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface WorkspacePackage {
  name: string;
  path: string;
  private: boolean;
}

const workspace: WorkspacePackage[] = JSON.parse(
  execSync('pnpm ls -r --depth -1 --json', { encoding: 'utf8' }),
);

const problems: string[] = [];

for (const pkg of workspace) {
  // The root workspace package is always private and never published.
  if (pkg.private) continue;

  const manifest = JSON.parse(readFileSync(join(pkg.path, 'package.json'), 'utf8')) as {
    publishConfig?: unknown;
    scripts?: Record<string, string>;
  };

  const missing: string[] = [];
  if (!manifest.publishConfig) missing.push('a publishConfig entrypoint override');
  if (!manifest.scripts?.build) missing.push('a build script');

  if (missing.length > 0) {
    problems.push(
      `  ${pkg.name} is public but not publish-ready -- missing ${missing.join(' and ')}.`,
    );
  }
}

if (problems.length > 0) {
  console.error(
    'Publishing is opt-in. These packages would be published by `pnpm publish -r` but\n' +
      "aren't set up for it:\n\n" +
      problems.join('\n') +
      '\n\nAdd `"private": true` to keep developing a package, or complete its publish\n' +
      'setup (publishConfig + build + tsconfig.build.json) to release it.\n',
  );
  process.exit(1);
}

console.log(
  `✓ ${workspace.filter((p) => !p.private).length} publishable package(s) are set up correctly.`,
);
