import { Archive, Boxes, Download, Eye, FileCheck2, GitBranch, Play, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavigationKey = "library" | "import" | "verify" | "preview" | "graph" | "run" | "handoff" | "settings";

export type NavigationItem = {
  key: NavigationKey;
  label: string;
  labelMessageId: `navigation.${NavigationKey}`;
  icon: LucideIcon;
};

export const navigation: NavigationItem[] = [
  { key: "library", label: "Library", labelMessageId: "navigation.library", icon: Boxes },
  { key: "import", label: "Import", labelMessageId: "navigation.import", icon: Download },
  { key: "verify", label: "Verify", labelMessageId: "navigation.verify", icon: FileCheck2 },
  { key: "preview", label: "Preview", labelMessageId: "navigation.preview", icon: Eye },
  { key: "graph", label: "Graph", labelMessageId: "navigation.graph", icon: GitBranch },
  { key: "run", label: "Run", labelMessageId: "navigation.run", icon: Play },
  { key: "handoff", label: "Handoff", labelMessageId: "navigation.handoff", icon: Archive },
  { key: "settings", label: "Settings", labelMessageId: "navigation.settings", icon: Settings }
];

export const pageMetadata: Record<
  NavigationKey,
  {
    caption: string;
    title: string;
    captionMessageId: `page.${NavigationKey}.caption`;
    titleMessageId: `page.${NavigationKey}.title`;
  }
> = {
  library: {
    caption: "Library",
    title: "Versioned local resources",
    captionMessageId: "page.library.caption",
    titleMessageId: "page.library.title"
  },
  import: {
    caption: "Import",
    title: "Open a resource safely",
    captionMessageId: "page.import.caption",
    titleMessageId: "page.import.title"
  },
  verify: {
    caption: "Verify",
    title: "Review trust and validation gates",
    captionMessageId: "page.verify.caption",
    titleMessageId: "page.verify.title"
  },
  preview: {
    caption: "Preview",
    title: "Inspect static resource output",
    captionMessageId: "page.preview.caption",
    titleMessageId: "page.preview.title"
  },
  graph: {
    caption: "Graph",
    title: "Edit workflow descriptors safely",
    captionMessageId: "page.graph.caption",
    titleMessageId: "page.graph.title"
  },
  run: {
    caption: "Run",
    title: "Review controlled execution",
    captionMessageId: "page.run.caption",
    titleMessageId: "page.run.title"
  },
  handoff: {
    caption: "Handoff",
    title: "Prepare non-executing handoff",
    captionMessageId: "page.handoff.caption",
    titleMessageId: "page.handoff.title"
  },
  settings: {
    caption: "Settings",
    title: "Local configuration and secrets",
    captionMessageId: "page.settings.caption",
    titleMessageId: "page.settings.title"
  }
};
