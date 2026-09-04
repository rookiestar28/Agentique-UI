# True native runner UI E2E contract

The desktop acceptance path attaches Playwright to the WebView2 instance created by the real Tauri host. It does not mock `window.__TAURI_INTERNALS__`, native invoke, native events, or durable storage.

Each scenario first builds the production renderer and serves its static chunks from a fixed loopback Vite preview origin. It starts with isolated `APPDATA` and `WEBVIEW2_USER_DATA_FOLDER` roots under `.tmp/uirun011-e2e`. WebView2 selects an ephemeral loopback debugger port through `--remote-debugging-port=0`; the launcher discovers that port from `DevToolsActivePort` and accepts only the `Agentique UI` target served by that preview origin.

The host controls a debug-only fixed adapter mode for success, sleep/cancel, and exit-failure coverage. The renderer cannot submit a mode, executable, arguments, environment, PID, or generic process command. Non-debug builds always use the success adapter mode.

The scenarios cover explicit denial, approval and start, durable terminal status, bounded logs and artifact readback, restart resynchronization, cancellation, failure, cleanup, process-tree cleanup evidence, and zero-orphan evidence. Generated profiles, logs, screenshots, and Playwright outputs remain ignored local evidence.

Run the suite on Windows with:

```powershell
npm run test:e2e:native-runner
```
