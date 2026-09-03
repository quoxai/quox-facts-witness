#!/usr/bin/env bash
# AEE evidence bundle verifier
# Usage: verify.sh <path/to/aee-bundle-*.json>
set -euo pipefail
BUNDLE="${1:?usage: $0 <bundle.json>}"
if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required" >&2
  exit 2
fi
CLAIMED=$(jq -r '.manifest.envelopes_sha256' "$BUNDLE")
CORR=$(jq -r '.corr' "$BUNDLE")
COUNT=$(jq -r '.manifest.envelope_count' "$BUNDLE")
CANONICAL=$(jq -c '[.envelopes[] | {id, ts, intent, corr, reply_to, from, to}]' "$BUNDLE")
RECOMPUTED=$(printf '%s' "$CANONICAL" | sha256sum | cut -d' ' -f1)
echo "bundle corr   : $CORR"
echo "envelope count: $COUNT"
echo "claimed hash  : $CLAIMED"
echo "recomputed    : $RECOMPUTED"
if [ "$CLAIMED" = "$RECOMPUTED" ]; then
  echo "VERIFIED: envelope list integrity confirmed."
  exit 0
else
  echo "FAILED: envelope hash mismatch." >&2
  exit 1
fi
