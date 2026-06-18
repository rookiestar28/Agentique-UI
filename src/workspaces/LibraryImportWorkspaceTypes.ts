import type { LibraryUpdateLifecycle } from "./LibraryUpdateLifecycleTypes";

export type AnyRecord = Record<string, any>;
export type { LibraryUpdateLifecycle, LibraryUpdateLifecycleEntry } from "./LibraryUpdateLifecycleTypes";

export type PermissionState = {
  environment: string;
  files: string;
  network: string;
  shell: string;
};

export type ResourceRow = {
  cleanupState: { status: string };
  digest: string;
  installState: { status: string };
  key: string;
  permissionState: PermissionState;
  provenance: {
    signer: string;
    verificationStatus: string;
  };
  resourceId: string;
  supportMode: string;
  title: string;
  version: string;
};

export type ImportValidation = {
  errors?: Array<{ message: string }>;
  intent?: {
    audience: string;
    nonce: string;
    origin: string;
    resource: {
      id: string;
      version: string;
    };
  };
  ok: boolean;
};

export type SessionSummary = {
  artifacts: number;
  cleanupStatus: string;
  eventCount: number;
  failures: number;
};

export type SessionEvent = {
  label: string;
  type: string;
};

export type CompanionReadbackReview = {
  agentNative: {
    privateAvailability: string;
    state: string;
  };
  badge: {
    description: string;
    label: string;
    state: string;
  };
  detail: {
    downloadAvailability: string;
    status: string;
  };
  download: {
    downloadKind: string;
    digestValid: boolean;
    method: string | null;
  };
  parserVariant: {
    state: string;
    variantCount: number;
  };
  readOnly: {
    authRequired: boolean;
    mutationMethods: boolean;
  };
  trust: {
    platformState: string;
    trustPanelState: string | null;
  };
};

export type CompanionValidatorProofRow = {
  detail: string;
  label: string;
  status: string;
};

export type CompanionValidatorProof = {
  decision: string;
  proofRows: CompanionValidatorProofRow[];
  summary: {
    agentNativeState: string;
    findingCount: number;
    inventoryFiles: number;
    parserVariantState: string;
  };
};

export type CompanionAcquisitionProofRow = {
  detail: string;
  label: string;
  status: string;
};

export type CompanionAcquisitionProof = {
  cleanup: {
    status: string;
  };
  decision: string;
  integrity: {
    actualBytesWritten: number;
    digestMatches: boolean;
    expectedSizeBytes: number;
    sizeMatches: boolean;
  };
  plan: {
    finalPathReference: string;
    transferMode: string;
  };
  proofRows: CompanionAcquisitionProofRow[];
};

export type CompanionUploaderPreviewRow = {
  detail: string;
  label: string;
  status: string;
};

export type CompanionUploaderPreview = {
  boundary: {
    liveUploadAvailable: boolean;
    submissionMode: string;
  };
  decision: string;
  draft: {
    draftOnly: boolean;
    submitted: boolean;
  };
  patchDelta: {
    operationCount: number;
    partialUpdateOnly: boolean;
    submitted: boolean;
  };
  plans: {
    agentNative: {
      ok: boolean;
    };
    import: {
      ok: boolean;
      sourceEcosystem: string | null;
      sourceFormat: string | null;
    };
    upload: {
      readyForReviewSubmit: boolean;
    };
    variant: {
      readyForDownloadCount: number;
      sourceOnlyCount: number;
    };
  };
  previewRows: CompanionUploaderPreviewRow[];
};

export type ExternalIntakeFinding = {
  blocking: boolean;
  code: string;
  details?: Record<string, unknown>;
  path: string;
  severity: string;
};

export type ExternalIntakeReport = {
  boundary: {
    advisoryOnly: boolean;
    localOnly: boolean;
    noExecution: boolean;
    noNetwork: boolean;
    noUpload: boolean;
  };
  decision: string;
  findings: ExternalIntakeFinding[];
  licenses: Array<{
    normalized: string | null;
    policy: string;
  }>;
  policy: {
    maxBytes: number;
    maxFiles: number;
  };
  schemaVersion: string;
  summary: {
    blockingFindings: number;
    bytes: number;
    files: number;
    findings: number;
  };
};

export type PlatformAdapterRow = {
  blockedFindings: number;
  credentialReferences: number;
  decision: string;
  edges: number;
  expressions: number;
  label: string;
  nodes: number;
  platform: string;
};

export type PlatformAdapterReview = {
  boundary: {
    grantsRuntimeCompatibility: boolean;
    noExecution: boolean;
    noNetwork: boolean;
    noPackageInstall: boolean;
    parseOnly: boolean;
  };
  decision: string;
  platformRows: PlatformAdapterRow[];
  schemaVersion: string;
  summary: {
    accepted: number;
    blocked: number;
    edges: number;
    nodes: number;
    platforms: number;
  };
};

export type PlatformIrRow = {
  blocked: number;
  decision: string;
  degraded: number;
  edges: number;
  handoffOnly: number;
  nodes: number;
  normalized: number;
  platform: string;
  preserved: number;
};

export type PlatformIrReview = {
  boundary: {
    grantsRuntimeCompatibility: boolean;
    noExecution: boolean;
    noSchedulerStart: boolean;
    reviewOnly: boolean;
  };
  platformRows: PlatformIrRow[];
  schemaVersion: string;
  summary: {
    blocked: number;
    degraded: number;
    edges: number;
    handoffOnly: number;
    nodes: number;
    normalized: number;
    platforms: number;
    preserved: number;
    semanticNormalized: number;
  };
};

export type PlatformCapabilityRow = {
  blocked: number;
  decision: string;
  executable: number;
  handoffOnly: number;
  nodes: number;
  permissionRequired: number;
  platform: string;
};

export type PlatformCapabilityMatrixRow = {
  executionLane: string;
  nodes: number;
  platform: string;
  primaryClassification: string;
  sourceFamily: string;
};

export type PlatformCapabilityReview = {
  boundary: {
    grantsRuntimeCompatibility: boolean;
    noCredentialRead: boolean;
    noExecution: boolean;
    noSchedulerStart: boolean;
    reviewOnly: boolean;
  };
  matrixRows: PlatformCapabilityMatrixRow[];
  platformRows: PlatformCapabilityRow[];
  schemaVersion: string;
  summary: {
    blocked: number;
    executable: number;
    handoffOnly: number;
    nodes: number;
    permissionRequired: number;
    sourceFamilies: number;
  };
};

export type LibraryWorkspaceProps = {
  companionAcquisitionProof: CompanionAcquisitionProof;
  companionReadbackReview: CompanionReadbackReview;
  libraryRows: ResourceRow[];
  libraryUpdateLifecycle: LibraryUpdateLifecycle;
  primaryResource: ResourceRow;
  sessionEvents: SessionEvent[];
  sessionSummary: SessionSummary;
};

export type ImportWorkspaceProps = {
  companionAcquisitionProof: CompanionAcquisitionProof;
  companionReadbackReview: CompanionReadbackReview;
  companionUploaderPreview: CompanionUploaderPreview;
  companionValidatorProof: CompanionValidatorProof;
  externalIntakeError: string;
  externalIntakeReport: ExternalIntakeReport;
  externalIntakeScanState: string;
  externalIntakeSelectedCount: number;
  intentText: string;
  onExternalIntakeFilesSelected: (files: FileList | null) => void;
  onIntentTextChange: (value: string) => void;
  onLoadBlockedExternalIntakeSample: () => void;
  onLoadExample: () => void;
  onLoadExternalIntakeSample: () => void;
  onResetExternalIntake: () => void;
  onRunExternalIntakeScan: () => void;
  onValidateIntent: () => void;
  platformAdapterReview: PlatformAdapterReview;
  platformCapabilityReview: PlatformCapabilityReview;
  platformIrReview: PlatformIrReview;
  primaryResource: ResourceRow;
  selectedResource: string;
  sourceRoundTripHandoff: AnyRecord;
  validation: ImportValidation;
};
