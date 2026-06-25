# Companion Integration Closeout

This closeout records the accepted local Agentique UI companion integration scope after the first companion capability chain. The accepted source baseline is package version `0.2.1` at source revision `2621a33ba9cd83b125ffaabeec7817abc3c52719`.

Accepted local-static surfaces:

- `@agentique.io/readback` for read-only readback and badge projection.
- `@agentique.io/readback` for safe download acquisition proof based on public download metadata.
- `@agentique.io/validator` for static validator import proof.
- `@agentique.io/validator` for browser-local external intake scanner evidence.
- `@agentique.io/uploader` for review-only uploader preview, draft preview, and patch preview.
- `@agentique.io/action` as CI reference only, not as desktop runtime code.

The desktop workspace keeps these features local and bounded. Readback is GET-only; validator and intake surfaces are static and no-execution; download acquisition is a proof boundary with explicit destination, size, digest, atomic-write, and cleanup evidence; uploader support remains review-only with `liveUploadAvailable=false`.

Later readback/acquisition alignment keeps the same public boundary while tightening fail-closed semantics: canonical `sourcePackage` metadata is authoritative for download availability, `DOWNLOADABLE` requires a POST ticket endpoint plus safe file metadata and SHA-256 digest, and metadata-only, malformed, placeholder, source-index, schema-only, or review-only package metadata stays blocked before acquisition proof.

## Drift Gate

The closeout gate fails closed when:

- the accepted companion source revision or package version changes,
- required package surfaces are missing,
- adapter schema versions drift,
- capability evidence is missing or not accepted,
- evidence references are not path-neutral,
- public-safety checks are missing.

This keeps Agentique UI aligned with the source package semantics it consumed without importing or executing companion repository code at runtime.

## Blocked Claims

This closeout does not add or imply:

- authenticated review submission,
- upload status polling,
- upload token storage,
- live upload availability,
- review approval,
- moderation approval,
- registry package publication,
- release governance execution,
- GitHub Action runtime,
- package lifecycle execution,
- arbitrary external repository execution,
- direct install,
- platform download readiness,
- installer or updater availability,
- hosted runtime,
- universal runtime,
- production desktop runtime.

Those capabilities remain deferred behind separate evidence gates and user-visible consent boundaries.

## Public Safety

Public Agentique UI source, docs, scripts, and tests must stay free of private planning markers, local absolute paths, credentials, tokens, private keys, browser storage, cloud credentials, package tokens, signing material, and private evidence references.

Validation requires public-boundary and no-secret checks, focused closeout tests, package validation wiring, and full local validation before any public claim changes.
