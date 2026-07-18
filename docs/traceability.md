# Feature-to-evidence traceability

This matrix keeps the product, repository, video, and submission copy aligned.
Every public claim maps to visible behavior, implementation, and automated
proof.

## Product matrix

| Feature or claim | User-visible proof | Implementation | Automated proof |
|---|---|---|---|
| Synthetic flawed lesson and expert correction | Synthetic-data badge, correction, checked note, and false caption are visible | `fixtures/inverse-sine-release.json`, `src/domain/fixture.ts`, `src/client/App.tsx` | Engine, API, and UI suites |
| Correction binds to exact evidence | Source and target quotes plus the exact diff are visible; locations remain available under `Technical details` | `src/domain/validation.ts`, `src/domain/engine.ts`, `src/client/snapshotAdapter.ts` | Exact, ambiguous, stale, and unsafe evidence cases |
| GPT-5.6 proposes a bounded structured repair | Live mode shows the GPT-5.6 model badge and a structured proposal rather than chat prose | `src/domain/planners.ts`, `src/domain/schema.ts` | Seven planner-adapter tests plus the bounded provider smoke command |
| Built-in demo is honest and reproducible | Header reads `Built-in demo · no AI call` | `FixtureRepairPlanner`, `src/client/App.tsx` | UI and API mode tests |
| Unsafe plans fail closed | Error or blocked state appears; release hash and documents do not change | `src/domain/validation.ts`, `src/domain/engine.ts`, `src/server/app.ts` | Prompt injection, ambiguous evidence, unsafe path, malformed output, and provider-failure tests |
| Human approval is mandatory | `Approve this exact change` and `Apply change & run 6 checks` are separate controls | `LessonProofEngine.approve`, `LessonProofEngine.apply`, `src/client/App.tsx` | Engine, API, and UI state-transition tests |
| Six deterministic checks decide release | `1 caption fixed. 2 dependency proofs recomputed. 6 of 6 checks passed.` is visible after apply | `LessonProofEngine.runChecks` | Positive journey and negative safety tests |
| Verified release receives a proof hash | Plain outcome is visible; full new hash, previous hash, version, and verification time remain available under `Technical details` | `src/domain/hash.ts`, `src/domain/engine.ts`, `src/client/App.tsx` | Engine, API, and UI proof tests |
| Undo is hash-guarded | Undo remains a separate control and the proof-hash receipt is available under `Technical details` | `LessonProofEngine.undo` | Exact restore, stale hash, and journal-integrity tests |
| Browser workflows are isolated | Each browser can reset and progress independently | `src/server/session.ts`, `src/server/app.ts` | Cookie, isolation, expiry, eviction, and concurrent-mutation tests |
| Live model traffic is bounded | Rate-limit errors are presented without changing release state | `LiveAnalysisGuard`, stable API errors | Per-session, global, and concurrency limit tests |
| No learner data is required | Entire golden journey uses bundled synthetic content | Fixture inventory, `SECURITY.md`, public content scan | Fixture and public-package preflight tests |
| Judge can reproduce the app | README and testing guide provide a no-secret route | `package.json`, Dockerfile, Render blueprint, same-origin server | Clean commands, production build, API health, and public preflight |

## Verification inventory

| Test surface | Count | Primary behavior |
|---|---:|---|
| Domain engine | 15 | lifecycle, evidence, stale state, fail-closed analysis, atomic apply, proof, undo |
| GPT-5.6 planner adapter | 7 | request contract, strict schema, family check, full-body timeout, missing credentials, refusal, malformed output |
| HTTP API and browser sessions | 11 | routes, errors, golden journey, cookies, isolation, expiry, rate limits, concurrency, same-origin mutations |
| Interface | 3 | provenance/mode display, separate controls, error recovery |
| Snapshot adapter | 3 | stage projection, verified proof, guarded undo |
| Design guards | 2 | Flat CSS, specific copy, and emoji-free interface source |
| **Total** | **41** | End-to-end product and trust boundary |

`npm run check` also runs TypeScript validation, the production build, and the
public-package preflight.

## Submission evidence map

| Judge question | Evidence to show |
|---|---|
| What work does GPT-5.6 perform? | The live structured proposal turns reviewer intent and bounded evidence into exact evidence, patch, invalidation, and check selections |
| What prevents autonomous or stale mutation? | Separate approval/apply controls, allowlisted paths, current release hashes, six checks, and guarded undo |
| Is this a coherent product rather than a technical demo? | One continuous correction → proposal → approval → verification → proof journey in the evidence cockpit |
| Who benefits? | Teachers and educational-content teams maintaining a lesson plus derived captions, claims, and release packages |
| What is novel? | The product starts after an expert correction and turns that signal into a source-bound release contract |
| How did Codex contribute? | Candidate and rule audit, clean-room product boundary, parallel implementation, 41-test verification, red-team review, deployment and submission hardening |
| What decisions remained human? | Track and product selection, synthetic scope, model authority boundary, approval requirement, deterministic release gate, and final public claims |

## Recording proof order

The clearest under-three-minute evidence sequence is:

1. show the false synthetic caption and expert correction;
2. keep the live GPT-5.6 badge visible while generating the structured plan;
3. show exact source/target evidence and one before/after change; open
   `Technical details` briefly for paths and dependency proof records;
4. show that release remains blocked before approval;
5. approve, apply, and show `Change verified` plus the plain
   `1 caption fixed. 2 dependency proofs recomputed. 6 of 6 checks passed.`
   result;
6. show the guarded undo condition;
7. close on the architecture, 41-test count, concrete Codex contribution, and
   division of authority.
