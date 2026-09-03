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
- STATED GAP: this bundle's `volt` and `ward` sections are empty. The
  worked-example attempt itself exposed that the VOLT capture pipeline on
  the instance had never produced a run (volt/stats read 0/0/0); that is
  filed as a product issue and this README will be updated when a
  VOLT-populated, WARD-witnessed bundle replaces this one. Stating that
  plainly beats pretending otherwise.

Provenance note: the demo identities inside (`demo-we-*@quox.local`,
`Worked Example Org`) are throwaway accounts created for this example.
