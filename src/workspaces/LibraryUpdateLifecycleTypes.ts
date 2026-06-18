export type LibraryUpdateLifecycleEntry = {
  cleanup: {
    receipt: {
      kind: string;
      path: string;
    };
    required: boolean;
    staleVersions: string[];
  };
  current: {
    digest: string;
    version: string;
  };
  digestComparison: {
    status: string;
  };
  failClosed: Array<{
    code: string;
    message: string;
  }>;
  offline: {
    cachedMetadataUsable: boolean;
    cloudSessionState: string;
    noCloudSessionRequired: boolean;
  };
  preview: {
    allowed: boolean;
    decision: string;
    executesCode: boolean;
    installAutomatically: boolean;
    requiresCloudSession: boolean;
    reviewOnly: boolean;
  };
  provenanceComparison: {
    status: string;
  };
  rollback: {
    available: boolean;
    targetVersion: string;
  };
  state: string;
};

export type LibraryUpdateLifecycle = {
  entries: LibraryUpdateLifecycleEntry[];
  schemaVersion: string;
};
