# Worked example: a governed action, denied at the gate, attested, verifiable by you

This is a real evidence bundle from a real run on the Quox dev instance
(2026-09-03, v3). A workflow was executed for a demo org, held at its approval
gate for a decision, DENIED on purpose (decision recorded via the documented
approvals API under the same demo identity), and failed closed with
`APPROVAL_DENIED`. Then, new in v3, the run's outcome was ATTESTED through the
acceptance-verdict layer: a recorded answer to "did it achieve its intent?",
separate from run status. Nothing here is mocked or hand-written:
`aee-bundle.json` is the exact export from `GET /aee/conversation/<corr>/bundle`,
`acceptance.json` and `acceptance-run-bundle.json` are the exact exports of the
verdict and its own witnessed evidence run, and `verify.sh` is the exact
verifier the platform serves at `/aee/tools/verify.sh`.

## Run it yourself (requires bash, jq, sha256sum)

    git clone https://github.com/quoxai/quox-facts-witness
    cd quox-facts-witness/worked-example
    ./verify.sh aee-bundle.json

Expected output ends with `VERIFIED: envelope list integrity confirmed.`
The script recomputes the SHA-256 over the canonical envelope list (absent
fields serialize as null) and compares it to the bundle's own
`manifest`-claimed hash. Then read the envelopes: the full AOCL
control-pipeline trail, the approval hold, the denial, and, last in the trail,
`evidence.acceptance.recorded`. Every envelope carries `corr`, `ts`, `from`,
`to` and `intent`; the causality is yours to walk.

## Did it work? The acceptance verdict (new in v3)

The chain in `aee-bundle.json` proves what HAPPENED. `acceptance.json` records
whether it WORKED: a post-terminal attestation (`pass`/`fail`, with a reason)
attached to the run. In this example the run FAILED (`APPROVAL_DENIED`) and
the verdict is `pass`, because the intent of the run was to prove the
fail-closed deny path, and it did. That inversion is the point: run status and
outcome-against-intent are different facts, and the platform now records both.

Honesty properties you can check in the files:

- `actor_type` is derived server-side from the credential class (human /
  agent / service), never self-asserted. This verdict was recorded by a
  `service` actor and says so. An agent marking its own work `pass` is
  visible as exactly that.
- The verdict pins `target_head_hash`, the denied run's VOLT chain head, so
  the attestation is bound to this exact evidence, not a run id that could be
  repopulated.
- The verdict is witnessed through the same pipeline as everything else:
  `acceptance-run-bundle.json` is its own small VOLT run
  (`run.acceptance.recorded`), bundled and WARD-witnessed. The sealed bundle
  of the denied run is never touched retroactively.
- It is an attestation, not automated evaluation. A declared-criteria
  evaluator ("definition of done" checked by the platform itself) is the
  stated next layer, deliberately not claimed here.

## What this does and does not prove

- PROVES: the envelope list is internally consistent (any edit breaks the
  recomputed hash), the recorded run was held by an approval gate, failed
  closed on denial, and carries a bound, witnessed outcome attestation.
- DOES NOT prove third-party custody of THIS bundle by itself. For the
  externally witnessed trust root, see the parent directory: every
  quox.ai/facts.json chain tip is countersigned by an RFC-3161 timestamp from
  freetsa.org and mirrored in this append-only history.

## Found-and-fixed history (the loop this repo exists to demonstrate)

Each version of this example exposed real product defects; each was fixed on
main, with tests, within hours, and the next version carries the proof:

- v1 shipped with empty `volt`/`ward` sections, stated as a gap. Building it
  exposed quox#510 (VOLT capture had never produced a run on the live
  instance), quox#513 (deny decisions emitted under an orphaned correlation
  id), and quox#514 (failed runs never auto-bundled or got WARD-witnessed).
- v2 carried the populated VOLT chain and WARD receipt for a held-and-denied
  run. Two independent assessor runs then caught the receipt showing
  `sig: null` beside `witnessed: true` (quox#515).
- v3 (this bundle) carries the fixed receipt: no per-entry `sig` field
  (that column is null by design), instead a `signature` block naming the
  tip-signed model, the covering Ed25519-signed chain tip, whether that tip
  is RFC-3161 TSA-countersigned, and how to verify. And building v3 caught
  quox#516 the same hour: the export's canonical hash dropped absent fields
  while the served verifier emitted null for them, so the first envelope
  without `reply_to` broke outsider verification on an intact bundle. Fixed
  (absent fields serialize as null) before this bundle was published; the
  `VERIFIED` you reproduce above runs through that fix.

## Remaining honest notes

- The deny decision was recorded via the documented approvals API under the
  same demo identity (the inbox UI path is being hardened separately).
- The instance has a second, older run recorder pending consolidation
  (quox#512), so run listings can show sibling rows.
- If the `signature.status` in the receipt reads `pending_tip`, the entry is
  hash-chained but newer than the last signed tip; a covering tip is cut
  every 100 chain entries. This bundle was exported after its covering tip.

Provenance note: the demo identities inside (`demo-we-*@quox.local`,
`Worked Example Org`) are throwaway accounts created for this example.
