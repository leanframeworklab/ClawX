# Superpowers Plan — CLAWX BR-E: Controlled Dependency Runtime Decision

**Date:** 2026-07-05
**Author:** Hermes (governed LAH execution)
**Status:** Plan (decision-phase)

## 1. Mission

Make a controlled dependency/runtime decision for ClawX on the LAH fork.
This is a **decision and planning BR** — no install, no build, no launch.

## 2. Previous BR Chain

| BR | Verdict | Key Artifact |
|---|---|---|
| BR-A | LAH fork readiness | Continuity lock |
| BR-B | Isolated env + controlled deps | Env at `clawx-phase1/env/` |
| BR-C | External Gateway headless smoke | Gateway present, challenge observed |
| BR-D | Electron smoke harness ready | Runtime unavailable |

## 3. BR-D Blocker Recap

Electron smoke harness exists at `scripts/lah/clawx-electron-isolated-smoke.mjs` but:
- No `node_modules/` (deps not installed)
- No `dist-electron/main/index.js` (not built)
- 12 missing system libraries on VPS
- `pnpm install` and `apt install` were forbidden by BR-D scope

## 4. Decision Scope

This BR answers:
1. Is controlled isolated install required? **Yes**
2. Is `pnpm install --ignore-scripts` sufficient? **Yes, initially**
3. Does repo need build steps? **Yes: `pnpm run build:vite`**
4. Which build steps are safe? All except download helpers (`uv:download`, `agent-browser:download`)
5. Which system libraries are missing? **12/14 Electron libs missing**
6. VPS or Mac? **VPS primary for LAH fork; Mac secondary**
7. Is headless-only sufficient? **Partially — Gateway works, but Electron smoke blocked**
8. Safest next BR? **System runtime preflight, then controlled install**

## 5. Audit Findings Summary

See read-only sub-agent output for full details.

## 6. Decision Matrix

| Option | Feasibility | Risk | Next Step |
|---|---|---|---|
| A: `pnpm install --ignore-scripts` | Feasible after system libs | Low | BR-G |
| B: System library preflight | Required first | Low (apt) | BR-F |
| C: Mac runtime path | User's choice | None | Separate |
| D: Headless-only mode | Works (BR-C proven) | Blocks Electron | Not recommended |
| E: Wait | Always possible | No progress | Not recommended |

## 7. Recommended Option

**B → A**: Install system libraries (BR-F), then controlled dependency install (BR-G).

## 8. Recommended Next BR

`CLAWX_BR_F_SYSTEM_RUNTIME_PREFLIGHT_ON_VPS`

## 9. Hard Prohibitions

All standard LAH prohibitions apply. No install/download/launch in this BR.

## 10. Outputs

- Decision packet: `docs/operator/CLAWX_BR_E_CONTROLLED_DEPENDENCY_RUNTIME_DECISION_PACKET.md`
- Continuity lock: `docs/mcporter/CLAWX_BR_E_CONTROLLED_DEPENDENCY_RUNTIME_DECISION_CONTINUITY.json`
- Audit helper: `scripts/lah/clawx-runtime-dependency-decision-audit.mjs` (optional)
- This plan