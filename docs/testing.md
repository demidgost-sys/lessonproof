# Judge testing guide

LessonProof is a web application for modern desktop and mobile browsers. The
bundled deterministic fixture provides a complete no-login, no-secret judge
path; live mode uses the same interface and validation pipeline with a
server-side GPT-5.6 planner.

## Fast local path

Requirements: Node.js 20.19 or newer and npm.

```bash
npm ci
npm run dev
```

Open <http://localhost:5173>.

## Golden journey

1. Confirm the header says `Deterministic fixture` or identifies the configured
   GPT-5.6 live model.
2. Confirm the footer labels the content as synthetic.
3. Leave the bundled correction unchanged and select **Analyze correction**.
4. Review the checked evidence, exact caption diff, invalidated downstream
   artifacts, and selected checks.
5. Select **Approve bounded repair**. Confirm the release has not changed yet.
6. Select **Apply approved patch & verify**.
7. Confirm **Release verified**, six passing checks, version increment, and a
   new proof hash.
8. Select **Undo verified change** and confirm the baseline is restored through
   the proof-hash guard.
9. Use **Reset demo** to begin again at any time.

Expected repair:

```text
sin⁻¹(x) = 1/sin(x)
→
sin⁻¹(x) = arcsin(x)
```

The checked source also states that the reciprocal is
`csc(x) = 1/sin(x)`.

## Verify the repository

```bash
npm run check
```

This runs:

- TypeScript validation;
- 41 automated tests: 15 domain-engine, 7 planner-adapter, 11 HTTP API and
  session, 3 interface, 3 snapshot-adapter, and 2 design-guard tests;
- the production frontend build;
- the public package, content, secret-boundary, and Git-identity preflight.

Run only the application tests with:

```bash
npm test
```

## Live GPT-5.6 path

Copy the environment template, keep the key server-side, and select live mode:

```bash
cp .env.example .env
# Set OPENAI_API_KEY in .env.
LESSONPROOF_PLANNER_MODE=openai npm run dev
```

Run one bounded end-to-end provider smoke with:

```bash
npm run smoke:openai
```

The command sends only the bundled synthetic release, applies the returned plan
through the real engine, requires six passing checks, and prints a sanitized
model/response prefix plus shortened before/after hashes. It never prints the
API key or raw response body.

Live analysis is protected by per-browser, global, and concurrency limits. If a
limit is reached, the API returns HTTP 429 with `Retry-After` and leaves the
release unchanged.

## Production service

Build and run the same-origin service:

```bash
npm ci
npm run build
NODE_ENV=production npm start
```

Production mode binds to `0.0.0.0`; local development binds to `127.0.0.1`.
The service exposes the app and API on `PORT` (default `8787`) and provides a
readiness route at `/api/health`. Fixture mode is ready without a key; live
mode returns HTTP 503 until `OPENAI_API_KEY` is configured.

Container path:

```bash
docker build -t lessonproof .
docker run --rm -p 8787:8787 lessonproof
```

The included `render.yaml` supplies a reproducible live Render deployment
blueprint. It sets `LESSONPROOF_PLANNER_MODE=openai`, asks the operator for an
`OPENAI_API_KEY` through the platform secret manager, and bounds anonymous
judge traffic to two analyses per browser session, 100 analyses per 30-day
process window, and one concurrent analysis. These in-memory limits reset when
the service restarts, so the OpenAI project should also have an external budget
alert or cap.

## Public judge acceptance check

For the URL listed in the official submission:

- open a signed-out/private browser window;
- verify `/api/health` returns HTTP 200;
- complete the golden journey twice, resetting between runs;
- open a second private browser and confirm its workflow starts independently;
- verify desktop and narrow mobile layouts;
- verify no authentication, payment, extension, private file, or entrant-owned
  browser session is required;
- keep the service free and available for the full judging and announcement
  window stated in the submission.

Submission-specific URLs, the Codex `/feedback` Session ID, eligibility
attestation, and signed-out confirmation belong in the ignored local submission
manifest and the official Devpost form, not in repository source files.

Copy `submission.example.json` to `.submission.local.json`, fill it only after
the corresponding checks, then run `npm run verify:submission`. The command
validates the complete manifest shape, clean commit binding, public-URL form,
video duration, live-model evidence, access window, and explicit operator
attestations. It intentionally does not make network requests: signed-out
repository, deployment, and YouTube fields are evidence recorded after manual
browser playback, not substitutes for that playback.
