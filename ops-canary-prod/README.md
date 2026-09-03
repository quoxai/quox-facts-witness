# Production operations canary (PROD-CORE, started 2026-09-03)

The production sibling of [`../ops-canary`](../ops-canary/): same
pre-committed protocol (one checkpoint per day, own WARD chain exported
here, tips signed by the Ed25519 key publicly pinned in every
facts.receipt.json since seq 1, RFC-3161 countersignature from
freetsa.org, append-only history on infrastructure Quox does not operate,
failures included), observing the Quox production instance: the QuoxCORE
deployment that runs Quox Ltd's own production operations.

## What makes this series different, stated up front

- **Observation only, for now.** Phase 1 records reachability, service
  health, per-container restart counts and health states, backup
  freshness, disk and load. It does not yet assert that governed work ran.
  The governed self-workload (a daily enforcement drill, weekly
  support-corpus retraining checks, a revived backup schedule, monitoring)
  arrives as later phases, and each addition will be visible in this
  history when it lands. Watching the instance grow into full production
  duty, checkpoint by checkpoint, is the point of starting the clock
  before the buildout instead of after it.
- **Remote observation.** Metrics are gathered over SSH from the machine
  holding the signing key; the key never resides on the observed instance.
  The values are still self-reported, the same boundary every receipt in
  this repository states.
- **Day 0 already carries findings, not a clean sheet:** one legacy
  container reports a permanently failing healthcheck while demonstrably
  serving (tracked as quoxai/quox#519), backups are one-off pre-deploy
  snapshots with no recurring schedule yet (phase 3), and the disk sits at
  81%. Publishing those on day 0 rather than after fixing them is the
  honesty model working. Day 0's first draft also mis-scored a healthy
  collector as down (a response-shape parser bug on our side); it was
  corrected before any external reference, and the corrected script says
  so in its source.
- An unreachable instance is a checkpoint, not a skipped day:
  reachability is the first metric, so a down day appears in the record
  as data.

## Verify a day yourself

Identical to the dev series:

    cd ops-canary-prod/day-0000
    sha256sum checkpoint.json            # equals checkpoint_sha256 in statement.txt + receipt.json
    openssl ts -verify -data statement.txt -in statement.tsr -CAfile ../../freetsa-cacert.pem
    # receipt.json's ward_tip.sig: Ed25519 by public_key over ward_tip.tip_chain_hash

Day counting starts at 0 on 2026-09-03; recompute the accumulated days
from the directory listing and TSA times rather than trusting any quoted
number.
