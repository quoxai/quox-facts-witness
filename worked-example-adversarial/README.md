# Adversarial worked example: a FALSE pass, on the record, refuted

A round-4 benchmark assessor asked for exactly this, verbatim: "Publish a
second worked example where the acceptance layer is tested adversarially, an
agent actor attesting 'pass' on a run that should plausibly be 'fail', and
show the mechanism either catching it or explicitly stating it cannot."

This is that example, and the honest answer up front:

**The platform did NOT catch the false pass, and cannot today.** The
acceptance layer is an attestation mechanism, not an evaluator: it records
who said "it worked" and binds that claim to the evidence; it does not judge
whether the claim is true. What it guarantees instead, all demonstrated in
these files, is that a false claim is (1) attributable to its actor class,
(2) cryptographically bound to the exact evidence it lies about, and
(3) refutable on an append-only record that preserves the lie forever.

## What happened (2026-09-03, real run on the Quox dev instance)

1. A workflow whose declared intent is to output the exact string
   `QUOX-ADV-EXPECTED-7f3a91` ran and COMPLETED, while actually producing
   `QUOX-ADV-WRONG-2c5e08`. The wrong output sits in the witnessed evidence
   trail (`aee-bundle.json`, the transform node's captured output). Run
   status: `completed`. Outcome versus intent: wrong.
2. The calling system then falsely attested `pass` with the reason "Output
   matched the declared expectation." That claim is false, and nothing
   stopped it. It was recorded with `actor_type: "service"`, derived
   server-side from the credential class, never self-asserted.
3. A human then attested `fail`, quoting the bundle's own captured output
   against the declared expectation. The verdict history (`acceptance.json`)
   now reads: latest = human `fail`, superseding but NOT erasing the service
   `pass`. Both verdicts pin the same `target_head_hash`, the run's VOLT
   chain head, so neither can be re-pointed at different evidence. Both were
   emitted into the run's correlation trail and witnessed through the same
   VOLT bundle + WARD receipt pipeline as the run itself.

## Run it yourself (requires bash, jq, sha256sum)

    git clone https://github.com/quoxai/quox-facts-witness
    cd quox-facts-witness/worked-example-adversarial
    ./verify.sh aee-bundle.json

Then check the lie and its refutation yourself:

    jq -r '.envelopes[] | select(.intent=="evidence.acceptance.recorded") | .payload | "\(.actor_type) \(.verdict): \(.reason)"' aee-bundle.json
    jq -r '.latest.verdict, .latest.actor_type, .history[1].verdict, .history[1].actor_type' acceptance.json
    jq -r '.history[].target_head_hash' acceptance.json   # identical: both bound to the same evidence
    grep -o 'QUOX-ADV-WRONG-2c5e08' aee-bundle.json | head -1   # the actual output the pass verdict lied about

## What this proves, and what it does not

- PROVES: a false pass does not disappear, cannot be laundered into a human
  claim, cannot detach from the evidence it mischaracterizes, and can be
  refuted without editing history. For a six-month unattended deployment,
  that is the difference between "an agent quietly marked its own homework"
  and "an agent's false claim is a permanent, attributable, refutable record
  a human or auditor will meet."
- DOES NOT prove automated correctness checking. Declared-criteria
  evaluation (the platform itself judging the output against a machine-
  checkable definition of done, which would have caught this false pass at
  attestation time) is the stated, deliberately deferred next layer. Until
  it ships, this gap is stated in quox.ai/facts.json (`acceptance` section)
  rather than papered over.

Provenance: same demo estate as the sibling `worked-example/` (throwaway
`demo-we-*@quox.local` identities, `Worked Example Org`); `verify.sh` is the
platform's own served verifier, byte-identical to the sibling's.
