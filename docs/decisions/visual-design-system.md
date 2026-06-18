# Visual Design System Decision

Date: 2026-06-11
Status: Accepted for the current local workspace UI.

## Direction

Agentique UI uses a dark local-workspace visual system that mirrors the public Agentique product language: near-black application chrome, translucent operational surfaces, cyan as the primary action accent, warm coral for caution and handoff emphasis, and lime for verified proof states.

The UI is an operational console, not a marketing page. It should keep resource identity, verification, preview, and handoff states dense, readable, and reversible.

## Token Model

The first implementation uses native CSS custom properties for:

- application background and elevated surfaces
- text, muted text, and border colors
- cyan, warm, lime, success, and danger states
- spacing, card radius, focus rings, and shadow depth

Cards and controls stay at an 8px radius or less. Motion is restricted to state feedback and must respect reduced-motion preferences.

## Dependency Decision

No new visual dependency is added at this stage.

- shadcn/ui is used as a component taxonomy reference only.
- Magic UI is used as an interaction-pattern reference only.
- Aceternity UI is used as a layout-pattern reference only.
- Tailwind and animation libraries are deferred until a concrete component need justifies the setup cost.

This keeps the public repository small, preserves the existing validation path, and avoids importing animation-heavy patterns into a safety-oriented local workspace.

## Public Boundary

Public files must not mention internal planning paths, private item codes, local absolute paths, secrets, or unvalidated release claims. The visual redesign does not add installer, updater, production desktop runtime, hosted runtime, universal runtime, generic shell execution, or automatic arbitrary-resource execution capability.
