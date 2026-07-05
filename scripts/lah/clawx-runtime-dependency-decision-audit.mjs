#!/usr/bin/env node

/**
 * CLAWX Runtime Dependency Decision Audit
 * =========================================
 * BR-E: Read-only audit helper for controlled dependency/runtime decision.
 *
 * Inspects package scripts, runtime availability, system libraries, and
 * existing workspace state. No install, no download, no launch.
 *
 * Usage:
 *   node scripts/lah/clawx-runtime-dependency-decision-audit.mjs
 *   node scripts/lah/clawx-runtime-dependency-decision-audit.mjs --json
 *   node scripts/lah/clawx-runtime-dependency-decision-audit.mjs --out /path/to/checks
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

// ─── Constants ───────────────────────────────────────────────────────────
const WORKSPACE_ROOT = resolve(import.meta.dirname, '../..');
const DEFAULT_OUTPUT_DIR = '/home/deploy/lah-stack-runtime/clawx-phase1/checks';

// ─── CLI ─────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { format: 'text', outputDir: DEFAULT_OUTPUT_DIR };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--json': args.format = 'json'; break;
      case '--out': args.outputDir = argv[++i]; break;
      default: break;
    }
  }
  return args;
}

// ─── Safe Exec ───────────────────────────────────────────────────────────
function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv);

  const audit = {
    timestamp: new Date().toISOString(),
    workspace_root: WORKSPACE_ROOT,
    isolated_runtime_root: '/home/deploy/lah-stack-runtime/clawx-phase1',

    // Node / pnpm
    node_version: safeExec('node --version') || 'unknown',
    pnpm_version: safeExec('pnpm --version') || 'not-installed',

    // node_modules
    node_modules_present: existsSync(join(WORKSPACE_ROOT, 'node_modules')),
    node_modules_electron_bin: existsSync(join(WORKSPACE_ROOT, 'node_modules', '.bin', 'electron')),
    node_modules_electron_dir: existsSync(join(WORKSPACE_ROOT, 'node_modules', 'electron')),

    // Built entry
    dist_electron_main_entry: existsSync(join(WORKSPACE_ROOT, 'dist-electron', 'main', 'index.js')),
    dist_electron_preload_entry: existsSync(join(WORKSPACE_ROOT, 'dist-electron', 'preload', 'index.mjs')),

    // Lockfile
    pnpm_lockfile_exists: existsSync(join(WORKSPACE_ROOT, 'pnpm-lock.yaml')),

    // Isolated env
    isolated_env_file_exists: existsSync('/home/deploy/lah-stack-runtime/clawx-phase1/env/clawx-phase1.env'),
    isolated_checks_dir_exists: existsSync(DEFAULT_OUTPUT_DIR),

    // BR artifacts
    br_c_headless_smoke_script: existsSync(join(WORKSPACE_ROOT, 'scripts/lah/clawx-external-gateway-headless-smoke.mjs')),
    br_d_electron_smoke_script: existsSync(join(WORKSPACE_ROOT, 'scripts/lah/clawx-electron-isolated-smoke.mjs')),
    br_b_env_prep_script: existsSync(join(WORKSPACE_ROOT, 'scripts/lah/prepare-clawx-phase1-env.sh')),
    br_c_operator_packet: existsSync(join(WORKSPACE_ROOT, 'docs/operator/CLAWX_BR_C_EXTERNAL_GATEWAY_HEADLESS_SMOKE_OPERATOR_PACKET.md')),
    br_d_operator_packet: existsSync(join(WORKSPACE_ROOT, 'docs/operator/CLAWX_BR_D_ELECTRON_ISOLATED_SMOKE_OPERATOR_PACKET.md')),

    // Package scripts audit
    package_scripts: {},
    risky_scripts: [],

    // System libraries
    system_libraries: {},
    missing_libraries: [],
    os_info: {},
  };

  // ─── Package.json audit ──────────────────────────────────────────────────
  const pkgPath = join(WORKSPACE_ROOT, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      audit.package_scripts = pkg.scripts || {};
      audit.package_manager = pkg.packageManager || null;
      audit.electron_version = pkg.devDependencies?.electron || null;

      // Identify risky scripts
      const riskyPatterns = ['download', 'init', 'postinstall', 'preinstall', 'uv:', 'agent-browser'];
      for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
        for (const pattern of riskyPatterns) {
          if (cmd.includes(pattern)) {
            audit.risky_scripts.push({ name, cmd, reason: `contains "${pattern}"` });
            break;
          }
        }
      }
    } catch {}
  }

  // ─── System libraries ──────────────────────────────────────────────────
  const requiredLibs = [
    'libnspr4', 'libnss3', 'libatk-1.0', 'libgtk-3', 'libxss',
    'libasound', 'libcups', 'libgbm', 'libpango', 'libcairo', 'libX11', 'libxcb',
  ];

  const ldconfig = safeExec("ldconfig -p 2>/dev/null") || '';
  for (const lib of requiredLibs) {
    const present = ldconfig.includes(lib);
    audit.system_libraries[lib] = present;
    if (!present) audit.missing_libraries.push(lib);
  }

  // ─── OS info ──────────────────────────────────────────────────────────
  audit.os_info = {
    release: safeExec('cat /etc/os-release 2>/dev/null | head -5') || 'unknown',
    uname: safeExec('uname -a') || 'unknown',
    arch: safeExec('uname -m') || 'unknown',
  };

  // ─── Output ────────────────────────────────────────────────────────────
  if (args.format === 'json') {
    const reportPath = join(args.outputDir, `clawx-dependency-decision-audit-${Date.now()}.json`);
    if (!existsSync(args.outputDir)) mkdirSync(args.outputDir, { recursive: true });
    writeFileSync(reportPath, JSON.stringify(audit, null, 2) + '\n');
    console.log(JSON.stringify(audit, null, 2));
    process.stderr.write(`Audit written: ${reportPath}\n`);
  } else {
    console.log(renderText(audit));
  }
}

function renderText(audit) {
  const lines = [];
  lines.push('=== CLAWX RUNTIME DEPENDENCY DECISION AUDIT ===');
  lines.push(`Timestamp: ${audit.timestamp}`);
  lines.push(`Workspace: ${audit.workspace_root}`);
  lines.push('');
  lines.push('── Runtime ──');
  lines.push(`  Node.js:           ${audit.node_version}`);
  lines.push(`  pnpm:              ${audit.pnpm_version}`);
  lines.push('');
  lines.push('── Dependency State ──');
  lines.push(`  node_modules/:     ${audit.node_modules_present ? 'PRESENT' : 'ABSENT'}`);
  lines.push(`  electron binary:   ${audit.node_modules_electron_bin ? 'PRESENT' : 'ABSENT'}`);
  lines.push(`  electron dir:      ${audit.node_modules_electron_dir ? 'PRESENT' : 'ABSENT'}`);
  lines.push(`  dist-electron/:    ${audit.dist_electron_main_entry ? 'PRESENT' : 'ABSENT'}`);
  lines.push(`  pnpm-lock.yaml:    ${audit.pnpm_lockfile_exists ? 'PRESENT' : 'ABSENT'}`);
  lines.push(`  Electron version:  ${audit.electron_version || 'unknown'}`);
  lines.push('');
  lines.push('── Isolated Environment ──');
  lines.push(`  env file:          ${audit.isolated_env_file_exists ? 'PRESENT' : 'ABSENT'}`);
  lines.push(`  checks dir:        ${audit.isolated_checks_dir_exists ? 'PRESENT' : 'ABSENT'}`);
  lines.push('');
  lines.push('── BR Artifacts ──');
  lines.push(`  BR-C headless smoke:     ${audit.br_c_headless_smoke_script ? '✓' : '✗'}`);
  lines.push(`  BR-D Electron smoke:     ${audit.br_d_electron_smoke_script ? '✓' : '✗'}`);
  lines.push(`  BR-C operator packet:    ${audit.br_c_operator_packet ? '✓' : '✗'}`);
  lines.push(`  BR-D operator packet:    ${audit.br_d_operator_packet ? '✓' : '✗'}`);
  lines.push('');
  lines.push('── Package Script Risk ──');
  if (audit.risky_scripts.length === 0) {
    lines.push('  No risky scripts detected');
  } else {
    for (const s of audit.risky_scripts) {
      lines.push(`  ⚠ ${s.name}: ${s.cmd}`);
    }
  }
  lines.push('');
  lines.push('── System Libraries (Electron needs) ──');
  for (const [lib, present] of Object.entries(audit.system_libraries)) {
    lines.push(`  ${present ? '✓' : '✗'} ${lib}`);
  }
  lines.push(`  Missing: ${audit.missing_libraries.length}/12`);
  lines.push('');
  lines.push('── OS Info ──');
  lines.push(`  ${audit.os_info.uname}`);
  return lines.join('\n');
}

main();