# Rebuilt Workspace Closeout

Date: 2026-06-12
Scope: Agentique UI local workspace rebuild.

## Public Outcome

The local workspace is now organized around task-native workspaces instead of dashboard-style summary blocks:

- workspace shell with persistent navigation, selected resource context, and command actions
- resource library, import intent review, trust verification, controlled run review, preview, Graph canvas, handoff, and settings workspaces
- Graph canvas with visible nodes, visible edges, fit and zoom controls, node selection, inspector details, validation overlays, credential-risk indicators, and unsupported-node reporting
- static preview and handoff flows that remain descriptor-only and reversible
- supported-local-only Graph/Run controls backed by permission review, run evidence, and blocked/handoff states
- source-preserving handoff evidence for currently validated n8n, Dify, and LangGraph samples
- default-deny permission, adapter, sidecar, release-readiness, and no-secret export boundaries
- desktop and narrow viewport evidence for the rebuilt Graph workspace

## Evidence

- Rebuilt UI regression evidence: `docs/validation/rebuilt-ui-regression-evidence.md`
- Desktop Graph capture: `docs/validation/artifacts/rebuilt-ui-graph-desktop.png`
- Narrow Graph capture: `docs/validation/artifacts/rebuilt-ui-graph-mobile.png`
- General visual evidence: `docs/validation/visual-regression-evidence.md`
- Visual redesign closeout: `docs/validation/visual-redesign-closeout.md`

## Validation

Run:

```powershell
npm run validate
```

The validation path includes contract checks, Tauri package and capability checks, visual gates, rebuilt UI regression checks, release boundary checks, public documentation checks, TypeScript, production build, the Node test suite, and the public-boundary scan.

## Boundary

No installer, updater, production desktop runtime, generic shell or sidecar runtime, automatic arbitrary-resource execution, cloud runtime, or universal workflow runtime is claimed by this closeout.

The UI remains a source-first local workspace for inspecting public-safe sample contracts, reviewing validation state, running only supported-local-only evidence paths, and producing descriptor-only or source-preserving handoffs.
