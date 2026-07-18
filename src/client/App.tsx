import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowCounterClockwise,
  CheckCircle,
  Copy,
  Info,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import { createApiClient, type LessonProofApi } from "./api";
import { CheckList } from "./components/CheckList";
import {
  DEFAULT_CORRECTION,
  isVerified,
  type EvidenceAnchor,
  type WorkflowState,
} from "./types";

type PendingAction = "load" | "analyze" | "approve" | "apply" | "undo" | "reject" | "reset" | null;
type Tone = "blue" | "green" | "amber" | "red" | "gray";

interface AppProps {
  api?: LessonProofApi;
}

interface LedgerStepProps {
  number: number;
  title: string;
  status: string;
  tone: Tone;
  body: string;
}

function shortHash(hash: string): string {
  if (hash.length <= 22) return hash;
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
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

function evidenceTone(evidence: EvidenceAnchor): "incorrect" | "checked" {
  return evidence.kind === "caption" ? "incorrect" : "checked";
}

function StatusTag({ tone, children }: { tone: Tone; children: string }) {
  return <span className={`status-tag status-tag--${tone}`}>{children}</span>;
}

function LedgerStep({ number, title, status, tone, body }: LedgerStepProps) {
  return (
    <li className={`ledger-step ledger-step--${tone}`}>
      <span className="ledger-step__number" aria-hidden="true">{number}</span>
      <div className="ledger-step__content">
        <div className="ledger-step__heading">
          <h3>{title}</h3>
          <StatusTag tone={tone}>{status}</StatusTag>
        </div>
        <p>{body}</p>
      </div>
    </li>
  );
}

function EvidenceConflict({ state }: { state: WorkflowState }) {
  const repaired = isVerified(state);
  const captionEvidence = state.evidence.find((item) => item.kind === "caption") ?? state.evidence[0];
  const trustedEvidence = state.evidence.find((item) => item.kind !== "caption");
  const change = state.plan?.changes[0];

  return (
    <section className="panel conflict-panel" aria-labelledby="conflict-title">
      <div className="panel__heading">
        <h2 id="conflict-title">{repaired ? "What changed" : "Problem and trusted source"}</h2>
      </div>
      <div className="conflict-grid">
        <article className="conflict-claim conflict-claim--incorrect">
          <div className="conflict-claim__meta">
            <span>{repaired ? "Before" : "Current caption"}</span>
            <StatusTag tone={repaired ? "gray" : "red"}>{repaired ? "Replaced" : "Wrong"}</StatusTag>
          </div>
          <p>
            At 03:24, the caption {repaired ? "claimed" : "claims"} <strong>{change?.before ?? captionEvidence?.excerpt ?? "No caption claim found."}</strong>
          </p>
        </article>
        <article className={`conflict-claim ${repaired || trustedEvidence ? "conflict-claim--checked" : "conflict-claim--unavailable"}`}>
          <div className="conflict-claim__meta">
            <span>{repaired ? "After" : trustedEvidence ? "Trusted source" : "Trusted source unavailable"}</span>
            <StatusTag tone={repaired || trustedEvidence ? "green" : "red"}>{repaired ? "Verified" : trustedEvidence ? "Checked" : "Unavailable"}</StatusTag>
          </div>
          <p>
            {repaired ? "The verified caption states" : trustedEvidence ? "The checked source states" : "Review is blocked because"} <strong>{repaired ? change?.after ?? "No applied claim found." : trustedEvidence?.excerpt ?? "no checked teaching-source anchor is available."}</strong>
          </p>
        </article>
      </div>
    </section>
  );
}

function EvidencePanel({ evidence }: { evidence: EvidenceAnchor[] }) {
  return (
    <section className="panel evidence-panel" aria-labelledby="evidence-title">
      <div className="panel__heading panel__heading--split">
        <h2 id="evidence-title">Supporting evidence</h2>
        <span>{evidence.length} exact evidence item{evidence.length === 1 ? "" : "s"}</span>
      </div>
      <div className="evidence-rows">
        {evidence.map((item, index) => (
          <article className={`evidence-row evidence-row--${evidenceTone(item)}`} key={item.id}>
            <span className="evidence-row__index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <div className="evidence-row__meta">
                <strong>{item.sourceLabel}</strong>
              </div>
              <blockquote>{item.excerpt}</blockquote>
            </div>
          </article>
        ))}
      </div>
      <details className="technical-details evidence-technical-details" data-testid="evidence-technical-details">
        <summary>Technical details<span className="sr-only"> for supporting evidence</span></summary>
        <dl className="technical-details__list">
          {evidence.map((item, index) => (
            <div key={item.id}>
              <dt>Evidence item {index + 1}</dt>
              <dd><code>{item.sourceLabel} / {item.locator}</code></dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}

function CorrectionEditor({
  state,
  correction,
  busy,
  onCorrection,
  onSubmit,
}: {
  state: WorkflowState;
  correction: string;
  busy: boolean;
  onCorrection: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="panel correction-panel" aria-labelledby="correction-title">
      <div className="panel__heading panel__heading--split">
        <h2 id="correction-title">Correction request</h2>
        <span>{state.correction.authorRole}</span>
      </div>
      <form id="correction-form" onSubmit={onSubmit} className="correction-form">
        <label htmlFor="correction">What should change?</label>
        <textarea
          id="correction"
          aria-describedby="correction-help correction-count"
          value={correction}
          onChange={(event) => onCorrection(event.target.value)}
          rows={4}
          disabled={!state.permissions.canAnalyze || busy}
        />
        <div className="field-meta">
          <span id="correction-help">Uses only the exact evidence above</span>
          <span id="correction-count">{correction.length} characters</span>
        </div>
      </form>
    </section>
  );
}

function ProposalPanel({ state, evidence }: { state: WorkflowState; evidence: EvidenceAnchor[] }) {
  if (!state.plan) return null;
  const repaired = isVerified(state);
  const suggestionTitle = repaired
    ? "Applied change"
    : state.plan.status === "approved"
      ? "Approved change"
      : state.mode === "live" ? "GPT-5.6 suggestion" : "Demo suggestion";
  const plainSummary = repaired
    ? "Your approved change is present in the release."
    : state.plan.status === "approved"
      ? "You approved this exact change. The synthetic release has not changed yet."
      : state.mode === "live"
        ? "GPT-5.6 suggested one exact replacement."
        : "The built-in demo suggested one exact replacement.";

  return (
    <section className="panel proposal-panel" aria-labelledby="proposal-title">
      <div className="panel__heading panel__heading--split">
        <div className="panel__title-row">
          <h2 id="proposal-title">{suggestionTitle}</h2>
          <StatusTag tone={state.plan.blocked ? "red" : "blue"}>
            {state.plan.blocked ? "Blocked" : `${state.plan.changes.length} change${state.plan.changes.length === 1 ? "" : "s"}`}
          </StatusTag>
        </div>
        <span data-testid="plan-origin">
          {state.mode === "live" ? `${state.plan.plannerModel} live` : "Built-in demo"}
        </span>
      </div>

      <div className="proposal-summary">
        <strong>{plainSummary}</strong>
      </div>

      {state.plan.blocked ? (
        <div className="blocked-plan" role="status">
          <strong>No safe suggestion is available.</strong>
          <span>Change the request or reset the demo. The synthetic release has not changed.</span>
        </div>
      ) : (
        <div className="patch-list" data-testid="plan-diff" aria-label="Proposed diff">
          {state.plan.changes.map((change) => (
            <article className="patch" key={change.id}>
              <div className="patch__meta">
                <strong>{change.artifact}</strong>
              </div>
              <div className="patch__diff">
                <div className="patch__side patch__side--before">
                  <span>Before</span>
                  <p>{change.before}</p>
                </div>
                <div className="patch__side patch__side--after">
                  <span>{repaired ? "After / applied" : "After / suggested"}</span>
                  <p>{change.after}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {!state.plan.blocked && (
        <details className="technical-details proposal-technical-details" data-testid="plan-technical-details">
          <summary>Technical details<span className="sr-only"> for the suggested change</span></summary>
          <div className="proposal-details">
            <dl>
              <div><dt>Plan ID</dt><dd>{state.plan.id}</dd></div>
              <div><dt>Planner</dt><dd>{state.plan.plannerModel}</dd></div>
              <div><dt>System summary</dt><dd>{state.plan.summary}</dd></div>
              <div><dt>Reason</dt><dd>{state.plan.rationale}</dd></div>
              <div><dt>Edit type</dt><dd>Replace text</dd></div>
              <div><dt>Scope</dt><dd>{state.plan.changes.length === 1 ? "One caption claim" : `${state.plan.changes.length} caption claims`}</dd></div>
              <div><dt>Dependency proof record IDs</dt><dd>{state.plan.staleArtifacts.join(", ") || "None"}</dd></div>
            </dl>
            <div className="anchor-list">
              <span>Evidence anchors ({evidence.length})</span>
              {evidence.map((item, index) => (
                <p key={item.id}><b>{index + 1}</b><code>{item.sourceLabel} / {item.locator}</code></p>
              ))}
              <span className="anchor-list__label">Change locations</span>
              {state.plan.changes.map((change, index) => (
                <p key={change.id}><b>{index + 1}</b><code>{change.artifact} / {change.locator}</code></p>
              ))}
            </div>
          </div>
        </details>
      )}
    </section>
  );
}

function ProofPanel({ state }: { state: WorkflowState }) {
  if (!state.proof) return null;
  const passedChecks = state.proof.checks.filter((check) => check.status === "pass").length;
  const checkCount = state.proof.checks.length;
  const changeCount = state.plan?.changes.length ?? 0;
  const dependencyProofCount = state.plan?.staleArtifacts.length ?? 0;

  return (
    <section className="panel proof-panel" aria-labelledby="proof-title">
      <div className="panel__heading panel__heading--split">
        <div className="panel__title-row">
          <h2 id="proof-title">Verification result</h2>
          <StatusTag tone="green">Verified</StatusTag>
        </div>
        <span>{formatTimestamp(state.proof.verifiedAt)}</span>
      </div>
      <p className="verified-outcome" data-testid="verified-outcome" role="status">
        {changeCount} caption{changeCount === 1 ? "" : "s"} fixed. {dependencyProofCount} dependency proof{dependencyProofCount === 1 ? "" : "s"} recomputed. {passedChecks} of {checkCount} checks passed.
      </p>
      <div className="proof-grid">
        <div className="proof-seal" aria-label="Change verified">
          <CheckCircle size={28} weight="fill" aria-hidden="true" />
          <div>
            <small>All checks passed</small>
            <strong>Change verified</strong>
          </div>
        </div>
        <CheckList checks={state.proof.checks} />
        <details className="technical-details proof-technical-details" data-testid="proof-technical-details">
          <summary>Technical details<span className="sr-only"> for verification</span></summary>
          <div className="hash-card">
            <span>New proof hash</span>
            <code data-testid="proof-hash">{state.proof.hash}</code>
            <dl>
              <div><dt>Previous</dt><dd>{shortHash(state.proof.previousHash)}</dd></div>
              <div><dt>Release</dt><dd>{state.proof.releaseVersion}</dd></div>
              <div><dt>Verified</dt><dd>{formatTimestamp(state.proof.verifiedAt)}</dd></div>
            </dl>
          </div>
        </details>
      </div>
    </section>
  );
}

export default function App({ api: providedApi }: AppProps) {
  const api = useMemo(() => providedApi ?? createApiClient(), [providedApi]);
  const [state, setState] = useState<WorkflowState | null>(null);
  const [correction, setCorrection] = useState(DEFAULT_CORRECTION);
  const [pending, setPending] = useState<PendingAction>("load");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(
    action: Exclude<PendingAction, "load" | null>,
    operation: () => Promise<WorkflowState>,
    preserveCorrection = false,
  ) {
    const correctionBeforeAction = correction;
    setPending(action);
    setError(null);

    try {
      const nextState = await operation();
      setState(nextState);
      setCorrection(preserveCorrection ? correctionBeforeAction : nextState.correction.text);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong. Please try again.";
      try {
        const currentState = await api.getState();
        setState(currentState);
        if (!preserveCorrection && (action !== "analyze" || currentState.correction.text === correction.trim())) {
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

  function handleReject() {
    void run("reject", () => api.reset(), true);
  }

  async function handleCopyHash() {
    if (!state) return;
    const hash = state.proof?.hash ?? state.release.currentHash;
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("The release hash could not be copied in this browser.");
    }
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
  const busy = pending !== null;
  const evidenceById = new Map(state.evidence.map((item) => [item.id, item]));
  const linkedEvidence = state.plan
    ? state.plan.evidenceIds.map((id) => evidenceById.get(id)).filter((item): item is EvidenceAnchor => Boolean(item))
    : state.evidence;
  const passedChecks = state.proof?.checks.filter((check) => check.status === "pass").length ?? 0;
  const checkCount = state.proof?.checks.length ?? state.plan?.checks.length ?? 6;
  const isInitial = !state.plan;
  const blockedPlan = Boolean(state.plan?.blocked);
  const proposalPending = Boolean(state.plan && state.plan.status === "proposed" && !state.plan.blocked);
  const approvalRecorded = Boolean(state.plan && state.plan.status === "approved");
  const activeProgress = verified ? 4 : state.permissions.canApply ? 4 : state.permissions.canApprove || blockedPlan ? 2 : 1;
  const progressSteps = isInitial
    ? [
        { step: 1, label: "Review correction" },
        { step: 2, label: "Suggestion locked" },
        { step: 3, label: "Your approval locked" },
        { step: 4, label: "Final checks locked" },
      ]
    : [
        { step: 2, label: blockedPlan ? "Suggestion blocked" : proposalPending ? state.mode === "live" ? "Review GPT-5.6 suggestion" : "Review demo suggestion" : "Suggestion recorded" },
        { step: 3, label: approvalRecorded || verified ? "Your approval recorded" : "Your approval pending" },
        { step: 4, label: verified ? "Final checks passed" : state.permissions.canApply ? "Ready for final checks" : "Final checks locked" },
      ];
  const gateTone: Tone = verified
    ? "green"
    : state.plan?.blocked
      ? "red"
      : state.release.gateLabel === "BLOCKED"
        ? "amber"
        : "blue";
  const primaryLabel = state.permissions.canAnalyze
    ? pending === "analyze"
      ? state.mode === "live" ? "Asking GPT-5.6…" : "Preparing suggestion…"
      : state.mode === "live" ? "Ask GPT-5.6 for a suggestion" : "Show a safe suggestion"
    : state.permissions.canApprove
      ? pending === "approve" ? "Recording your approval…" : "Approve this exact change"
      : state.permissions.canApply
        ? pending === "apply" ? "Applying change and checking…" : `Apply change & run ${checkCount} ${checkCount === 1 ? "check" : "checks"}`
        : verified ? "Change verified" : "Action unavailable";
  const approvalNote = state.permissions.canApprove
    ? "You are approving only the exact change shown above. The synthetic release will not change yet."
    : state.permissions.canApply
      ? "You approved this exact change. LessonProof will update the synthetic caption record, recompute the affected dependency proof records, and run every check."
      : verified
        ? "Your approved change is present, the declared dependency proof records are current, and every check passed."
        : state.mode === "live"
          ? "GPT-5.6 can suggest one change from the exact evidence. It cannot approve or apply it."
          : "The built-in demo shows one safe suggestion. No AI call is made.";

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="#main" aria-label="LessonProof Proof Ledger">
          <span className="brand-mark" aria-hidden="true">LP</span>
          <span>LessonProof</span>
        </a>
        <div className="header-badges">
          <span className={`mode-badge mode-badge--${state.mode}`} data-testid="ai-mode">
            <span aria-hidden="true" />
            {state.mode === "live" ? `${state.plan?.plannerModel ?? state.model ?? "GPT-5.6"} live` : "Built-in demo · no AI call"}
          </span>
          <span className="event-badge">OpenAI Build Week 2026</span>
        </div>
      </header>

      <nav className="progress-bar" aria-label="Release review progress">
        <ol>
          {progressSteps.map(({ step, label }) => (
            <li
              key={step}
              className={step === activeProgress ? "is-active" : step < activeProgress ? "is-complete" : "is-future"}
              aria-current={step === activeProgress ? "step" : undefined}
            >
              <span>{step}</span><strong>{label}</strong>
            </li>
          ))}
        </ol>
        <span className="release-version">Version <strong>{state.release.version}</strong></span>
      </nav>

      <main id="main" className="workspace">
        <h1 className="sr-only">LessonProof release review</h1>
        <div className="review-column">
          {error && (
            <div className="error-banner" role="alert">
              <div><strong>Action stopped.</strong><span>{error}</span></div>
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={18} aria-hidden="true" /></button>
            </div>
          )}
          {state.notice && <p className="notice" role="status">{state.notice}</p>}

          <EvidenceConflict state={state} />
          <EvidencePanel evidence={linkedEvidence.length ? linkedEvidence : state.evidence} />
          {(isInitial || state.plan?.blocked) && (
            <CorrectionEditor
              state={state}
              correction={correction}
              busy={busy}
              onCorrection={setCorrection}
              onSubmit={handleAnalyze}
            />
          )}
          <ProposalPanel state={state} evidence={linkedEvidence} />
          <ProofPanel state={state} />

          <section className={`decision-bar${verified ? " decision-bar--complete" : ""}`} aria-label="Current review action" aria-busy={busy}>
            <button
              className="button button--secondary decision-bar__secondary"
              type="button"
              onClick={verified ? handleUndo : state.permissions.canApprove ? handleReject : handleReset}
              disabled={verified ? !state.permissions.canUndo || busy : !state.permissions.canReset || busy}
            >
              {verified ? <ArrowCounterClockwise size={20} aria-hidden="true" /> : <X size={20} aria-hidden="true" />}
              {verified
                ? pending === "undo" ? "Checking proof guard…" : "Undo verified change"
                : state.permissions.canApprove ? pending === "reject" ? "Rejecting suggestion…" : "Reject suggestion" : pending === "reset" ? "Resetting…" : "Reset demo"}
            </button>
            <p>{approvalNote}</p>
            <div className="decision-bar__primary">
              <button
                className="button button--primary"
                type={state.permissions.canAnalyze ? "submit" : "button"}
                form={state.permissions.canAnalyze ? "correction-form" : undefined}
                onClick={state.permissions.canApprove ? handleApprove : state.permissions.canApply ? handleApply : undefined}
                disabled={busy || (state.permissions.canAnalyze && correction.trim().length < 12) || (!state.permissions.canAnalyze && !state.permissions.canApprove && !state.permissions.canApply)}
              >
                <ShieldCheck size={22} weight="bold" aria-hidden="true" />
                {primaryLabel}
              </button>
              <small>
                {verified
                  ? "Verification complete."
                  : state.permissions.canApply
                    ? "The synthetic caption record changes and dependency proof records are recomputed only after you choose Apply."
                    : state.permissions.canApprove
                      ? "Approving does not change the synthetic release."
                      : "This step cannot change the synthetic release."}
              </small>
            </div>
          </section>
        </div>

        <aside className="ledger panel" aria-labelledby="ledger-title" data-testid="release-gate">
          <div className="panel__heading panel__heading--split">
            <h2 id="ledger-title">Proof ledger</h2>
            <StatusTag tone={gateTone}>
              {state.release.gateLabel}
            </StatusTag>
          </div>
          <ol className="ledger-timeline">
            <LedgerStep
              number={1}
              title="Evidence anchored"
              status="Exact"
              tone="green"
              body={`The correction is linked to ${state.evidence.length} exact evidence item${state.evidence.length === 1 ? "" : "s"}.`}
            />
            <LedgerStep
              number={2}
              title={state.plan ? approvalRecorded || verified ? "Suggestion recorded" : "Suggestion ready" : "Suggestion locked"}
              status={state.plan ? state.plan.blocked ? "Blocked" : approvalRecorded || verified ? "Recorded" : "Ready" : "Locked"}
              tone={state.plan ? state.plan.blocked ? "red" : "blue" : "gray"}
              body={state.plan ? state.plan.blocked ? "No safe change can be suggested from the exact evidence." : `${state.plan.changes.length} exact change${state.plan.changes.length === 1 ? " is" : "s are"} ready for review.` : "Review the correction to see one evidence-bound suggestion."}
            />
            <LedgerStep
              number={3}
              title={approvalRecorded || verified ? "Your approval recorded" : "Your approval pending"}
              status={approvalRecorded || verified ? "Recorded" : proposalPending ? "Pending" : "Locked"}
              tone={approvalRecorded || verified ? "blue" : proposalPending ? "amber" : "gray"}
              body={approvalRecorded || verified ? "You approved the exact change shown on the left." : proposalPending ? "Check the before and after text, then approve only that change." : "Approval opens after a safe suggestion is ready."}
            />
            <LedgerStep
              number={4}
              title={verified ? "Final verification passed" : state.permissions.canApply ? "Final verification ready" : "Final verification locked"}
              status={verified ? "Verified" : state.permissions.canApply ? "Ready" : "Locked"}
              tone={verified ? "green" : state.permissions.canApply ? "blue" : "gray"}
              body={verified ? `${state.plan?.changes.length ?? 0} caption fixed, ${state.plan?.staleArtifacts.length ?? 0} dependency proof records recomputed, and ${passedChecks} of ${checkCount} checks passed.` : state.permissions.canApply ? "Apply the approved change and run every check." : `Checks are not complete (${passedChecks} of ${checkCount}).`}
            />
          </ol>

          <details className="technical-details release-technical-details" data-testid="release-technical-details">
            <summary>Technical details<span className="sr-only"> for this release</span></summary>
            <section className="release-summary" aria-labelledby="summary-title">
              <h3 id="summary-title">Release summary</h3>
              <dl>
                <div><dt>Version</dt><dd>{state.release.version}</dd></div>
                <div>
                  <dt>Current release hash</dt>
                  <dd>
                    <code title={state.release.currentHash}>{shortHash(state.release.currentHash)}</code>
                    <button type="button" onClick={handleCopyHash} aria-label="Copy current release hash"><Copy size={16} aria-hidden="true" /></button>
                  </dd>
                </div>
                <div><dt>Changes</dt><dd>{state.plan?.changes.length ?? 0}</dd></div>
                <div><dt>Evidence items</dt><dd>{linkedEvidence.length || state.evidence.length}</dd></div>
                <div><dt>Checks</dt><dd>{passedChecks} / {checkCount} passed</dd></div>
                <div><dt>Proof hash</dt><dd>{state.proof ? shortHash(state.proof.hash) : "Not issued"}</dd></div>
              </dl>
              <span className="copy-status" role="status">{copied ? "Release hash copied" : ""}</span>
            </section>
          </details>

          <div className="ledger-note">
            <Info size={20} aria-hidden="true" />
            <div>
              <strong>What LessonProof proves</strong>
              <p>It does not prove that the formula is true. It verifies that this approved change is present in this release version and that the declared dependency proof records are current.</p>
            </div>
          </div>

          <footer className="ledger-footer">
            <span>Synthetic data</span>
            <p>No student records, credentials, or production media are used.</p>
          </footer>
        </aside>
      </main>
    </div>
  );
}
