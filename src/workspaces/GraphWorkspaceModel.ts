import { Braces, Clock3, FileText, GitBranch, GitMerge, type LucideIcon } from "lucide-react";

export type AnyRecord = Record<string, any>;

export type GraphNode = {
  id: string;
  type: string;
  label: string;
  inputs: string[];
  outputs: string[];
  risk: string;
  credentials: string[];
};

export type GraphEdge = {
  from: string;
  to: string;
  label: string;
};

export type LayoutGraphNode = GraphNode & {
  unsupported: boolean;
  x: number;
  y: number;
};

export type RunnerUiSession = {
  status: string;
  runId: string;
  lastAction: string;
  blockedReason: string;
  summary: {
    events: number;
    outputs: number;
    artifacts: number;
    cleanup: string;
    retries: number;
    failed: number;
    skipped: number;
    canceled: number;
    terminal: string;
  };
  logs: string[];
  artifacts: string[];
  permissionPreflight: {
    ok: boolean;
    status: string;
    required: number;
    allowed: number;
    blocked: number;
    auditEvents: number;
    artifactPath: string;
  };
  nodeResults: AnyRecord[];
  cleanup: {
    status: string;
    terminalRunStatus: string;
    removed: string[];
  };
};

export const supportedNodeTypes = new Set(["input", "transform", "viewer", "handoff"]);

export const defaultLayout: Record<string, { x: number; y: number }> = {
  source: { x: 84, y: 254 },
  normalize: { x: 326, y: 138 },
  classify: { x: 326, y: 392 },
  merge: { x: 628, y: 254 },
  intent: { x: 84, y: 254 },
  verify: { x: 326, y: 254 },
  preview: { x: 628, y: 138 },
  "provider-sync": { x: 628, y: 392 },
  handoff: { x: 1046, y: 254 }
};

export const graphNodeIcons: Record<string, LucideIcon> = {
  input: Clock3,
  transform: Braces,
  viewer: FileText,
  handoff: GitBranch,
  "external-action": GitMerge
};

export const canvasWidth = 1260;
export const canvasHeight = 620;
export const nodeWidth = 154;
export const nodeHeight = 78;
export const minZoom = 0.26;
export const maxZoom = 1.7;

export type GraphPosition = { x: number; y: number };
export type GraphViewport = { x: number; y: number; scale: number };
export type GraphDragState =
  | {
      kind: "canvas";
      pointerId: number;
      originX: number;
      originY: number;
      startX: number;
      startY: number;
    }
  | {
      kind: "node";
      pointerId: number;
      nodeId: string;
      originX: number;
      originY: number;
      startX: number;
      startY: number;
    };

export function getEdgePath(startX: number, startY: number, endX: number, endY: number) {
  const distance = Math.abs(endX - startX);
  const control = Math.max(96, distance * 0.42);
  return `M ${startX} ${startY} C ${startX + control} ${startY}, ${endX - control} ${endY}, ${endX} ${endY}`;
}

export function getInitialGraphViewport(): GraphViewport {
  if (typeof window !== "undefined") {
    if (window.innerWidth < 720) {
      return { x: -36, y: 62, scale: 0.26 };
    }
    if (window.innerWidth < 1100) {
      return { x: -22, y: 18, scale: 0.58 };
    }
  }
  return { x: -12, y: -18, scale: 0.9 };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
