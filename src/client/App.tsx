import { FormEvent, useEffect, useMemo, useState } from "react";
import { createApiClient, type LessonProofApi } from "./api";
import { CheckList } from "./components/CheckList";
import {
  DEFAULT_CORRECTION,
  isVerified,
  type EvidenceAnchor,
  type WorkflowPhase,
  type WorkflowState,
} from "./types";

type PendingAction = "load" | "analyze" | "approve" | "apply" | "undo" | "reset" | null;

interface AppProps {
  api?: LessonProofApi;
}

const phaseRank: Record<WorkflowPhase, number> = {
  correction: 0,
  repair: 1,
  proof: 2,
};

function shortHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-7)}`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return `${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date)} UTC`;
}

function stageState(current: WorkflowPhase, stage: WorkflowPhase): "complete" | "active" | "future" {
  if (phaseRank[current] > phaseRank[stage]) return "complete";
  if (current === stage) return "active";
  return "future";
}

function EvidenceCard({ evidence }: { evidence: EvidenceAnchor }) {
  return (
    <article className="evidence-card" aria-label={`Evidence from ${evidence.sourceLabel}`}>
      <div className="evidence-card__meta">
        <span>{evidence.sourceLabel}</span>
        <strong>{evidence.locator}</strong>
      </div>
      <blockquote>“{evidence.excerpt}”</blockquote>
      <span className="evidence-card__anchor">Source-bound · {evidence.id}</span>
    </article>
  );
}

function EmptyStage({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-stage">
      <span aria-hidden="true">→</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

export default function App({ api: providedApi }: AppProps) {
  const api = useMemo(() => providedApi ?? createApiClient(), [providedApi]);
  const [state, setState] = useState<WorkflowState | null>(null);
  const [correction, setCorrection] = useState(DEFAULT_CORRECTION);
  const [pending, setPending] = useState<PendingAction>("load");
  const [error, setError] = useState<string | null>(null);

  async function run(action: Exclude<PendingAction, "load" | null>, operation: () => Promise<WorkflowState>) {
    setPending(action);
    setError(null);

    try {
      const nextState = await operation();
      setState(nextState);
      setCorrection(nextState.correction.text);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Please try again.";
      try {
        const currentState = await api.getState();
        setState(currentState);
        if (
          action !== "analyze" ||
          currentState.correction.text === correction.trim()
        ) {
          setCorrection(currentState.correction.text);
        }
      } catch {
        // Preserve the last usable state when even the recovery read fails.
      }
      setError(message);
    } finally {
      setPending(null);
    }
  }

  useEffect(() => {
    let active = true;

    api
      .getState()
      .then((initialState) => {
        if (!active) return;
        setState(initialState);
        setCorrection(initialState.correction.text);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Could not load the demo state.");
      })
      .finally(() => {
        if (active) setPending(null);
      });

    return () => {
      active = false;
    };
  }, [api]);

  function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state) return;
    void run("analyze", () => api.analyze({ correction: correction.trim(), releaseHash: state.release.currentHash }));
  }

  function handleApprove() {
    if (!state?.plan) return;
    void run("approve", () => api.approve({ planId: state.plan!.id, releaseHash: state.release.currentHash }));
  }

  function handleApply() {
    if (!state?.plan) return;
    void run("apply", () => api.apply({ planId: state.plan!.id, releaseHash: state.release.currentHash }));
  }

  function handleUndo() {
    if (!state?.proof) return;
    void run("undo", () => api.undo({ journalId: state.proof!.journalId, expectedCurrentHash: state.release.currentHash }));
  }

  function handleReset() {
    void run("reset", () => api.reset());
  }

  if (pending === "load" && state === null) {
    return (
      <main className="loading-screen" aria-busy="true">
        <div className="brand-mark" aria-hidden="true">LP</div>
        <p>Preparing the synthetic release…</p>
      </main>
    );
  }

  if (state === null) {
    return (
      <main className="error-screen">
        <div className="brand-mark" aria-hidden="true">LP</div>
        <h1>LessonProof could not start</h1>
        <p role="alert">{error}</p>
        <button className="button button--primary" type="button" onClick={() => window.location.reload()}>
          Retry
        </button>
      </main>
    );
  }

  const verified = isVerified(state);
  const planReady = state.plan !== null;
  const busy = pending !== null;
  const evidenceById = new Map(state.evidence.map((item) => [item.id, item]));
  const linkedEvidence = state.plan
    ? state.plan.evidenceIds.map((id) => evidenceById.get(id)).filter((item): item is EvidenceAnchor => Boolean(item))
    : state.evidence;

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="#main" aria-label="LessonProof home">
          <span className="brand-mark" aria-hidden="true">LP</span>
          <span>LessonProof</span>
        </a>
        <div className="header-badges">
          <span className={`mode-badge mode-badge--${state.mode}`} data-testid="ai-mode">
            <span aria-hidden="true" />
            {state.mode === "live"
              ? `${state.plan?.plannerModel ?? state.model ?? "GPT-5.6"} live`
              : "Deterministic fixture"}
          </span>
          <span className="event-badge">Build Week · Education</span>
        </div>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__copy">
            <p className="eyebrow">Expert correction → verified release</p>
            <h1 id="hero-title">Ship the lesson you meant to teach.</h1>
            <p className="hero__lede">
              LessonProof turns one expert correction into an evidence-bound repair, then earns a new release proof through deterministic checks.
            </p>
          </div>
          <aside
            className={`release-card release-card--${state.release.status}`}
            aria-label="Release status"
            aria-live="polite"
            aria-atomic="true"
            data-testid="release-gate"
          >
            <div>
              <span className="release-card__label">Release gate</span>
              <strong>{state.release.gateLabel}</strong>
            </div>
            <dl>
              <div>
                <dt>Lesson</dt>
                <dd>{state.release.lesson}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{state.release.version}</dd>
              </div>
              <div>
                <dt>{verified ? "Proof" : "Baseline"}</dt>
                <dd className="mono" title={state.proof?.hash ?? state.release.baselineHash}>
                  {shortHash(state.proof?.hash ?? state.release.baselineHash)}
                </dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className="control-principle" aria-label="Safety model">
          <div><span>01</span><strong>AI proposes</strong><small>Reason over bounded evidence</small></div>
          <div><span>02</span><strong>Reviewer approves</strong><small>No silent production edits</small></div>
          <div><span>03</span><strong>Checks decide</strong><small>Proof only after invariants pass</small></div>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <strong>Action stopped.</strong>
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button>
          </div>
        )}

        {state.notice && <p className="notice" role="status">{state.notice}</p>}

        <ol
          className="workflow"
          aria-label="Correction verification workflow"
          aria-busy={busy}
        >
          <li className={`stage-card stage-card--${stageState(state.phase, "correction")}`}>
            <header className="stage-card__header">
              <span className="stage-number">1</span>
              <div><p>Correction</p><h2>Bind the expert signal</h2></div>
              <span className="stage-state">{stageState(state.phase, "correction")}</span>
            </header>

            <form onSubmit={handleAnalyze} className="correction-form">
              <label htmlFor="correction">Expert correction</label>
              <textarea
                id="correction"
                value={correction}
                onChange={(event) => setCorrection(event.target.value)}
                rows={6}
                disabled={!state.permissions.canAnalyze || busy}
              />
              <div className="field-meta">
                <span>{state.correction.authorRole}</span>
                <span>{correction.length} characters</span>
              </div>
              {state.evidence.map((item) => <EvidenceCard key={item.id} evidence={item} />)}
              <button
                className="button button--primary button--full"
                type="submit"
                disabled={!state.permissions.canAnalyze || busy || correction.trim().length < 12}
              >
                {pending === "analyze" ? "Analyzing bounded evidence…" : "Analyze correction"}
              </button>
            </form>
          </li>

          <li className={`stage-card stage-card--${stageState(state.phase, "repair")}`}>
            <header className="stage-card__header">
              <span className="stage-number">2</span>
              <div><p>Bounded repair</p><h2>Review the exact change</h2></div>
              <span className="stage-state">{stageState(state.phase, "repair")}</span>
            </header>

            {state.plan ? (
              <div className="repair-content">
                <div className="plan-summary">
                  <div className="plan-summary__meta">
                    <span className="label">Repair proposal</span>
                    <span
                      className={`plan-origin plan-origin--${state.mode}`}
                      data-testid="plan-origin"
                    >
                      {state.mode === "live"
                        ? `${state.plan.plannerModel} live`
                        : "Deterministic fixture"}
                    </span>
                  </div>
                  <p>{state.plan.summary}</p>
                  <small>{state.plan.rationale}</small>
                </div>

                {linkedEvidence.map((item) => <EvidenceCard key={item.id} evidence={item} />)}

                <div className="diff-panel" aria-label="Proposed diff" data-testid="plan-diff">
                  <div className="diff-panel__title">
                    <span>Proposed patch</span>
                    <code>{state.plan.changes.length} atomic edit{state.plan.changes.length === 1 ? "" : "s"}</code>
                  </div>
                  {state.plan.changes.map((change) => (
                    <div className="diff" key={change.id}>
                      <p><strong>{change.artifact}</strong><span>{change.locator}</span></p>
                      <del><span>−</span>{change.before}</del>
                      <ins><span>+</span>{change.after}</ins>
                    </div>
                  ))}
                </div>

                <div className="stale-block">
                  <span className="label">Invalidated downstream</span>
                  <div className="chip-list">
                    {state.plan.staleArtifacts.map((artifact) => <span key={artifact}>{artifact}</span>)}
                  </div>
                </div>

                <div>
                  <span className="label">Checks selected before apply</span>
                  <CheckList checks={state.plan.checks} compact />
                </div>

                {state.plan.blocked ? (
                  <div className="blocked-plan" role="status">
                    <strong>No patch can be approved.</strong>
                    <span>Refine the correction or reset the synthetic release. No artifacts were changed.</span>
                  </div>
                ) : state.permissions.canApprove ? (
                  <button
                    className="button button--approve button--full"
                    type="button"
                    onClick={handleApprove}
                    disabled={busy}
                  >
                    {pending === "approve" ? "Recording approval…" : "Approve bounded repair"}
                  </button>
                ) : (
                  <button
                    className="button button--approve button--full"
                    type="button"
                    onClick={handleApply}
                    disabled={!state.permissions.canApply || busy}
                  >
                    {verified
                      ? "Applied & verified"
                      : pending === "apply"
                        ? "Applying + verifying…"
                        : "Apply approved patch & verify"}
                  </button>
                )}
                {!state.plan.blocked && (
                  <p className="approval-note">
                    {state.permissions.canApprove
                      ? "Approval records this plan ID and release hash. It does not change any artifact."
                      : verified
                        ? "The hash-bound plan passed all six checks. The model never certified its own proposal."
                        : "The approved plan is hash-bound. The release stays blocked unless every check passes."}
                  </p>
                )}
              </div>
            ) : (
              <EmptyStage title="No repair proposed" body="Analyze the correction to create an evidence-bound, reviewable patch." />
            )}
          </li>

          <li className={`stage-card stage-card--${stageState(state.phase, "proof")}`}>
            <header className="stage-card__header">
              <span className="stage-number">3</span>
              <div><p>Verified proof</p><h2>Earn the release gate</h2></div>
              <span className="stage-state">{stageState(state.phase, "proof")}</span>
            </header>

            {state.proof ? (
              <div className="proof-content">
                <div className="proof-seal" aria-label="Release verified">
                  <span aria-hidden="true">✓</span>
                  <div><small>All invariants passed</small><strong>Release verified</strong></div>
                </div>
                <CheckList checks={state.proof.checks} />
                <div className="hash-card">
                  <span className="label">New proof hash</span>
                  <code data-testid="proof-hash">{state.proof.hash}</code>
                  <dl>
                    <div><dt>Previous</dt><dd>{shortHash(state.proof.previousHash)}</dd></div>
                    <div><dt>Release</dt><dd>{state.proof.releaseVersion}</dd></div>
                    <div><dt>Verified</dt><dd title={state.proof.verifiedAt}>{formatTimestamp(state.proof.verifiedAt)}</dd></div>
                  </dl>
                </div>
                <button
                  className="button button--secondary button--full"
                  type="button"
                  onClick={handleUndo}
                  disabled={!state.permissions.canUndo || busy}
                >
                  {pending === "undo" ? "Checking proof guard…" : "Undo verified change"}
                </button>
                <p className="approval-note">Undo is allowed only while the current release still matches this proof hash.</p>
              </div>
            ) : (
              <EmptyStage
                title={
                  state.permissions.canApply
                    ? "Ready for verification"
                    : planReady
                      ? "Approval required"
                      : "Proof not earned"
                }
                body={
                  state.permissions.canApply
                    ? "Apply the approved patch. Six deterministic checks—not the model—will decide the release state."
                    : planReady
                      ? "Approve the bounded patch. Deterministic checks—not the model—will decide the release state."
                      : "A proof hash appears only after an approved repair passes every release check."
                }
              />
            )}
          </li>
        </ol>

        <section className="demo-footer" aria-label="Demo information">
          <div>
            <span className="synthetic-badge">Synthetic data</span>
            <p>No student records, credentials, or production media are used in this demonstration.</p>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={handleReset}
            disabled={!state.permissions.canReset || busy}
          >
            {pending === "reset" ? "Resetting…" : "Reset demo"}
          </button>
        </section>
      </main>
    </div>
  );
}
