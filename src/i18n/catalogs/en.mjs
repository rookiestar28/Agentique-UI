const messages = {
  app: {
    ariaLabel: "Agentique UI local workspace",
    brandName: "Agentique UI",
    brandSubtitle: "Local workspace"
  },
  shell: {
    primaryNavigation: "Primary navigation",
    workspacePages: "Workspace pages",
    mobileWorkspaceNavigation: "Mobile workspace navigation",
    openWorkspaceNavigation: "Open workspace navigation",
    closeWorkspaceNavigation: "Close workspace navigation",
    workspaceNavigationTitle: "Workspace navigation"
  },
  navigation: {
    library: "Library",
    import: "Import",
    verify: "Verify",
    preview: "Preview",
    graph: "Graph",
    run: "Run",
    handoff: "Handoff",
    settings: "Settings"
  },
  page: {
    library: {
      caption: "Library",
      title: "Local resource library"
    },
    import: {
      caption: "Import",
      title: "Open a resource safely"
    },
    verify: {
      caption: "Verify",
      title: "Review trust and validation gates"
    },
    preview: {
      caption: "Preview",
      title: "Inspect static resource output"
    },
    graph: {
      caption: "Graph",
      title: "Edit workflow descriptors safely"
    },
    run: {
      caption: "Run",
      title: "Review controlled execution"
    },
    handoff: {
      caption: "Handoff",
      title: "Prepare non-executing handoff"
    },
    settings: {
      caption: "Settings",
      title: "Local configuration and secrets"
    }
  },
  workspace: {
    loading: "Loading workspace",
    library: { caption: "Library", title: "Resource browser", proofSummary: "Resource library proof summary" },
    import: {
      caption: "Import entry",
      title: "Open a resource safely",
      intentLabel: "Import content",
      loadExample: "Load example",
      externalIntakeLabel: "External intake scanner",
      runStaticScan: "Run static scan",
      loadSafeSample: "Load safe sample"
    },
    preview: {
      caption: "Safe preview",
      note: "Static inspection only; no resource code, media bytes, or local paths are loaded.",
      staticFileTree: "Static file tree",
      previewMode: "Preview mode"
    },
    handoff: {
      caption: "Handoff",
      title: "descriptor",
      descriptorReview: "Descriptor review",
      safetyFlags: "Execution safety flags",
      agentClientCaption: "Agent client",
      agentClientTitle: "Review-only handoff plan",
      externalRuntimeCaption: "External runtime",
      externalRuntimeTitle: "Descriptor-only handoff"
    },
    graph: {
      caption: "Workflow graph canvas",
      title: "Agentique IR visualizer",
      subtitle: "Guarded local execution, permission-reviewed only",
      modeLabel: "Graph editor mode",
      editor: "Editor",
      executions: "Executions",
      evaluations: "Evaluations",
      review: "Review",
      validationSummary: "Graph validation summary",
      canvasControls: "Graph canvas controls",
      capabilityMatrix: "Graph execution capability matrix",
      canvasLabel: "Workflow graph canvas with visible nodes and edges"
    },
    verify: { caption: "Verification", title: "Import gate" },
    run: { caption: "Controlled execution", title: "Signed adapter review" }
  },
  command: {
    ariaLabel: "Command and status bar",
    selectedResource: "Selected resource",
    resetIntent: "Reset import content",
    validateIntent: "Validate import content"
  },
  settings: {
    sectionCaption: "Settings",
    permissionHeading: "No permission grants",
    permissionPostureLabel: "No-permission posture",
    files: "Files",
    network: "Network",
    shell: "Shell",
    environment: "Environment",
    language: {
      caption: "Language",
      heading: "Language",
      label: "Interface language",
      description: "Choose the language used by application chrome and workspace controls.",
      storageNote: "The choice is stored locally on this device.",
      fallbackNote: "Unsupported saved values fall back to English."
    },
    release: {
      caption: "Distribution",
      heading: "Release readiness gate",
      summaryLabel: "Distribution readiness summary",
      blockersLabel: "Distribution readiness blockers",
      blockerScope: "release",
      status: "Status",
      platforms: "Platforms",
      blockers: "Blockers",
      bundling: "Bundling",
      noInstallerClaimTitle: "No released installer claim",
      noInstallerClaimBody: "Installer, signing, updater, rollback, provenance, install smoke, uninstall smoke, and clean-environment evidence must be complete before release readiness can pass."
    },
    config: {
      caption: "Config draft",
      heading: "ui.schema.json renderer",
      draftLabel: "Typed config draft",
      actionsLabel: "Draft actions",
      resetDraft: "Reset draft",
      importDraft: "Import draft",
      exportRedactedDraft: "Export redacted draft",
      draftDifferences: "{count} draft differences",
      exportUsesRedactedValues: "Export uses redacted display values.",
      exportBlockedByInvalidSchema: "Export blocked by invalid schema.",
      invalidSchemaTitle: "Invalid schemas fail closed",
      invalidSchemaBody: "Unknown fields, unsafe secret fields, and invalid values block import/export."
    },
    vault: {
      caption: "Vault",
      heading: "Local secret references",
      summaryLabel: "Vault redaction summary",
      listLabel: "Reference-only vault records",
      references: "references",
      inlineValues: "inline values",
      screenshotsRedacted: "screenshots redacted",
      exportsRedacted: "exports redacted",
      keychainStatus: "keychain {status}",
      lifecycleStates: "{count} lifecycle states",
      supportBundleRedacted: "support bundle redacted",
      secretValuesTitle: "Secret values stay out of packages and logs",
      secretValuesBody: "Only vault references and redacted placeholders may appear in UI, exports, artifacts, screenshots, or failure records."
    }
  },
  common: {
    ready: "ready",
    blocked: "blocked",
    enabled: "enabled",
    disabled: "disabled",
    invalid: "invalid"
  }
};

export default messages;
