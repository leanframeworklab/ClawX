# BR-E Operator Decision Packet: Controlled Dependency Runtime Decision

**Packet ID:** `CLAWX_BR_E_CONTROLLED_DEPENDENCY_RUNTIME_DECISION_PACKET`
**Date:** 2026-07-05
**Author:** Hermes (governed LAH execution)
**Status:** DECISION — Read-only audit complete, path documented

---

## 1. Purpose

Make a controlled dependency/runtime decision for ClawX on the LAH fork.
This is a **decision and planning BR** — no install, no build, no launch.

## 2. Previous BR Chain

| BR | Verdict | Artifact |
|---|---|---|
| BR-A | LAH fork readiness | `docs/mcporter/CLAWX_BR_A_LAH_FORK_CONTINUITY.json` |
| BR-B | Isolated env + controlled deps | `docs/mcporter/CLAWX_BR_B_ISOLATED_ENV_AND_CONTROLLED_DEPS_CONTINUITY.json` |
| BR-C | External Gateway headless smoke | Gateway present, `connect.challenge` observed |
| BR-D | Electron isolated smoke harness ready | `BR_D_ELECTRON_SMOKE_SCRIPT_READY_RUNTIME_UNAVAILABLE` |

## 3. Current Blocker (from BR-D)

| Blocker | Detail |
|---|---|
| No `node_modules/` | Dependencies not installed (forbidden by BR-D scope) |
| No Electron binary | No `node_modules/.bin/electron` |
| No built entry | No `dist-electron/main/index.js` |
| Missing system libs | 12/12 Electron-required libraries absent |
| No approval | Approval phrase `APPROVE CLAWX BR-D ELECTRON ISOLATED SMOKE` absent |

## 4. Read-Only Audit Findings

Read-only audit script executed at:
`/home/deploy/lah-stack-runtime/clawx-phase1/checks/clawx-dependency-decision-audit-1783213800086.json`

### Runtime

| Check | Value |
|---|---|
| Node.js | v22.22.2 |
| pnpm | 10.33.4 (matches `packageManager` declaration) |
| Lockfile | `pnpm-lock.yaml` (437 KB, v9.0) |

### Dependency State

| Check | Result |
|---|---|
| `node_modules/` | **ABSENT** |
| `node_modules/.bin/electron` | **ABSENT** |
| `node_modules/electron/` | **ABSENT** |
| `dist-electron/main/index.js` | **ABSENT** |
| `dist-electron/preload/index.mjs` | **ABSENT** |

### Declared Electron Version

`electron ^40.6.0` (devDependency)

### Isolated Environment

| Artifact | Status |
|---|---|
| BR-B env file | ✓ Present |
| BR-B checks dir | ✓ Present |
| BR-C headless smoke script | ✓ Present |
| BR-D Electron smoke harness | ✓ Present |

### System Libraries (Ubuntu 24.04.4 LTS, x86_64)

| Library | Status | Required For |
|---|---|---|
| `libnspr4` | **MISSING** | Netscape Portable Runtime |
| `libnss3` | **MISSING** | Network Security Services |
| `libatk-1.0` | **MISSING** | Accessibility Toolkit |
| `libgtk-3` | **MISSING** | GTK 3 UI toolkit |
| `libxss` | **MISSING** | X11 Screen Saver |
| `libasound` | **MISSING** | ALSA sound |
| `libcups` | **MISSING** | CUPS printing |
| `libgbm` | **MISSING** | Generic Buffer Management |
| `libpango` | **MISSING** | Text layout |
| `libcairo` | **MISSING** | 2D graphics |
| `libX11` | **MISSING** | X11 client library |
| `libxcb` | **MISSING** | X11 C Bindings |
| `libdbus` | ✓ Present | D-Bus messaging |
| `libdrm` | ✓ Present | Direct Rendering Manager |

**All 12 Electron-required system libraries are missing.**

## 5. Install-Chain Risk Assessment

### Lifecycle Scripts

| Script | Risk | Action |
|---|---|---|
| `postinstall: node scripts/patch-browser-hint.mjs` | **LOW** — in-memory string patching only, no network, no binary exec | Let it run |
| No `preinstall` | None | — |

### Download Scripts (all manual-only, never auto-fire)

| Script | Downloads | Risk |
|---|---|---|
| `init` (manual) | `pnpm install` + uv + agent-browser | **LOW** — official GitHub releases |
| `uv:download:*` (manual) | uv v0.10.0 binary | **LOW** — official astral-sh/uv |
| `agent-browser:download:*` (manual) | agent-browser v0.27.0 | **LOW** — official vercel-labs |
| `node:download:win` (manual) | Node binary | **LOW** — Windows only |

### Security

- `onlyBuiltDependencies` whitelist includes only trusted packages (electron, esbuild, sharp, etc.)
- Lockfile has integrity SHA-512 hash
- No unusual `require()`/`import()` patterns
- No third-party CDN downloads

### Minimal Safe Install Command

```bash
pnpm install
```

This runs `postinstall` (benign). No `init` needed. No download scripts auto-fire.

## 6. Build Requirements

After `pnpm install`, Electron binary lives at `node_modules/.bin/electron`.
Before Electron can run, the app must be built:

```bash
pnpm run build:vite
```

This compiles:
- `electron/main/index.ts` → `dist-electron/main/index.js`
- `electron/preload/index.ts` → `dist-electron/preload/index.mjs`
- Renderer via Vite → `dist/`

The `build:vite` script runs no downloads, no lifecycle hooks, no external network calls.

## 7. Decision Matrix

### Option A: Isolated `pnpm install --ignore-scripts`

| Criterion | Assessment |
|---|---|
| Needed? | **Yes** — no deps at all |
| Feasibility | **Feasible** — lockfile exists, pnpm v10.33.4 installed |
| Risk | **Low** — `postinstall` is benign, but `--ignore-scripts` would skip it; better to let it run |
| Blocked by | System libraries (12 missing) — Electron binary needs them even if installed |
| Verdict | **Do after system libs ready** |

### Option B: System Runtime Preflight (RECOMMENDED FIRST)

| Criterion | Assessment |
|---|---|
| Needed? | **Yes** — 12/12 Electron libraries missing on Ubuntu 24.04 |
| Feasibility | **Feasible** — `sudo apt-get install -y libnss3 libnspr4 libatk-bridge2.0-0 libgtk-3-0 libxss1 libasound2 libcups2 libgbm1 libpango-1.0-0 libcairo2 libX11-6 libxcb1` |
| Risk | **Low** — well-known packages, no version conflicts expected |
| Blocked by | Requires sudo/apt — live approval needed |
| Verdict | **Do first** |

### Option C: Mac Runtime Path

| Criterion | Assessment |
|---|---|
| Needed? | If user prefers Mac for Electron work |
| Feasibility | Mac has native Electron support (no missing libs) |
| Risk | None |
| Note | Cannot merge to LAH fork from Mac without cross-platform coordination |
| Verdict | **Secondary option** — not primary for LAH fork |

### Option D: Headless-Only Gateway Mode

| Criterion | Assessment |
|---|---|
| Needed? | Only if Electron is indefinitely deferred |
| Feasibility | **Proven working** — BR-C succeeded |
| Risk | Blocks Electron smoke (BR-D pending) |
| Verdict | **Fallback** — not recommended as primary path |

### Option E: Wait / Do Nothing

| Criterion | Assessment |
|---|---|
| Needed? | Only if no further Electron work |
| Risk | Blocks all remaining BRs |
| Verdict | **Not recommended** |

## 8. Recommended Path

| Step | BR | Action |
|---|---|---|
| **1** | **BR-F** | **System runtime preflight** — install 12 missing Electron libraries on VPS |
| **2** | BR-G | Controlled `pnpm install` in isolated env |
| **3** | BR-H | `pnpm run build:vite` to build Electron app |
| **4** | BR-D re-run | Electron isolated smoke with approval phrase |

## 9. Next BR (Recommended)

**`CLAWX_BR_F_SYSTEM_RUNTIME_PREFLIGHT_ON_VPS`**

Purpose: Install missing system libraries on Ubuntu 24.04.4 VPS so Electron can execute.

Required approval: Yes — `apt install` requires sudo and will mutate the VPS.

Exact install list:
```
sudo apt-get install -y \
  libnss3 \
  libnspr4 \
  libatk-bridge2.0-0 \
  libgtk-3-0 \
  libxss1 \
  libasound2 \
  libcups2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libX11-6 \
  libxcb1
```

## 10. Explicit Non-Goals

- No actual install in this BR
- No build in this BR
- No Electron launch in this BR
- No Gateway spawn/kill in this BR
- No production mutation in this BR
- No upstream merge in this BR

## 11. Hard Prohibitions (all respected ✓)

| Prohibition | Status |
|---|---|
| No pnpm install | ✓ Respected |
| No npm install | ✓ Respected |
| No pnpm run init | ✓ Respected |
| No lifecycle scripts | ✓ Respected |
| No download | ✓ Respected |
| No system package install | ✓ Respected |
| No provider API calls | ✓ Respected |
| No production OpenClaw write | ✓ Respected |
| No Electron launch | ✓ Respected |
| No Gateway start/spawn/kill | ✓ Respected |
| No external URL opening | ✓ Respected |
| No upstream merge | ✓ Respected |

## 12. Rollback Model

This BR produces only docs + an audit helper — no rollback needed.
Revert if decision becomes obsolete:
```bash
git revert --no-edit <BR-E-MERGE-COMMIT>
git push fork main
```

## 13. Approval Requirements for Future BRs

| Action | Approval Needed |
|---|---|
| `apt install` system libs (BR-F) | **Yes** — live action |
| `pnpm install` (BR-G) | **Yes** — installs 97+ packages |
| `pnpm run build:vite` (BR-H) | **Yes** — build action |
| Electron launch (BR-D re-run) | **Yes** — `APPROVE CLAWX BR-D ELECTRON ISOLATED SMOKE` |
| Gateway start | **Yes** — separate approval