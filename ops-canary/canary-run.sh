#!/bin/bash
# ops-canary daily driver: checkpoint -> TSA countersign -> push.
# Invoked by the quox-ops-canary systemd user timer (Persistent=true, so a
# powered-off day runs on next boot and the LATE run is itself honest: the
# TSA time shows when it really ran).
set -euo pipefail
cd "$(dirname "$0")"
REPO_ROOT="$(cd .. && pwd)"
TSA_URL=https://freetsa.org/tsr
TSA_CA_URL=https://freetsa.org/files/cacert.pem

node canary-checkpoint.mjs

DAY_DIR=$(ls -d day-* | sort | tail -1)
STMT="$DAY_DIR/statement.txt"

# Idempotent per day: re-running after a successful TSA pass is a no-op.
if [ -f "$DAY_DIR/statement.tsr" ]; then
  echo "canary: $DAY_DIR already TSA-countersigned (no-op)"
else
  openssl ts -query -data "$STMT" -sha256 -cert -out "$DAY_DIR/statement.tsq" 2>/dev/null
  HTTP=$(curl -s -m 30 -H 'Content-Type: application/timestamp-query' --data-binary @"$DAY_DIR/statement.tsq" "$TSA_URL" -o "$DAY_DIR/statement.tsr" -w '%{http_code}')
  [ "$HTTP" = 200 ] || { echo "canary FAIL: TSA returned HTTP $HTTP"; exit 1; }
  openssl ts -reply -in "$DAY_DIR/statement.tsr" -text 2>/dev/null | grep -q 'Status: Granted' || { echo "canary FAIL: TSA token not granted"; exit 1; }
  [ -f "$REPO_ROOT/freetsa-cacert.pem" ] || curl -s -m 30 "$TSA_CA_URL" -o "$REPO_ROOT/freetsa-cacert.pem"
  openssl ts -verify -data "$STMT" -in "$DAY_DIR/statement.tsr" -CAfile "$REPO_ROOT/freetsa-cacert.pem" -untrusted "$REPO_ROOT/freetsa-cacert.pem" >/dev/null 2>&1 \
    || openssl ts -verify -data "$STMT" -in "$DAY_DIR/statement.tsr" -CAfile "$REPO_ROOT/freetsa-cacert.pem" >/dev/null 2>&1 \
    || { echo "canary FAIL: TSA token does not verify against the TSA CA"; exit 1; }
fi
TSA_TIME=$(openssl ts -reply -in "$DAY_DIR/statement.tsr" -text 2>/dev/null | grep 'Time stamp:' | sed 's/Time stamp: //')

cd "$REPO_ROOT"
git add "ops-canary/"
if git diff --cached --quiet; then
  echo "canary: nothing new to publish"
else
  git -c user.email=control@door.black -c user.name=Control commit -q -m "ops-canary $DAY_DIR (RFC-3161 $TSA_TIME)"
  git push -q origin HEAD:main
  echo "canary: $DAY_DIR published (TSA $TSA_TIME)"
fi
