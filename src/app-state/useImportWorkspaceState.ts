import { useCallback, useState } from "react";
import {
  createInitialExternalIntakeReport,
  sampleBlockedExternalIntakeFiles,
  sampleExternalIntakeFiles,
  scanExternalIntakeFiles
} from "../core/companion-external-intake-scanner.mjs";
import { sampleImportIntent } from "../core/import-intent.mjs";

export function useImportWorkspaceState() {
  const [intentText, setIntentText] = useState(sampleImportIntent);
  const [externalIntakeFiles, setExternalIntakeFiles] = useState<File[]>([]);
  const [externalIntakeReport, setExternalIntakeReport] = useState(() => createInitialExternalIntakeReport());
  const [externalIntakeScanState, setExternalIntakeScanState] = useState("not-run");
  const [externalIntakeError, setExternalIntakeError] = useState("");

  const resetIntent = useCallback(() => setIntentText(sampleImportIntent), []);
  const validateIntentText = useCallback(() => setIntentText((current) => current.trim()), []);

  const handleExternalIntakeFilesSelected = useCallback((files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    setExternalIntakeFiles(selectedFiles);
    setExternalIntakeError("");
    setExternalIntakeScanState(selectedFiles.length > 0 ? "selected" : "not-run");
    if (selectedFiles.length === 0) {
      setExternalIntakeReport(createInitialExternalIntakeReport());
    }
  }, []);

  const runExternalIntakeScan = useCallback(async () => {
    if (externalIntakeFiles.length === 0) {
      setExternalIntakeError("Select a local folder or files before scanning.");
      setExternalIntakeScanState("not-run");
      return;
    }
    setExternalIntakeError("");
    setExternalIntakeScanState("scanning");
    try {
      setExternalIntakeReport(
        await scanExternalIntakeFiles(externalIntakeFiles, {
          sourceLabel: `${externalIntakeFiles.length} selected files`
        })
      );
      setExternalIntakeScanState("complete");
    } catch (error) {
      setExternalIntakeError(error instanceof Error ? error.message : "Static scan failed.");
      setExternalIntakeScanState("blocked");
    }
  }, [externalIntakeFiles]);

  const loadExternalIntakeSample = useCallback(async () => {
    setExternalIntakeFiles([]);
    setExternalIntakeError("");
    setExternalIntakeScanState("complete");
    setExternalIntakeReport(await scanExternalIntakeFiles(sampleExternalIntakeFiles, { sourceLabel: "safe sample candidate" }));
  }, []);

  const loadBlockedExternalIntakeSample = useCallback(async () => {
    setExternalIntakeFiles([]);
    setExternalIntakeError("");
    setExternalIntakeScanState("complete");
    setExternalIntakeReport(await scanExternalIntakeFiles(sampleBlockedExternalIntakeFiles, { sourceLabel: "blocked sample candidate" }));
  }, []);

  const resetExternalIntake = useCallback(() => {
    setExternalIntakeFiles([]);
    setExternalIntakeError("");
    setExternalIntakeScanState("not-run");
    setExternalIntakeReport(createInitialExternalIntakeReport());
  }, []);

  return {
    externalIntakeError,
    externalIntakeReport,
    externalIntakeScanState,
    externalIntakeSelectedCount: externalIntakeFiles.length,
    handleExternalIntakeFilesSelected,
    intentText,
    loadBlockedExternalIntakeSample,
    loadExternalIntakeSample,
    resetExternalIntake,
    resetIntent,
    runExternalIntakeScan,
    setIntentText,
    validateIntentText
  };
}

export type ImportWorkspaceState = ReturnType<typeof useImportWorkspaceState>;
