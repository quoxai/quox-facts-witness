# Worked example: a governed action, denied at the gate, verifiable by you

This is a real evidence bundle from a real run on the Quox dev instance
(2026-09-03). A workflow was built and executed through the dashboard UI by a
demo user, held at its approval gate for a human decision, and then DENIED on
purpose (decision recorded via the documented approvals API under the same
demo user identity). The run failed closed with `APPROVAL_DENIED`. Nothing
here is mocked or hand-written: `aee-bundle.json` is the exact export from
`GET /aee/conversation/<corr>/bundle`, and `verify.sh` is the exact verifier
the platform serves at `/aee/tools/verify.sh`.

## Run it yourself (requires bash, jq, sha256sum)

    git clone https://github.com/quoxai/quox-facts-witness
    cd quox-facts-witness/worked-example
    ./verify.sh aee-bundle.json

Expected output ends with `VERIFIED: envelope list integrity confirmed.`
The script recomputes the SHA-256 over the canonical envelope list and
compares it to the bundle's own `manifest`-claimed hash. Then read the
envelopes: the full AOCL control-pipeline trail (`aocl.ingress.received`,
`aocl.identity.verified`, `aocl.policy.evaluated`, ...), the approval hold,
and the denial. Every envelope carries `corr`, `ts`, `from`, `to` and
`intent`; the causality is yours to walk.

## What this does and does not prove

- PROVES: the envelope list is internally consistent (any edit to any
  envelope breaks the recomputed hash), and the recorded run was held by an
  approval gate and failed closed on denial.
- DOES NOT prove third-party custody of THIS bundle by itself. For the
  externally witnessed trust root, see the parent directory of this repo:
  every quox.ai/facts.json chain tip is countersigned by an RFC-3161
  timestamp from freetsa.org and mirrored in this append-only history.
- CLOSED GAP (was stated here in v1, fixed within hours): v1's bundle had
  empty `volt` and `ward` sections because the attempt itself exposed three
  real product defects, each now fixed on main with tests: the VOLT capture
  pipeline had never produced a run on the live instance (quox#510, server-
  side capture built), approval deny/resume decisions were emitted under an
  orphaned correlation id so denied runs were invisible in the trail
  (quox#513), and failed runs never auto-bundled or got WARD-witnessed at
  all (quox#514). This v2 bundle carries the populated VOLT hash chain (18
  events) and the WARD receipt for a run that was HELD and DENIED, which is
  exactly the record an auditor needs most.
- Receipt signature note (added after benchmark round 3 caught it): the
  per-run WARD receipt in this bundle shows `witnessed: true` with
  `sig: null`. On this deployment, signatures live at chain-TIP level
  (tips are Ed25519-signed and RFC-3161 timestamp-published), not per
  entry, so the null is a receipt-shape problem rather than an unsigned
  witness; making the receipt carry its covering signed-tip context is
  filed as quoxai/quox#515. Until that ships, treat this receipt as
  proof of hash-chain inclusion, and the platform-facts trust root in
  this repo's parent directory as the countersigned anchor.
- Remaining honest notes: the deny decision was recorded via the documented
  approvals API under the same demo identity (the inbox UI path is being
  hardened separately); and the instance has a second, older run recorder
  pending consolidation (quox#512), so run listings can show sibling rows.

Provenance note: the demo identities inside (`demo-we-*@quox.local`,
`Worked Example Org`) are throwaway accounts created for this example.
