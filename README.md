# LessonProof

**From expert correction to verified educational release.**

![LessonProof submission cover](submission/assets/cover.png)

LessonProof is the release gate for AI-assisted education: a teacher's
correction becomes a source-bound GPT-5.6 repair plan, but only a
human-approved patch that passes six deterministic invariants receives a new
proof hash.

This standalone OpenAI Build Week 2026 Education entry was created during the
competition period. It uses a synthetic lesson so the complete experience is
safe to inspect, run, and record without student data or private source
material.

## Why it matters

Educational content rarely exists as one sentence in one file. A correction
may need to propagate across the explanation, caption, claim, and release
package. The hard part is not editing one span; it is proving that every
dependent artifact now agrees.

Many education AI products focus on generating or grading content. LessonProof
starts when a human expert says the AI is wrong and converts that correction
into a source-bound, testable release contract.

The bundled demonstration begins with a deliberately false caption:
`sin⁻¹(x) = 1/sin(x)`. The checked teaching note establishes that
`sin⁻¹(x) = arcsin(x)`, while the reciprocal of sine is cosecant.

## The workflow

1. The expert records a correction against the current release hash.
2. GPT-5.6 interprets the correction against bounded source and target
   evidence and returns a strict structured repair proposal.
3. LessonProof resolves exact evidence quotes, enforces the editable-path
   allowlist, verifies dependency invalidation, and rejects stale or unsafe
   plans.
4. The expert reviews and approves the exact patch. Approval does not mutate
   the release.
5. LessonProof applies the approved patch and runs six deterministic checks.
6. A fully passing release receives a new SHA-256 proof hash. Undo is permitted
   only while that exact verified state is still current.

GPT-5.6 proposes. A human approves. Deterministic code decides whether the
release can ship.

## Run it locally

Requirements: Node.js 20.19 or newer.

```bash
npm ci
npm run dev
```

Open <http://localhost:5173>. The default deterministic fixture requires no
account, network connection, or secret and exercises the same validated plan
schema and approval/apply/undo state machine as live mode.

Run the complete verification suite:

```bash
npm run check
```

The suite currently covers 39 tests across the domain engine (15), GPT-5.6
planner adapter (7), HTTP API and session boundary (11), interface (3), and
snapshot adapter (3). The same command also runs TypeScript validation, a
production build, and public package checks.

For the exact judge path and production commands, see
[docs/testing.md](docs/testing.md).

## Live GPT-5.6 mode

The API key stays server-side and outside Git.

```bash
cp .env.example .env
# Set OPENAI_API_KEY in .env.
LESSONPROOF_PLANNER_MODE=openai npm run dev
```

Run the bounded provider smoke before recording a live-model claim:

```bash
npm run smoke:openai
```

Live mode calls the OpenAI Responses API with `gpt-5.6-sol`, medium reasoning,
`store: false`, a privacy-preserving `safety_identifier`, and a strict JSON
Schema. Model output is untrusted input: the same domain validator, human
approval, deterministic checks, and hash guards apply in both planner modes.
If inference fails, refuses, times out, identifies the wrong model family, or
returns an invalid plan, the release remains unchanged.

## How Codex and GPT-5.6 were used

During Build Week, the creator directed Codex to audit candidate workflows and
the competition rules, isolate a privacy-safe Education product, implement the
domain engine, API, interface, and tests in parallel, and red-team the privacy,
provenance, deployment, and claim boundaries.

The creator retained the key product decisions:

- one synthetic golden path that a judge can understand in minutes;
- GPT-5.6 as a read-only planner rather than a release authority;
- an exact reviewable diff and explicit human approval before mutation;
- deterministic code, not model confidence, as the release gate;
- a clean-room boundary around prior experience and private data.

At runtime, GPT-5.6 performs the part that is not safely reducible to string
matching: it interprets the expert correction against inspected evidence and
proposes the bounded repair. LessonProof owns every permission, validation,
mutation, check, proof, and undo decision around that proposal.

## Safety and judgeability

- Synthetic educational content only; no student identity or private course
  material is required.
- One isolated in-memory workflow per browser, carried by an opaque,
  HTTP-only, same-site cookie.
- Same-origin mutation checks, bounded request bodies, and a 2,000-character
  correction limit.
- Per-session, global, and concurrency limits around live model analysis.
- Strict model-output schema plus domain validation of evidence, paths,
  patches, affected artifacts, and check closure.
- Optimistic release hashes prevent stale planning, approval, apply, and undo.
- A labeled deterministic fixture gives judges a complete no-secret test path
  without impersonating a provider response.

This prototype modifies only its disposable in-memory synthetic release. It is
not a learning-management system, autonomous publisher, or certification of
educational truth.

## Submission gallery

| Initial release gate | Bounded repair proposal | Verified release |
|---|---|---|
| [![Blocked fixture state](submission/assets/screenshots/01-initial-blocked.png)](submission/assets/screenshots/01-initial-blocked.png) | [![Proposed repair state](submission/assets/screenshots/02-repair-proposed.png)](submission/assets/screenshots/02-repair-proposed.png) | [![Verified six-check state](submission/assets/screenshots/03-release-verified.png)](submission/assets/screenshots/03-release-verified.png) |

The screenshots are real captures of the local production build in the
labeled deterministic fixture mode. See the
[architecture visual](submission/assets/architecture.png) and
[asset provenance notes](submission/assets/README-assets.md).

## Documentation

- [Architecture and trust boundaries](docs/architecture.md)
- [Provenance and qualifying work](docs/provenance.md)
- [Feature-to-evidence traceability](docs/traceability.md)
- [Judge testing guide](docs/testing.md)
- [Before Build Week](BEFORE.md)
- [Build Week result](AFTER.md)
- [Security policy](SECURITY.md)

## License

MIT. See [LICENSE](LICENSE).
