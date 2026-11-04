#!/usr/bin/env node
// Fails when a production dependency of any workspace package carries a licence that is
// incompatible with distribution under GPL-3.0-or-later or restricts use (ADR 0007). Reads pnpm's
// own licence report (`pnpm licenses list --prod --json`) in every workspace package.
// Exceptions are allowed only for packages listed in ALLOWED_EXCEPTIONS with a reason and an ADR.

import { execFileSync, execSync } from 'node:child_process';

const DENIED = [
  /\bGPL-2\.0-only\b/i,
  /\bGPL-2\.0\b(?!-or-later)/i,
  /\bAGPL/i,
  /\bSSPL/i,
  /\bBUSL/i,
  /\bBSL-1\.1\b/i,
  /\bCC-BY-NC/i,
  /\bUNLICENSED\b/i,
  /\bproprietary\b/i,
];

// Package name → reason. AGPL code needs a deliberate decision because it adds network obligations.
const ALLOWED_EXCEPTIONS = new Map();

// Run through `pnpm licenses:check`: pnpm passes its own executable or entry script in
// npm_execpath, which avoids platform-specific shims. Without it, a fixed command string goes
// through the shell.
const pnpmPath = process.env.npm_execpath;
function pnpm(args, cwd) {
  const options = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd };
  if (pnpmPath && /\.[cm]?js$/.test(pnpmPath)) return execFileSync(process.execPath, [pnpmPath, ...args], options);
  if (pnpmPath) return execFileSync(pnpmPath, args, options);
  return execSync(`pnpm ${args.join(' ')}`, options);
}

const packages = JSON.parse(pnpm(['ls', '--recursive', '--depth', '-1', '--json'], process.cwd()));
const workspaceNames = new Set(packages.map((pkg) => pkg.name));
const violations = [];
let total = 0;

for (const pkg of packages) {
  const raw = pnpm(['licenses', 'list', '--prod', '--json'], pkg.path).trim();
  const report = raw ? JSON.parse(raw) : {};
  for (const [license, entries] of Object.entries(report)) {
    for (const entry of entries) {
      if (workspaceNames.has(entry.name)) continue;
      total += 1;
      if (!DENIED.some((pattern) => pattern.test(license))) continue;
      if (ALLOWED_EXCEPTIONS.has(entry.name)) continue;
      violations.push(`${pkg.name}: ${entry.name}@${(entry.versions ?? [entry.version]).join(', ')} (${license})`);
    }
  }
}

if (violations.length > 0) {
  console.error('Licences not allowed in the distributed app:');
  for (const line of violations) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`Licence check passed: ${total} production dependencies in ${packages.length} workspace packages.`);
