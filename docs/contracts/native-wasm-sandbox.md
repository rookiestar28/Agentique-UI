# Native WASM Sandbox

The native runner includes one Windows-verified, fixed WebAssembly adapter. It executes one
36-byte bundled module through an in-process `wasmi` interpreter and exposes no WASI or host
imports. The exact module exports only `run: () -> i32`, returns `42`, and is bound to SHA-256
`32e9891ae7d3cedff10d21cea1ae3a989d4fb5424b89b9c2f93328535cf30af7`.

The lane enables fuel metering, strict engine limits, a bounded stack and store, and zero imported
memory, tables, functions, globals, filesystem, network, environment, clock, random, subprocess,
shell, browser, provider, or package authority. Its only permission ceiling is bounded local
artifact retention. Caller-selected modules are not supported; callers cannot supply module
bytes, paths, URLs, exports, arguments, imports, environment data, or resource settings.

The existing native prepare, approval, permission, start, status, event replay, artifact readback,
cleanup, cancel, projection, checkpoint, and restart fence contracts remain authoritative. WASM
results use `outputs/wasm-result.json`, `artifacts/wasm-result.json`, and the path-neutral
`native-wasm-runner` root. In-process cleanup evidence proves zero external process handles.

This is a local exact-adapter boundary, not generic WASM or WASI application support. macOS remains
unverified and unsupported because environment validation was explicitly skipped. Linux, release,
publication, deployment, provider, hosted, universal, production, and live-host claims are not
made by this contract.
