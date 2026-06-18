export const workspaceCopyBoundary = Object.freeze({
  version: "agentique.workspaceCopyBoundary.v1",
  files: Object.freeze([
    Object.freeze({
      path: "src/workspaces/LibraryWorkspace.tsx",
      literalCount: 36,
      untranslatedHash: "92aa3d55304e5d826b50274d7b07af0b28b164fa58175b06f4b4490df8bb950c",
      literals: Object.freeze([
        Object.freeze({
          category: "sample-data",
          reason:
            "Resource names, local library states, update lifecycle states, readback values, and proof rows are fixture or user/resource data rather than translatable app chrome.",
          examples: Object.freeze(["Companion readback", "Download proof", "Update states"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "Selectors, state names, compact delimiters, and technical proof labels stay stable for validation and evidence contracts.",
          examples: Object.freeze(["Digest", "review-only", "library-cleanup"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/ImportWorkspace.tsx",
      literalCount: 99,
      untranslatedHash: "484a6c704b2dab4c53f1304e76dfcc7167bf54970376a9c2c333f644cd5a7c2d",
      literals: Object.freeze([
        Object.freeze({
          category: "sample-data",
          reason: "Import examples, parser summaries, source platform handoff rows, and proof rows are fixture or user/resource data rather than translatable app chrome.",
          examples: Object.freeze(["Manifest/schema", "Acquisition bridge", "Platform format adapter intake"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "Selectors, state names, compact delimiters, and technical proof labels stay stable for validation and evidence contracts.",
          examples: Object.freeze(["advisory-only / no-upload", "agentique-ui required", "review-only"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/PreviewHandoffWorkspaces.tsx",
      literalCount: 35,
      untranslatedHash: "af6cabbeeb637fac4ec576a048b1e3102319847dec5b2738e73f6e49e8bb973d",
      literals: Object.freeze([
        Object.freeze({
          category: "imported-content",
          reason: "Preview file names, descriptor values, target names, and compatibility rows describe imported or generated handoff content.",
          examples: Object.freeze(["file", "descriptor", "output"])
        }),
        Object.freeze({
          category: "runtime-evidence",
          reason: "Handoff proof statuses and no-execution evidence values remain stable data for safety review.",
          examples: Object.freeze(["Not executed", "Disabled", "descriptor only"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/GraphWorkspace.tsx",
      literalCount: 114,
      untranslatedHash: "169e55ac2e1a670e9f0d171738ea2d41cdb8f5b4ef5a1dec3266790009a0ef1c",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason: "Graph node classifications, runner statuses, permission samples, and audit rows are deterministic execution evidence.",
          examples: Object.freeze(["Executable", "Permission required", "Handoff only"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "Graph controls include compact labels, SVG identifiers, CSS custom properties, and IR/status tokens that validators rely on.",
          examples: Object.freeze(["Zoom in", "Current graph zoom", "graph-arrow"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/RunWorkspace.tsx",
      literalCount: 239,
      untranslatedHash: "0a4ea65283a8c58b520370306ad7f731e2e261d4ca662bb3d00958e4097be338",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason: "Run pages show scheduler state, permission evidence, run history, cleanup receipts, adapter lane outputs, approval checkpoints, and sidecar gate evidence.",
          examples: Object.freeze(["Idle", "Adapter lane event timeline", "Run history"])
        }),
        Object.freeze({
          category: "sample-data",
          reason: "Permission states, adapter metadata, run-folder records, release blockers, and sidecar evidence are fixture-backed data values.",
          examples: Object.freeze(["Digest proof", "Provenance signer", "Permission audit"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/AdapterRegistryTrustPanel.tsx",
      literalCount: 50,
      untranslatedHash: "cfa373cf3de804cacb0250124b29cec1952cac57fb74b964b53c53c1411e5995",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason: "Adapter registry trust-policy rows show signer, license, revocation, update, permission ceiling, profile, mode, host, and drift evidence.",
          examples: Object.freeze(["Adapter registry manifest trust policy", "Revocation overrides compatibility", "Adapter blocked trust reasons"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "Trust-policy reason codes, host/profile/mode labels, and permission-family decisions remain stable validation evidence.",
          examples: Object.freeze(["registry ceiling", "review required", "no new lane"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/PythonNodeAdapterPackExpansionPanel.tsx",
      literalCount: 19,
      untranslatedHash: "25fd1ba35b88f6d77f2be37e86d1d51a40fa09acdcdf2e96becde8495c245052",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason: "Python/Node adapter pack rows show signed manifest, host prerequisite, permission ceiling, watchdog, artifact, cleanup, and package lifecycle denial evidence.",
          examples: Object.freeze(["Python and Node adapter pack expansion", "Host prerequisite receipts", "Package lifecycle denial"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "Adapter ids, validation commands, status codes, and denial labels remain stable proof data for validation and review.",
          examples: Object.freeze(["adapter.local-python", "blocked-before-launch", "descriptor-only pack review"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/RepoLocalTaskRunnerLanePanel.tsx",
      literalCount: 24,
      untranslatedHash: "2c65000b5800d98bbae4aef75625581654ecb35383857ee3b6cb7307f38ee417",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason: "Repo-local task runner rows show manifest, fixed command, dry-run, approval, scope, env whitelist, artifact, cleanup, and audit evidence.",
          examples: Object.freeze(["Repo-local task runner lane", "Approved fixed commands", "Dry-run and approval receipts"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "Task ids, command ids, denial codes, and receipt labels remain stable proof data for validation and review.",
          examples: Object.freeze(["task.validate-public", "blocked-before-launch", "descriptor-only task review"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/ExternalAgentClientPackExpansionPanel.tsx",
      literalCount: 32,
      untranslatedHash: "8ddd170a1768f3b88a92d56edcbbfb9282b247a5965c213f10a133fbb2eab505",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason: "External agent client pack rows show static descriptor output, provenance, compatibility, drift, destination, cleanup, rollback, and denied authority evidence.",
          examples: Object.freeze(["External agent-client packs", "Static review-only output", "Blocked install samples"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "Client ids, target families, receipt labels, and denial codes remain stable proof data for validation and review.",
          examples: Object.freeze(["codex", "mcp-client", "blocked-before-launch"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/McpBridgeReadinessPanel.tsx",
      literalCount: 30,
      untranslatedHash: "7fd332096d6be98ed754528e617bb59b13ea34194f39fed68900b8c8735967ca",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason:
            "MCP readiness rows show server trust states, tool/resource/prompt listing metadata, vault references, user-action gates, audit receipts, and denied authority evidence.",
          examples: Object.freeze(["MCP bridge readiness", "Server trust states", "Blocked MCP samples"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "MCP server ids, protocol states, vault-reference previews, gate ids, and blocked reason codes remain stable proof data for validation and review.",
          examples: Object.freeze(["local-review-required", "vault:mcpLocalFilesystem", "blocked-before-launch"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/WasmWasiSandboxGatePanel.tsx",
      literalCount: 45,
      untranslatedHash: "146d9c1158e726a55c727abdce16f1e74e54b0f6e2e1d80dfa13649a698cf395",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason: "WASM/WASI sandbox gate rows show preflight status, execution decision, limits, capability grants, watchdog, artifact receipts, and blocked unsafe samples.",
          examples: Object.freeze(["WASM/WASI sandbox gate", "Execution decision", "Blocked unsafe WASM samples"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "Sandbox status codes, capability modes, grant labels, metering labels, and runtime claim labels remain stable proof data for validation and review.",
          examples: Object.freeze(["disabled-pending-runtime-evidence", "loopback-only", "fuel"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/RootlessContainerPreflightGatePanel.tsx",
      literalCount: 59,
      untranslatedHash: "fbe936f0b72e6666bb74d648dbb91acc612572400724a1e55ac294c5aa335580",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason:
            "Rootless container preflight rows show no-start status, runtime mode, rootless proof, image trust, resource limits, filesystem, network, cleanup, permission, and blocked sample evidence.",
          examples: Object.freeze(["Rootless container preflight gate", "No-start receipt", "Blocked unsafe container samples"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "Container status codes, rootless runtime labels, mount/network policy labels, and trust receipt labels remain stable proof data for validation and review.",
          examples: Object.freeze(["rootless", "read-only root", "no public port publishing"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/BrowserAutomationConsentGatePanel.tsx",
      literalCount: 51,
      untranslatedHash: "7ddc12a13ca9e2c11e2655e48731457e11f9296e614f617fedb75cd02fcb8bcb",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason:
            "Browser automation consent rows show isolated context, target scope, action scope, stop and cleanup receipts, redaction, permission, denied authority, and blocked sample evidence.",
          examples: Object.freeze(["Browser automation strict consent gate", "Context isolation", "Blocked unsafe browser automation samples"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "Consent status codes, browser isolation labels, redaction labels, and denied authority labels remain stable proof data for validation and review.",
          examples: Object.freeze(["isolated-non-persistent", "storage state capture remains denied", "remote-debugging-attach"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/LocalVaultSecretsPanel.tsx",
      literalCount: 35,
      untranslatedHash: "99c3f7362539db26e8ceee274bb6888034e447619c99d2090ffedfdc48b53bf2",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason:
            "Local vault rows show reference-only record status, keychain feasibility, lifecycle operation receipts, redaction evidence, denied authorities, and blocked unsafe samples.",
          examples: Object.freeze(["Local vault secrets UX", "Keychain feasibility", "Blocked unsafe vault samples"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "Vault status codes, redaction labels, support-bundle labels, and denied authority labels remain stable proof data for validation and review.",
          examples: Object.freeze(["reference-only records", "metadata-only", "raw-secret-export"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/DiagnosticsSupportBundlePanel.tsx",
      literalCount: 50,
      untranslatedHash: "ec2bad6104cd06a30c54fa2c480bd034177f6ab76003a5e5652ac07d59a60387",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason:
            "Diagnostics support bundle rows show descriptor-only status, environment and validation summaries, run and cleanup evidence, adapter drift, credential references, artifact lifecycle, denied materials, and blocked unsafe samples.",
          examples: Object.freeze(["Diagnostics support bundle", "Redacted support export", "Blocked unsafe support samples"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "Bundle section ids, redaction labels, denied material labels, and gate status values remain stable proof data for validation and review.",
          examples: Object.freeze(["descriptor-only", "raw-artifact-bytes", "runtime-overclaim"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/FunctionExpansionCloseoutPanel.tsx",
      literalCount: 27,
      untranslatedHash: "266783009ca543060636911a3ee9350eb18ae9a90b74e9032935c9e99e91865c",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason:
            "Function expansion closeout rows show accepted feature-family evidence, portability and drift mapping, graph handoff mapping, validation proof, and blocked release/runtime claims.",
          examples: Object.freeze(["Function expansion closeout", "Claim sync review", "No-Go claims"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "Feature ids, claim keys, status codes, and validation labels remain stable proof data for closeout review.",
          examples: Object.freeze(["accepted", "blocked", "source-first supported-local-only"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/VerifyWorkspace.tsx",
      literalCount: 31,
      untranslatedHash: "646f1fb47bb5a0a74fc54c524a5d44918ba1b4445fb42a8861e58b52515836f1",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason: "Verify pages show validation, permission posture, capability decisions, and dry-run evidence values.",
          examples: Object.freeze(["Accepted intent present", "Capability manifest", "Dry-run report"])
        }),
        Object.freeze({
          category: "technical-token",
          reason: "Capability and dry-run proof labels remain stable evidence contracts.",
          examples: Object.freeze(["ask before use", "allowed now", "blocked"])
        })
      ])
    }),
    Object.freeze({
      path: "src/workspaces/SettingsWorkspace.tsx",
      literalCount: 2,
      untranslatedHash: "bf9443905469fc148b4feceec6e2d6a132a9c40e04d1a7714eb3f4fbf52dca56",
      literals: Object.freeze([
        Object.freeze({
          category: "runtime-evidence",
          reason: "Settings includes stable data labels for generated config diff and local settings mode.",
          examples: Object.freeze(["Config diff and redaction", "settings"])
        }),
        Object.freeze({
          category: "sample-data",
          reason: "Release, permission, config, and vault values remain fixture-backed data values.",
          examples: Object.freeze(["Release status", "Vault reference"])
        })
      ])
    })
  ])
});
