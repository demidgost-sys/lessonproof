# Build Week result: LessonProof

LessonProof is a standalone Education product created during the OpenAI Build
Week 2026 submission period.

**Tagline:** *From expert correction to verified educational release.*

## Implemented product

The completed vertical slice is:

1. Load a synthetic flawed lesson and an explicit expert correction.
2. Bind the correction to exact source and target evidence.
3. Ask GPT-5.6 for a strict, bounded repair plan in live mode, or use the
   visibly labeled deterministic planner for the reproducible no-secret path.
4. Validate evidence uniqueness, editable paths, patch binding, dependency
   invalidation, required checks, and current release hashes.
5. Show the exact atomic diff while the release remains unchanged.
6. Require human approval of the plan ID and release hash.
7. Apply the patch and run six deterministic release invariants.
8. Issue a new proof hash only after every check passes.
9. Permit undo only while the current release matches the verified result.

## Qualifying work created during Build Week

| Area | Implemented evidence |
|---|---|
| Product boundary | Standalone repository, synthetic fixture, `BEFORE.md`, and public provenance ledger |
| GPT-5.6 integration | Server-side Responses API adapter using `gpt-5.6-sol`, medium reasoning, `store: false`, `safety_identifier`, strict JSON Schema, refusal/error handling, and model-family verification |
| Plan validation | Exact unique quotes, source/target roles, safe relative paths, editable-path allowlist, patch/correction binding, dependency closure, and complete check set |
| Human control | Separate propose, approve, apply, verified, and guarded-undo transitions |
| Release proof | Six deterministic invariants, SHA-256 release hashes, journaled before/after state, and stale-state rejection |
| Judge isolation | Opaque browser sessions, HTTP-only same-site cookies, one engine per browser, idle expiry, and bounded session capacity |
| Public live safety | Same-origin mutation checks plus per-session, global, and concurrent analysis limits |
| Product interface | Responsive evidence cockpit showing correction, evidence, exact diff, affected artifacts, checks, release state, proof hash, and undo |
| Reproducibility | No-secret fixture mode, clean install path, Dockerfile, Render blueprint, release preflight, and CI |
| Verification | 42 automated tests: engine 15, planner 7, API/session 11, UI 4, snapshot adapter 3, design guards 2 |

## GPT-5.6 contribution

GPT-5.6 supplies bounded educational judgment. It interprets an unstructured
expert correction against the inspected source and editable target, then
returns evidence anchors, patches, affected artifacts, and required check IDs
under a strict output contract.

It cannot read arbitrary files, mutate the release, approve a patch, declare a
check passed, issue a proof, or publish content. Fixture behavior is never
presented as evidence of a provider response; live execution is established by
the separate bounded smoke command.

## Codex contribution and creator decisions

The creator directed Codex to:

- audit possible product directions and establish the clean-room boundary;
- implement domain, server, interface, and test work in parallel;
- review the integrated state machine and failure paths;
- run browser, responsive, secret, dependency-license, and fresh-install QA;
- build a claim-to-code-to-test traceability record;
- harden the public session, model-budget, deployment, and submission boundary.

The creator chose the Education problem, the synthetic golden path, the
read-only model role, explicit human approval, deterministic release authority,
and the public/private boundary.

## Verification baseline

The repository's verification command covers:

```bash
npm run check
```

- TypeScript validation;
- 42 automated tests across six test files;
- a Vite production build;
- public package and Git-boundary preflight checks.

The golden fixture journey produces one exact patch, invalidates the dependent
artifacts, passes all six release checks, emits a changed proof hash, and
restores the exact baseline through guarded undo.

See [docs/traceability.md](docs/traceability.md) for the evidence map and
[docs/testing.md](docs/testing.md) for the reproducible judge path.
