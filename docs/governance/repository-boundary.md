# Repository Boundary

Agentique UI is an independent public repository line. It is not a subdirectory, submodule, or feature branch of the separate Agentique web/catalog systems, and it is not an automatic extension of the public companion repository.

## Ownership Areas

| Area | Owner |
|---|---|
| Local-first desktop/workspace UX | Agentique UI |
| Public schemas and compatibility fixtures in this repo | Agentique UI, until a shared public schema package is approved |
| Catalog, moderation, download metadata, checksums, signatures, and web community features | Agentique web/catalog systems |
| Public companion SDKs and CLI helpers | Public companion project when explicitly approved |
| Desktop signing, release channel, updater metadata, rollback, and vulnerability response | Agentique UI release owner before any runnable release |

## Boundary Rules

- Public files must not contain private planning identifiers, local absolute paths, credentials, cookies, tokens, private keys, or private operator notes.
- This repository must not claim an installable production desktop runtime until installer, signing, update, rollback, security, accessibility, and public-boundary evidence exists.
- Resource execution is blocked by default outside supported-local-only evidence gates. Supported local runs require signed adapter packs, explicit permissions, local secrets isolation, audit logs, and cleanup evidence.
- Unsupported resources must still have a complete support path: catalog inspection, visualization, documentation, export, install helper, or external handoff.

## Initial Approval State

The initial repository name is `Agentique-UI`. The repository starts as a public-safe contract and governance workspace. License, publication model, signing owner, and release-channel owner must be confirmed before any installable production desktop release.
