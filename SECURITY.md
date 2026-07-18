# Security policy

LessonProof is a Build Week prototype for synthetic educational content. It is
not a student information system, learning-management system, autonomous
publisher, or compliance certification service.

## Supported version

Only the latest release on the default branch is supported during judging. The
prototype intentionally keeps workflow state in process memory and makes no
long-term persistence or production-SLA claim.

## Data boundary

- Use synthetic or explicitly rights-cleared educational content only.
- Do not enter student names, grades, contact details, health data, account
  identifiers, private course material, or other personal information.
- The bundled golden journey requires no external files, user records,
  production database, browser login, or private source repository.
- The public fixture contains no copied examination, textbook, worksheet, or
  student content.

## Secret handling

- `OPENAI_API_KEY` is server-side configuration only.
- Secrets must not appear in client code, URLs, screenshots, browser storage,
  logs, fixtures, Git, demo recordings, or submission fields.
- Local secrets belong in ignored environment files; deployed secrets belong
  in the hosting platform's secret store.
- Fixture mode requires no secret and remains visibly labeled.
- API errors are normalized before reaching the browser; upstream response text
  is not exposed to the client.

## Browser session boundary

Each browser receives a cryptographically random 32-byte session identifier in
an `HttpOnly`, `SameSite=Strict` cookie. Production cookies also use `Secure`.
Each session owns an independent in-memory LessonProof engine, so one judge's
approval, apply, reset, or undo flow cannot alter another judge's workflow.

Sessions expire after an idle TTL and the store evicts the least-recent session
at its configured capacity. Only a hash-derived, privacy-preserving
`safety_identifier` is sent with live OpenAI requests; the browser cookie itself
is not sent to the model provider.

## Request and model-budget controls

Implemented controls include:

1. a 64 KiB JSON body ceiling and exact `application/json` requirement;
2. an 8-2,000 character correction boundary;
3. same-origin validation for every state-changing route;
4. one in-flight mutation per browser session;
5. live-analysis sliding-window limits per session and across the process;
6. a concurrent live-analysis ceiling;
7. HTTP 429 responses with `Retry-After` for exhausted live limits;
8. bounded provider timeout and output-token budget.

Default live-analysis limits are four requests per browser per hour, fifty per
process per hour, and two concurrent requests. Deployments can reduce these
limits through the documented environment variables.

## Model trust boundary

Lesson text, expert corrections, and model output are untrusted inputs.
LessonProof applies these controls before any release mutation:

1. instructions distinguish application policy from untrusted lesson data;
2. prompt-injection-like corrections fail closed before the planner runs;
3. GPT-5.6 must return a strict JSON Schema response;
4. the server verifies the completed response identifies a GPT-5.6 model;
5. Zod rejects missing, unexpected, or malformed output fields;
6. exact evidence quotes must resolve uniquely in their declared documents;
7. exactly one patch must target an allowlisted editable document and match
   the expert's explicit quoted `replace ‘OLD’ with ‘NEW’` intent byte-for-byte;
8. affected-artifact invalidation must exactly match dependency closure;
9. human approval binds one plan ID to one current release hash;
10. six deterministic checks decide the verified-release state;
11. undo requires the exact current after-hash and intact before/after journal
    snapshots.

The model cannot publish, approve, mark checks as passed, issue a proof, access
credentials, or broaden the release boundary.

## Web and deployment controls

The same-origin Node service applies a restrictive Content Security Policy,
frame denial, MIME sniffing prevention, no-referrer policy, permissions policy,
no-store API caching, safe static-path resolution, and bounded server timeouts.

Production mode binds to `0.0.0.0`; TLS termination and infrastructure-level
traffic controls are the hosting platform's responsibility. The included
Dockerfile runs as an unprivileged user, and the Render blueprint configures a
health check at `/api/health`.

## Reporting a vulnerability

Do not place secrets or personal information in a public issue. Use a private
GitHub security advisory when available, or the maintainer contact published on
the official submission page. Include only the minimum reproduction detail.
