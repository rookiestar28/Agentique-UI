# Core Alignment Closeout

Status: contract alignment complete; desktop distribution remains No-Go.

This closeout records the current public Agentique UI source state after the core contract alignment work. The UI now has validation coverage for the public readback envelope, POST download handoff posture, import deep link, resource bundle projection, workflow graph projection, contract fixture drift gate, and fixture-backed local import smoke.

Validated public alignment surfaces:

- Public readback envelope and resource identity are consumed through deterministic fixtures.
- POST download handoff metadata is preserved without embedding final byte URLs in metadata.
- Import deep links are parsed as untrusted intent and grant no authorization, download, execution, or permission by themselves.
- Resource bundle projection creates a local-library record and support-mode fallback without claiming direct install or arbitrary local execution.
- Workflow graph projection maps source graph metadata into UI workflow IR while preserving unsupported-node and supported-local-only boundary state.
- Contract fixture drift validation fails closed when route, method, schema, identity, bundle, graph, or release-claim fields drift.
- Fixture-backed local import smoke verifies deterministic bytes by size and SHA-256 digest before local library import.

Current non-claims:

- No released installer.
- No signed updater.
- No production desktop runtime or broad native backend claim.
- No public SDK or broker publication.
- No automatic execution of arbitrary downloaded resources.
- No live production byte-transfer claim from this closeout.

Validation gate:

- `npm run validate`

The release gates intentionally remain blocked until installer artifacts, updater metadata, platform signing, clean-environment smoke, provenance, rollback, and maintainer review evidence exist.
