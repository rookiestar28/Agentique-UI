# GitHub Draft Release Workflow

Status: configured workflow, publication remains draft-only and maintainer-gated.

Agentique UI uses a manual GitHub Actions workflow to prepare draft desktop release artifacts. The workflow validates the public repository, builds platform bundles on Windows, macOS, and Linux runners, uploads artifacts for review, generates checksums and SBOM metadata, and requests artifact provenance attestations.

## Trigger And Publication Mode

The workflow is manual-only through `workflow_dispatch`. It does not create a stable public release automatically. When draft assembly is enabled, the release command uses GitHub's draft mode so maintainers can review platform signing, updater, smoke, checksums, SBOM, provenance, and public documentation evidence before publication.

## Matrix Coverage

The workflow calls the public release build scripts:

- `npm run tauri:build:windows`
- `npm run tauri:build:macos`
- `npm run tauri:build:linux`

Each platform job runs its release gate before building.

## Evidence Artifacts

The workflow prepares:

- platform bundle artifacts,
- SHA-256 checksum files,
- npm SBOM output,
- Cargo metadata,
- provenance attestations.

Release artifacts remain draft review material until the platform gates, updater gate, clean-environment smoke gate, and final launch gate pass.

## Action And Permission Policy

The workflow uses reviewed official GitHub actions with major-version pins. Permissions are limited to contents, identity token, and attestations for draft release assembly and provenance. Signing secrets are not defined in the workflow and must be configured separately by repository owners before release-ready jobs can pass.

The release workflow gate is validated with:

```powershell
npm run validate:release-workflow
```
