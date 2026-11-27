# Source, omission and classifier checks (2026-11-26)

What the brief asks for, what can be proven with free automatic tools, and what was measured. None of this uses human
labels or paid APIs.

## 1. Omission check (a second account pool re-reads a seeded 10% of KOLs)

The check exists (`omission.py`, `ValidatorNode`) and stayed off because it needs dedicated X accounts and, when it
fails, validators refuse to sign and the epoch is not committed. A flaky check would therefore stop the oracle.

Decision: roll it out in **shadow mode** first (`VALIDATOR_OMISSION_MODE=shadow`).

| Mode | Behaviour | Provenance |
|---|---|---|
| `off` (default) | no check | `omission_mode: disabled` |
| `shadow` | validator 1 re-reads a seeded 5% sample with its own account and appends the overlap to `data/state/omission.jsonl`; never blocks | unchanged, so no series break and no V reset |
| `enforce` | all three validators check; below 95% overlap they refuse to sign | `independent_pool`, one series break when switched |

Why 5% in shadow mode: one account may send 800 requests a day. A 10% sample is about 151 timelines per epoch, which is
906 a day at 6 epochs. 5% is about 453 a day.

Move to `enforce` only after several days of shadow data show overlap steadily at or above 95%. Dedicated accounts:
three of the 13 X accounts leave the fetch lanes and go to `validator_pool` in `secrets/x_accounts.json` (shadow needs
one, enforce three).

## 2. Classifier evaluation without manual labels

`python -m nti_classifier.auto_eval --samples 200 [--second-gemini-model NAME]` samples recent stored posts, classifies
them with the production pipeline settings, and reports:

* JSON validity (the pipeline's own count of answered posts),
* agreement of the top narrative between two runs of the same model (consistency),
* agreement between two different models, if a second one is reachable.

It proves consistency and cross-model agreement, **not** accuracy against human labels: two models can be wrong in the
same way. Reports say so.

Measured on 200 recent posts, prompt v2, `gemini-3.5-flash-lite` (MiMo's key is rejected, HTTP 401, so the second model was
`gemini-3.1-flash-lite`):

| Check | Result | Bar |
|---|---|---|
| JSON validity | 100% | 99% |
| Same model, run twice | 88% of all posts; 73% of posts that got a narrative | 85% |
| Two different models | 77.5% of all posts; 60% of posts that got a narrative | 85% |

Reading: the format is reliable, but narrative choice is unstable on borderline posts, and two models disagree on about
one post in four. The brief's 85% bar is **not met** on the cross-model check, and the 88% self-agreement counts many
off-topic posts that both runs leave unlabeled. Until a prompt change brings cross-model agreement to 85% or more, do
not claim 85% classifier agreement publicly. A prompt change starts a new series, so it is best bundled with other
provenance changes.

## 3. KOL wallet registry (C8)

Contract and attester service are built and tested. The registry is voluntary and adds nothing to the index, so it
stays dormant (0 registrations) until a KOL asks to register. Decision: no UI work now.

## 4. Source coverage (the official X API comparison)

The official API is paid and a one-off. Replaced by two free checks that together answer the same two questions:

* **Precision (are stored posts real and unaltered?)** `infra/scripts/source_audit.py` asks X's public tweet endpoint
  (no login) for a random sample of stored posts and compares author, time and text. A stored retweet has its own id
  while the endpoint serves the original, so retweets are compared by their retweeted text.
  Measured on 150 posts (88 retweets): 150 of 150 resolved, author 100%, time 100%, text 99.3%.
* **Recall (are real posts missing?)** is the omission check in section 1: a second account pool re-reads a seeded
  sample and the overlap with the operator's dataset is recorded each epoch. Both pools read the same platform, so this
  detects fetcher failures and operator omission but is not a fully independent source.
