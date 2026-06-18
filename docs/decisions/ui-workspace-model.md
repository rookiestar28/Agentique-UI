# UI Workspace Model Decision

Date: 2026-06-12
Status: Accepted for the full interface rebuild.

## Purpose

Agentique UI is a local resource workspace. The interface must help a user inspect a downloaded Agentique resource, understand trust state, preview safe artifacts, review graph structure, review supported-local-only run readiness, and prepare handoff without implying automatic arbitrary-resource execution.

The previous surface proved the contracts, but too much of the UI was presented as bordered summary boxes. This rebuild replaces dashboard-style card dumps with task-native workspaces.

## Style Sources

### Overall Feel

- Apple is the quality reference for restraint, hierarchy, spacing, product-first polish, and native-feeling interaction.
- Agentique.io is the product identity reference: dark trust-oriented surfaces, adoption context, provenance, compatibility, and comparison before use.

Do not copy either site's assets, brand treatments, marketing structure, or content. Translate the qualities into a local desktop workspace.

### Component And Interaction References

- shadcn/ui is a component taxonomy reference: buttons, badges, dialogs, tables, forms, tabs, tooltips, sidebars, separators, and scroll areas.
- React Aria is the accessibility and interaction reference: keyboard behavior, ARIA semantics, adaptive input, touch behavior, and internationalization.
- Magic UI, Aceternity UI, and React Bits may inform small module ideas such as command palettes, file trees, timelines, empty states, border emphasis, and reduced-motion-safe micro-interactions.

These sources are references, not a license to import visual noise. Bento grids, decorative shader backgrounds, cursor effects, and landing-page spectacle are not accepted as page layouts for Agentique UI.

## No-Bento Rule

The main workspace must not be a wall of cards or a metric grid. Repeated bordered boxes are allowed only when they are the natural shape of the task, such as table rows, inspector fields, checklist rows, toolbar groups, or graph nodes.

Rejected page patterns:

- summary cards used as the primary content for every tab,
- bento grids for status metrics,
- decorative feature blocks,
- repeated panels that only mirror API fields,
- static graph cards pretending to be a workflow editor.

Accepted workspace patterns:

- shell with navigation, resource context, and command actions,
- split pane for list/detail work,
- table or list for resources and audit rows,
- form for configuration and settings,
- checklist for trust and validation gates,
- viewer for artifacts and previews,
- inspector for selected object details,
- canvas for workflow graph structure.

## Workspace Map

### Library And Import

Primary job: choose or import one resource and understand its local status.

Pattern:

- resource list or table,
- selected-resource detail pane,
- import-intent editor,
- verification entry status line,
- provenance and digest details on demand.

Avoid:

- resource metrics as cards,
- separate proof boxes for every field.

### Verify And Permissions

Primary job: decide whether the package is safe to inspect or hand off.

Pattern:

- trust checklist,
- permission audit table,
- capability policy editor,
- clear block/warn/pass states with text labels.

Avoid:

- proof-summary grids,
- color-only status.

### Preview And Artifacts

Primary job: inspect safe outputs without loading or executing unsafe content.

Pattern:

- file tree,
- viewer pane,
- metadata inspector,
- source/code/log presentation where useful.

Avoid:

- decorative preview cards,
- local path disclosure,
- inline secret display.

### Graph

Primary job: understand workflow shape, risk, credentials, unsupported nodes, and handoff readiness.

Pattern:

- real node/edge canvas,
- pan, zoom, and fit controls,
- selected-node inspector,
- validation/risk overlays,
- unsupported-node report,
- supported-local-only/no-overclaim guard.

Avoid:

- static row of graph cards,
- edge chips as the only edge visualization,
- raw third-party workflow mutation.

### Run And Settings

Primary job: review controlled-execution readiness and local policy without granting hidden access.

Pattern:

- adapter trust table,
- permission audit table,
- run-manifest inspector,
- settings form,
- release/readiness blockers as rows.

Avoid:

- status-card grids,
- hidden shell/network/environment grants.

### Handoff

Primary job: prepare a reversible export, install, bridge, or external-runtime descriptor.

Pattern:

- target list,
- descriptor preview,
- compatibility report,
- reversible action controls,
- descriptor-only handoff language.

Avoid:

- command-shaped text that implies execution,
- private input fields in outputs.

## Accessibility And Motion

- Native controls are preferred over custom ARIA controls.
- Every interactive control must be keyboard reachable.
- Focus states must be visible.
- Touch targets must meet at least WCAG 2.2 AA minimum target-size expectations.
- Text and UI component contrast must pass WCAG AA.
- Motion must be short, functional, and disabled or simplified under `prefers-reduced-motion`.
- Color is never the only state indicator.

## Acceptance Checklist

- The rebuilt app no longer uses page-level bento/card grids as its main layout.
- The graph surface is a real canvas with visible nodes and edges.
- Tables, forms, checklists, inspectors, viewers, and canvas areas are used according to task.
- All safety states remain visible: verification, permissions, secrets, unsupported nodes, release blockers, supported-local-only gates, and no-overclaim boundaries.
- Public text contains no internal planning markers, private local paths, secrets, or unsupported installer/updater/runtime claims.
