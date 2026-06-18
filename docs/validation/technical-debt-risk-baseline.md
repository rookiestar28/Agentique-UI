# Technical Debt Risk Baseline

This repository keeps a source-measured baseline for known technical debt and release-risk categories. The baseline is intentionally factual: it records current debt, corrects over-broad local recommendations, and keeps deferred work visible without claiming that the debt has already been fixed.

Run it with:

```bash
npm run validate:tech-debt-risk-baseline
```

The baseline checks:

- large source files and concentrated workspace modules;
- app-shell state concentration and route adapter status;
- hash navigation synchronization behavior;
- global stylesheet size;
- inline locale catalog size;
- build payload measurements when build assets are present;
- validation script surface area;
- missing lint and formatting baseline;
- JavaScript type-checking posture;
- final release gate drift;
- native runner blocked-by-default posture;
- sample data versus live readback and download adapter boundaries.

The baseline also records four recommendation corrections:

- workspaces are conditionally rendered, although app-shell derivations are still centralized;
- Run and Graph have guarded local execution evidence and canvas behavior, while native process execution remains gated;
- the data layer is not static-only because readback, acquisition, and scanner adapters exist, although sample data remains visible;
- state, routing, and image tooling dependencies are optional decisions that require item-level justification.

This document does not add public documentation wording tests. Public documentation remains manually reviewed unless that policy is reopened.
