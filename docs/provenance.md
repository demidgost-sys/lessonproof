# Provenance and qualifying work

This ledger separates prior problem knowledge from the implementation judged
for OpenAI Build Week 2026. The submission period begins on 2026-07-13.

## Product boundary

LessonProof is a new standalone Education product:

> From expert correction to verified educational release.

The repository does not copy prior source code, personal records, educational
corpora, production state, credentials, screenshots, private media, or local
configuration. The public lesson, correction, documents, and derived artifacts
are synthetic and original.

## Provenance ledger

| Item | Before the submission period | Qualifying LessonProof work | Evidence and rights |
|---|---|---|---|
| Expert correction as a high-value signal | Practical tutoring and educational-content experience established the problem | New correction model, user journey, synthetic example, and release trace | Original implementation; no learner data copied |
| Deterministic release discipline | General engineering practice: important changes need explicit validation | New six-check release contract, state machine, proof hash, and guarded undo | Original code and tests |
| Correction-to-evaluation inspiration | A public Build Week story described converting practitioner corrections into targeted evaluation work | New Education-specific product binding one correction to exact evidence, a bounded patch, affected artifacts, and release proof | Public concept inspiration; original product and implementation |
| Evidence and uncertainty discipline | General practice: preserve sources and fail closed on ambiguity | New exact-quote anchors, structured planner contract, visible blocked states, and stale-hash guards | Original code and synthetic fixtures |
| LessonProof application | Did not exist | Domain engine, server API, browser interface, session isolation, live-analysis limits, deployment path, and documentation | Dated Git history; MIT license |
| GPT-5.6 integration | Did not exist | Server-side Responses API adapter, strict schema, model-family check, safety identifier, normalized failure handling, and bounded smoke command | OpenAI service terms apply; key is not distributed |
| Verification | Did not exist | 42 tests across engine, planner, API/session, interface, snapshot adapter, and design guards; typecheck, production build, and public release preflight | Reproducible repository commands |
| Visual design | Did not exist | Original evidence-cockpit interface and CSS product mark | No external visual assets |

## Explicit non-reuse boundary

The submission excludes:

- student identities, lesson histories, grades, schedules, payments, or contact
  information;
- personal notes, applications, identity documents, profiles, or private
  reports;
- production databases, logs, indexes, routing dictionaries, credentials,
  cookies, tokens, account configuration, or analytics;
- source media, channel assets, thumbnails, audio, publishing configuration,
  or third-party copyrighted educational material;
- examination questions, textbook scans, worksheets, or lesson assets without
  explicit rights.

## Qualifying-work evidence

- Every LessonProof implementation commit is dated within the submission
  period.
- `BEFORE.md` records the pre-event boundary; `AFTER.md` records the new result.
- The fixture and complete golden journey are synthetic.
- Feature-to-code-to-test mapping is recorded in `docs/traceability.md`.
- The repository includes a clean-install path, CI, production build,
  deployment configuration, and public-package preflight.
- Dependency metadata and the original asset inventory can be inspected from
  the repository; the application is released under MIT.

## Claim discipline

Fixture mode proves the complete local workflow and validator contract. It is
always visibly labeled and is never represented as a provider response.

A live GPT-5.6 execution claim is made only from a successful bounded
`npm run smoke:openai` record. A public-deployment claim is made only after a
signed-out browser check. The Codex collaboration claim is tied to the core
Build Week task and its `/feedback` Session ID in the official submission.
