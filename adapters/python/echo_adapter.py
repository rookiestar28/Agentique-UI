#!/usr/bin/env python
import json
import os
import sys
import time


ambient_keys = [
    "PATH",
    "Path",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "TEMP",
    "TMP",
    "PYTHONPATH",
    "CONDA_PREFIX",
]


def main():
    request = json.load(sys.stdin)
    mode = request.get("mode", "success")
    sleep_ms = int(request.get("sleepMs", 0) or 0)

    if mode == "sleep":
        time.sleep(max(sleep_ms, 0) / 1000)

    if mode == "secret":
        marker = "bearer " + "abcdefghijklmnop"
        print(f"diagnostic marker {marker}", file=sys.stderr)

    if mode == "invalid-json":
        sys.stdout.write("not-json\n")
        return

    if mode == "exit-failure":
        print("intentional adapter failure", file=sys.stderr)
        sys.exit(7)

    payload = {
        "runId": request.get("runId"),
        "resourceId": request.get("resource", {}).get("id"),
        "mode": mode,
        "message": request.get("payload", {}).get("message", "adapter-ready"),
        "envKeys": sorted(os.environ.keys()),
        "ambientEnvNonEmpty": sorted(key for key in ambient_keys if os.environ.get(key)),
    }

    serialized = json.dumps(payload, sort_keys=True)
    result = {
        "schemaVersion": "agentique.pythonAdapterResult.v1",
        "ok": True,
        "ready": True,
        "outputs": [
            {
                "path": "outputs/python-result.json",
                "mediaType": "application/json",
                "bytes": len(serialized.encode("utf-8")),
            }
        ],
        "artifacts": [
            {
                "id": "artifact-python-result-json",
                "path": "artifacts/python-result.json",
                "viewer": "json",
                "redacted": True,
            }
        ],
        "payload": payload,
    }
    json.dump(result, sys.stdout, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
