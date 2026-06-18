#!/usr/bin/env bash
set -euo pipefail

artifact="${1:-}"
expected_version="${2:-}"
updater_manifest="${3:-}"

if [[ -z "$artifact" || -z "$expected_version" ]]; then
  echo "usage: release-smoke-macos.sh <artifact> <expected-version> [updater-manifest]" >&2
  exit 2
fi

if [[ ! -e "$artifact" ]]; then
  echo "missing macOS artifact" >&2
  exit 1
fi

codesign --verify --deep --strict "$artifact"
spctl --assess --type execute "$artifact"

if [[ -n "$updater_manifest" && ! -f "$updater_manifest" ]]; then
  echo "updater manifest was requested but is missing" >&2
  exit 1
fi

smoke_root="$(mktemp -d)"
cleanup() {
  rm -rf "$smoke_root"
}
trap cleanup EXIT

printf '%s\n' "install check pending for artifact" \
  "launch check pending for version ${expected_version}" \
  "update check requires signed manifest when provided" \
  "uninstall and cleanup checks must remove smoke state"
