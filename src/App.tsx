import { lazy, Suspense, useMemo } from "react";
import { useImportWorkspaceState } from "./app-state/useImportWorkspaceState";
import { useNavigationRoute } from "./app-state/useNavigationRoute";
import { validateImportIntent } from "./core/import-intent.mjs";
import { useI18n } from "./i18n/I18nProvider";
import { WorkspaceShell } from "./ui/WorkspaceShell";
import type { NavigationKey } from "./ui/navigation";
import type { ImportValidation } from "./workspaces/LibraryImportWorkspaceTypes";

const LibraryWorkspaceAndImportWorkspaceRoute = lazy(() => import("./workspaces/routes/LibraryWorkspaceAndImportWorkspaceRoute"));
const VerifyWorkspaceRoute = lazy(() => import("./workspaces/routes/VerifyWorkspaceRoute"));
const PreviewWorkspaceAndHandoffWorkspaceRoute = lazy(() => import("./workspaces/routes/PreviewWorkspaceAndHandoffWorkspaceRoute"));
const GraphWorkspaceAndRunWorkspaceRoute = lazy(() => import("./workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute"));
const SettingsWorkspaceRoute = lazy(() => import("./workspaces/routes/SettingsWorkspaceRoute"));

export function App() {
  const { t } = useI18n();
  const { activeNav, selectNav: handleNavSelect } = useNavigationRoute();
  const importState = useImportWorkspaceState();
  const validation = useMemo(() => validateImportIntent(importState.intentText, { now: "2026-06-11T00:05:00.000Z" }) as ImportValidation, [importState.intentText]);
  const selectedResource = validation.ok && validation.intent ? `${validation.intent.resource.id}@${validation.intent.resource.version}` : "No accepted intent";

  return (
    <WorkspaceShell
      activeNav={activeNav}
      onNavSelect={handleNavSelect}
      onResetIntent={importState.resetIntent}
      onValidateIntent={importState.validateIntentText}
      selectedResource={selectedResource}
    >
      <Suspense fallback={<WorkspaceRouteFallback label={t("workspace.loading")} />}>{renderActiveWorkspace(activeNav, importState, validation, selectedResource)}</Suspense>
    </WorkspaceShell>
  );
}

function renderActiveWorkspace(activeNav: NavigationKey, importState: ReturnType<typeof useImportWorkspaceState>, validation: ImportValidation, selectedResource: string) {
  switch (activeNav) {
    case "library":
    case "import":
      return <LibraryWorkspaceAndImportWorkspaceRoute activeNav={activeNav} importState={importState} selectedResource={selectedResource} validation={validation} />;
    case "verify":
      return <VerifyWorkspaceRoute validation={validation} />;
    case "preview":
    case "handoff":
      return <PreviewWorkspaceAndHandoffWorkspaceRoute activeNav={activeNav} />;
    case "graph":
    case "run":
      return <GraphWorkspaceAndRunWorkspaceRoute activeNav={activeNav} />;
    case "settings":
      return <SettingsWorkspaceRoute />;
    default:
      return null;
  }
}

function WorkspaceRouteFallback({ label }: { label: string }) {
  return <div aria-label={label} aria-live="polite" className="workspace-loading" role="status" />;
}
