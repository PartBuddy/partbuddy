#!/usr/bin/env node
// Fails when a production dependency carries a licence that is incompatible with closed-source
// commercial distribution. Reads `pnpm licenses list --prod --json` (pnpm's own licence report).
// Exceptions are allowed only for packages listed in ALLOWED_EXCEPTIONS with a reason and an ADR.

import { execFileSync, execSync } from 'node:child_process';

const DENIED = [/\bAGPL/i, /\bGPL/i, /\bSSPL/i, /\bBUSL/i, /\bBSL-1\.1\b/i, /\bLGPL/i, /\bCC-BY-NC/i];

// Package name → reason. LGPL is acceptable only as a separate, replaceable file (ADR 0007).
const ALLOWED_EXCEPTIONS = new Map([
  ['occt-import-js', 'LGPL-2.1 WebAssembly, shipped as a separate replaceable file (ADR 0004, ADR 0007)'],
]);

// Run through `pnpm licenses:check`: pnpm passes its own executable or entry script in
// npm_execpath, which avoids platform-specific shims. Without it, a fixed command string goes
// through the shell.
const args = ['licenses', 'list', '--prod', '--json'];
const pnpmPath = process.env.npm_execpath;
const options = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
let raw;
if (pnpmPath && /\.[cm]?js$/.test(pnpmPath)) {
  raw = execFileSync(process.execPath, [pnpmPath, ...args], options);
} else if (pnpmPath) {
  raw = execFileSync(pnpmPath, args, options);
} else {
  raw = execSync(`pnpm ${args.join(' ')}`, options);
}
const report = raw.trim() ? JSON.parse(raw) : {};

const violations = [];
for (const [license, packages] of Object.entries(report)) {
  if (!DENIED.some((pattern) => pattern.test(license))) continue;
  for (const pkg of packages) {
    if (ALLOWED_EXCEPTIONS.has(pkg.name)) continue;
    violations.push(`${pkg.name}@${(pkg.versions ?? [pkg.version]).join(', ')}: ${license}`);
  }
}

const total = Object.values(report).reduce((sum, packages) => sum + packages.length, 0);
if (violations.length > 0) {
  console.error('Licences not allowed in shipped code:');
  for (const line of violations) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`Licence check passed for ${total} production packages.`);
