# Resource Bundle Contract

Agentique UI consumes versioned resource bundle manifests. A bundle tells the app what a resource is, what support modes are complete, what files are present, what capabilities are referenced, and what verification/provenance state is expected.

Schema: `schemas/agentique-resource-bundle.schema.json`

Valid example: `examples/resource-bundle.valid.json`

## Source Metadata Mapping

When a bundle is created from public source metadata, the UI maps readback, import metadata, and POST handoff metadata into the same bundle contract. Resource id and version rules match the import intent contract, including dot, colon, hyphen, underscore, and local version suffix decisions. The mapper preserves POST handoff metadata as guidance and verification requirements; it does not embed a final byte URL or claim a scoped GET ticket.

## Support Modes

Every bundle must declare at least one support mode:

| Mode | Meaning |
|---|---|
| `catalog-only` | Save, inspect metadata, and read documentation. |
| `visualizable` | Render docs, metadata, artifacts, or graph summaries. |
| `editable` | Edit an Agentique-owned typed representation and revalidate. |
| `dry-runnable` | Validate or simulate without side effects. |
| `locally-runnable` | Execute supported behavior through the controlled local runner when capability, adapter, permission, artifact, and cleanup gates pass. |
| `external-handoff` | Export, install, open, copy, or bridge to a user-owned client/runtime. |

## No Dead-End Rule

Published bundles must not leave users with "downloaded, but the UI does not know what to do" behavior. If local execution is not supported, the bundle still needs a complete catalog, visualization, guide, export, install helper, or external handoff path.

## Secret Boundary

The manifest may contain secret references such as `secret-ref:optional-api-token`. It must not contain secret values. UI surfaces must store secret values only through a local vault/keychain abstraction.

## Non-Claims

This contract does not create a downloader, signer, installer, hosted runtime, universal workflow runtime, or automatic execution path. Local execution remains limited to resources that separately pass the runner capability gate.
