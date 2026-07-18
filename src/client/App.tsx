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
  meta: string;
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

function LedgerStep({ number, title, status, tone, body, meta }: LedgerStepProps) {
  return (
    <li className={`ledger-step ledger-step--${tone}`}>
      <span className="ledger-step__number" aria-hidden="true">{number}</span>
      <div className="ledger-step__content">
        <div className="ledger-step__heading">
          <h3>{title}</h3>
          <StatusTag tone={tone}>{status}</StatusTag>
        </div>
        <p>{body}</p>
        <small>{meta}</small>
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
        <h2 id="conflict-title">{repaired ? "Verified repair summary" : "Evidence conflict summary"}</h2>
      </div>
      <div className="conflict-grid">
        <article className="conflict-claim conflict-claim--incorrect">
          <div className="conflict-claim__meta">
            <span>{repaired ? "Caption before repair" : "Caption in release"}</span>
            <StatusTag tone={repaired ? "gray" : "red"}>{repaired ? "Replaced" : "Wrong"}</StatusTag>
          </div>
          <p>
            At 03:24, the caption {repaired ? "claimed" : "claims"} <strong>{change?.before ?? captionEvidence?.excerpt ?? "No caption claim found."}</strong>
          </p>
          {captionEvidence && <small>{captionEvidence.sourceLabel} / {captionEvidence.locator}</small>}
        </article>
        <article className={`conflict-claim ${repaired || trustedEvidence ? "conflict-claim--checked" : "conflict-claim--unavailable"}`}>
          <div className="conflict-claim__meta">
            <span>{repaired ? "Caption in verified release" : trustedEvidence ? "Trusted teaching note" : "Checked source unavailable"}</span>
            <StatusTag tone={repaired || trustedEvidence ? "green" : "red"}>{repaired ? "Verified" : trustedEvidence ? "Checked" : "Unavailable"}</StatusTag>
          </div>
          <p>
            {repaired ? "The verified caption states" : trustedEvidence ? "The checked source states" : "Review is blocked because"} <strong>{repaired ? change?.after ?? "No applied claim found." : trustedEvidence?.excerpt ?? "no checked teaching-source anchor is available."}</strong>
          </p>
          {repaired
            ? <small>{state.release.version} / {shortHash(state.release.currentHash)}</small>
            : trustedEvidence
              ? <small>{trustedEvidence.sourceLabel} / {trustedEvidence.locator}</small>
              : <small>Fail closed / source anchor required</small>}
        </article>
      </div>
    </section>
  );
}

function EvidencePanel({ evidence }: { evidence: EvidenceAnchor[] }) {
  return (
    <section className="panel evidence-panel" aria-labelledby="evidence-title">
      <div className="panel__heading panel__heading--split">
        <h2 id="evidence-title">Cited evidence</h2>
        <span>{evidence.length} checked anchor{evidence.length === 1 ? "" : "s"}</span>
      </div>
      <div className="evidence-rows">
        {evidence.map((item, index) => (
          <article className={`evidence-row evidence-row--${evidenceTone(item)}`} key={item.id}>
            <span className="evidence-row__index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <div className="evidence-row__meta">
                <strong>{item.sourceLabel}</strong>
                <code>{item.locator}</code>
              </div>
              <blockquote>{item.excerpt}</blockquote>
            </div>
          </article>
        ))}
      </div>
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
        <h2 id="correction-title">Correction input</h2>
        <span>{state.correction.authorRole}</span>
      </div>
      <form id="correction-form" onSubmit={onSubmit} className="correction-form">
        <label htmlFor="correction">Expert correction</label>
        <textarea
          id="correction"
          value={correction}
          onChange={(event) => onCorrection(event.target.value)}
          rows={4}
          disabled={!state.permissions.canAnalyze || busy}
        />
        <div className="field-meta">
          <span>Bound only to cited evidence</span>
          <span>{correction.length} characters</span>
        </div>
      </form>
    </section>
  );
}

function ProposalPanel({ state, evidence }: { state: WorkflowState; evidence: EvidenceAnchor[] }) {
  if (!state.plan) return null;
  const repaired = isVerified(state);

  return (
    <section className="panel proposal-panel" aria-labelledby="proposal-title">
      <div className="panel__heading panel__heading--split">
        <div className="panel__title-row">
          <h2 id="proposal-title">
            {repaired
              ? "Applied bounded patch"
              : state.plan.status === "approved"
                ? "Approved bounded patch"
                : state.mode === "live" ? "GPT-5.6 proposed patch" : "Fixture-proposed patch"}
          </h2>
          <StatusTag tone={state.plan.blocked ? "red" : "blue"}>
            {state.plan.blocked ? "Blocked" : `${state.plan.changes.length} atomic change${state.plan.changes.length === 1 ? "" : "s"}`}
          </StatusTag>
        </div>
        <span data-testid="plan-origin">
          {state.mode === "live" ? `${state.plan.plannerModel} live` : "Deterministic fixture"}
        </span>
      </div>

      <div className="proposal-summary">
        <strong>{state.plan.summary}</strong>
        <span>{state.plan.rationale}</span>
      </div>

      {state.plan.blocked ? (
        <div className="blocked-plan" role="status">
          <strong>No patch can be approved.</strong>
          <span>Refine the correction or reset the synthetic release. No artifacts were changed.</span>
        </div>
      ) : (
        <div className="patch-list" data-testid="plan-diff" aria-label="Proposed diff">
          {state.plan.changes.map((change) => (
            <article className="patch" key={change.id}>
              <div className="patch__meta">
                <strong>{change.artifact}</strong>
                <code>{change.locator}</code>
              </div>
              <div className="patch__diff">
                <div className="patch__side patch__side--before">
                  <span>Before / incorrect</span>
                  <p>{change.before}</p>
                </div>
                <div className="patch__side patch__side--after">
                  <span>After / proposed</span>
                  <p>{change.after}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {!state.plan.blocked && (
        <div className="proposal-details">
          <dl>
            <div><dt>Edit type</dt><dd>Replace text</dd></div>
            <div><dt>Scope</dt><dd>{state.plan.changes.length === 1 ? "One caption claim" : `${state.plan.changes.length} bounded claims`}</dd></div>
            <div><dt>Invalidates</dt><dd>{state.plan.staleArtifacts.length} derived artifact{state.plan.staleArtifacts.length === 1 ? "" : "s"}</dd></div>
          </dl>
          <div className="anchor-list">
            <span>Cited evidence anchors ({evidence.length})</span>
            {evidence.map((item, index) => (
              <p key={item.id}><b>{index + 1}</b><code>{item.sourceLabel} / {item.locator}</code></p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ProofPanel({ state }: { state: WorkflowState }) {
  if (!state.proof) return null;

  return (
    <section className="panel proof-panel" aria-labelledby="proof-title">
      <div className="panel__heading panel__heading--split">
        <div className="panel__title-row">
          <h2 id="proof-title">Deterministic release proof</h2>
          <StatusTag tone="green">Verified</StatusTag>
        </div>
        <span>{formatTimestamp(state.proof.verifiedAt)}</span>
      </div>
      <div className="proof-grid">
        <div className="proof-seal" aria-label="Release verified">
          <CheckCircle size={28} weight="fill" aria-hidden="true" />
          <div>
            <small>All invariants passed</small>
            <strong>Release verified</strong>
          </div>
        </div>
        <CheckList checks={state.proof.checks} />
        <div className="hash-card">
          <span>New proof hash</span>
          <code data-testid="proof-hash">{state.proof.hash}</code>
          <dl>
            <div><dt>Previous</dt><dd>{shortHash(state.proof.previousHash)}</dd></div>
            <div><dt>Release</dt><dd>{state.proof.releaseVersion}</dd></div>
            <div><dt>Verified</dt><dd>{formatTimestamp(state.proof.verifiedAt)}</dd></div>
          </dl>
        </div>
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
        { step: 2, label: "Proposal locked" },
        { step: 3, label: "Approval locked" },
        { step: 4, label: "Proof locked" },
      ]
    : [
        { step: 2, label: blockedPlan ? "Proposal blocked" : proposalPending ? state.mode === "live" ? "Review GPT-5.6 proposal" : "Review fixture proposal" : "Proposal recorded" },
        { step: 3, label: approvalRecorded || verified ? "Approval recorded" : "Approval pending" },
        { step: 4, label: verified ? "Release verified" : state.permissions.canApply ? "Verification ready" : "Proof locked" },
      ];
  const gateTone: Tone = verified
    ? "green"
    : state.plan?.blocked
      ? "red"
      : state.release.gateLabel === "BLOCKED"
        ? "amber"
        : "blue";
  const primaryLabel = state.permissions.canAnalyze
    ? pending === "analyze" ? "Analyzing bounded evidence…" : "Analyze correction"
    : state.permissions.canApprove
      ? pending === "approve" ? "Recording approval…" : "Approve bounded proposal"
      : state.permissions.canApply
        ? pending === "apply" ? "Applying and verifying…" : "Apply approved patch & verify"
        : verified ? "Applied & verified" : "Action unavailable";
  const approvalNote = state.permissions.canApprove
    ? "Approval records this plan ID against the current release hash. It does not change any artifact."
    : state.permissions.canApply
      ? "The approved plan is hash-bound. Every deterministic check must pass before a proof is issued."
      : verified
        ? "The hash-bound plan passed every deterministic check. The model did not certify its own proposal."
        : state.mode === "live"
          ? "GPT-5.6 can propose a patch only from the checked evidence shown above."
          : "The deterministic fixture can propose a patch only from the checked evidence shown above.";

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="#main" aria-label="LessonProof Proof Ledger">
          <span className="brand-mark" aria-hidden="true">LP</span>
          <span>Proof Ledger</span>
        </a>
        <div className="header-badges">
          <span className={`mode-badge mode-badge--${state.mode}`} data-testid="ai-mode">
            <span aria-hidden="true" />
            {state.mode === "live" ? `${state.plan?.plannerModel ?? state.model ?? "GPT-5.6"} live` : "Deterministic fixture"}
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

          <section className="decision-bar" aria-label="Current review action" aria-busy={busy}>
            <button
              className="button button--secondary decision-bar__secondary"
              type="button"
              onClick={verified ? handleUndo : state.permissions.canApprove ? handleReject : handleReset}
              disabled={verified ? !state.permissions.canUndo || busy : !state.permissions.canReset || busy}
            >
              {verified ? <ArrowCounterClockwise size={20} aria-hidden="true" /> : <X size={20} aria-hidden="true" />}
              {verified
                ? pending === "undo" ? "Checking proof guard…" : "Undo verified change"
                : state.permissions.canApprove ? pending === "reject" ? "Rejecting proposal…" : "Reject proposal" : pending === "reset" ? "Resetting…" : "Reset demo"}
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
                  ? "Proof hash issued."
                  : state.permissions.canApply
                    ? "No artifact changes until Apply & verify."
                    : state.permissions.canApprove
                      ? "No artifact changes before approval."
                      : "Analysis cannot change artifacts."}
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
              title="Source locked"
              status="Locked"
              tone="green"
              body={`The correction is grounded in ${state.evidence.length} checked evidence anchor${state.evidence.length === 1 ? "" : "s"}.`}
              meta={`Release baseline ${shortHash(state.release.baselineHash)}`}
            />
            <LedgerStep
              number={2}
              title={state.plan ? approvalRecorded || verified ? "Proposal recorded" : "Proposal ready" : "Proposal locked"}
              status={state.plan ? state.plan.blocked ? "Blocked" : approvalRecorded || verified ? "Recorded" : "Ready" : "Locked"}
              tone={state.plan ? state.plan.blocked ? "red" : "blue" : "gray"}
              body={state.plan ? state.plan.summary : "Analyze the correction to request a bounded proposal."}
              meta={state.plan ? `Plan ${shortHash(state.plan.id)}` : "No plan recorded"}
            />
            <LedgerStep
              number={3}
              title={approvalRecorded || verified ? "Human approval recorded" : "Human approval pending"}
              status={approvalRecorded || verified ? "Recorded" : proposalPending ? "Pending" : "Locked"}
              tone={approvalRecorded || verified ? "blue" : proposalPending ? "amber" : "gray"}
              body={approvalRecorded || verified ? "The plan ID is bound to the reviewed release hash." : proposalPending ? "Review the exact patch and cited evidence before approval." : "Approval opens only after a valid proposal exists."}
              meta={approvalRecorded || verified ? `Bound to ${shortHash(state.release.baselineHash)}` : "No approval recorded"}
            />
            <LedgerStep
              number={4}
              title={verified ? "Release proof issued" : state.permissions.canApply ? "Release proof ready" : "Release proof locked"}
              status={verified ? "Verified" : state.permissions.canApply ? "Ready" : "Locked"}
              tone={verified ? "green" : state.permissions.canApply ? "blue" : "gray"}
              body={verified ? `${passedChecks}/${checkCount} deterministic checks passed.` : state.permissions.canApply ? "Apply the approved patch and run every deterministic check." : `Checks (${passedChecks}/${checkCount}) not complete.`}
              meta={verified && state.proof ? formatTimestamp(state.proof.verifiedAt) : "Proof hash not issued"}
            />
          </ol>

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
              <div><dt>Atomic changes</dt><dd>{state.plan?.changes.length ?? 0}</dd></div>
              <div><dt>Cited anchors</dt><dd>{linkedEvidence.length || state.evidence.length}</dd></div>
              <div><dt>Deterministic checks</dt><dd>{passedChecks} / {checkCount} passed</dd></div>
              <div><dt>Proof hash</dt><dd>{state.proof ? shortHash(state.proof.hash) : "Not issued"}</dd></div>
            </dl>
            <span className="copy-status" role="status">{copied ? "Release hash copied" : ""}</span>
          </section>

          <div className="ledger-note">
            <Info size={20} aria-hidden="true" />
            <p>
              {verified
                ? "This release can be traced from correction to evidence, approval, checks, and proof hash."
                : state.permissions.canApply
                  ? `LessonProof will apply the bounded patch and run ${checkCount} deterministic checks before issuing a proof hash.`
                  : "LessonProof keeps the release unchanged until a human approves the exact bounded patch."}
            </p>
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
