---
version: alpha
name: LessonProof Proof Ledger
description: A compact evidence-review workspace for human-approved, deterministically verified lesson repairs.
colors:
  primary: "#075BD8"
  primary-dark: "#0649AE"
  primary-surface: "#EEF6FF"
  canvas: "#F6F8FA"
  surface: "#FFFFFF"
  surface-muted: "#F8FAFC"
  on-surface: "#17202A"
  on-muted: "#66717D"
  border: "#CBD3DC"
  border-soft: "#E2E7EC"
  success: "#24733F"
  success-surface: "#EFF8EF"
  warning: "#9A6500"
  warning-surface: "#FFF7E6"
  error: "#B42318"
  error-surface: "#FFF1F0"
  focus-ring: "#0B1220"
typography:
  heading-technical:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "11.5px"
    fontWeight: "750"
    lineHeight: "1.35"
    letterSpacing: "0.13em"
  body-md:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: "400"
    lineHeight: "1.5"
  body-technical:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "12px"
    fontWeight: "400"
    lineHeight: "1.6"
  label-sm:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "10px"
    fontWeight: "700"
    lineHeight: "1.35"
    letterSpacing: "0.10em"
rounded:
  none: "0px"
  sm: "4px"
  md: "7px"
  full: "999px"
spacing:
  none: "0px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  app-canvas:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.none}"
  panel-heading:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.on-surface}"
    typography: "{typography.heading-technical}"
    padding: "{spacing.lg}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "52px"
    padding: "{spacing.lg}"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
  status-info:
    backgroundColor: "{colors.primary-surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
  status-success:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success}"
    rounded: "{rounded.sm}"
  status-warning:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning}"
    rounded: "{rounded.sm}"
  status-error:
    backgroundColor: "{colors.error-surface}"
    textColor: "{colors.error}"
    rounded: "{rounded.sm}"
  divider:
    backgroundColor: "{colors.border-soft}"
    textColor: "{colors.on-muted}"
    height: "1px"
  divider-strong:
    backgroundColor: "{colors.border}"
    textColor: "{colors.on-muted}"
    height: "1px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-technical}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  focus-indicator:
    backgroundColor: "{colors.focus-ring}"
    textColor: "{colors.surface}"
    rounded: "{rounded.none}"
  status-label:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.on-muted}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
---

## Overview

LessonProof is a release-review workspace, not a landing page. It must let a judge understand the safety boundary without narration: evidence and exact changes are inspected on the left; the persistent Proof Ledger on the right shows what is locked, pending, recorded, or verified.

The visual target is the selected Proof Ledger concept. Dynamic copy and provenance must remain truthful to the live state, even when that means the production screen cannot reproduce invented timestamps or source lines from the concept image.

## Colors

The base is white and cool gray with graphite text. Ultramarine identifies model proposals, the current workflow step, and the one available primary action. Amber means a human decision is pending. Green is reserved for checked evidence, passed checks, and verified releases. Red is reserved for an incorrect claim, a failed check, or a genuinely blocked proposal.

## Typography

Interface copy uses the local system sans stack. Evidence, hashes, locators, technical headings, and diffs use the local monospace stack. No external font request is allowed. Headings are compact, uppercase, and tracked; body copy remains sentence case and readable at small sizes.

## Layout

The desktop workbench uses a broad evidence column and a persistent 370px ledger. The header and progress rail stay compact. Panels use 7px radii, thin borders, and flat surfaces. The current decision bar stays near the bottom of the active review column and exposes exactly one enabled primary action.

Below 980px the ledger moves under the evidence workspace. Below 720px conflict and diff columns stack, the decision bar becomes a single column, and the progress rail scrolls horizontally. Buttons keep a minimum height of 52px.

## Elevation & Depth

Depth comes from grouping, borders, and semantic fills. There are no gradients, glows, glass effects, or box shadows.

## Shapes

Panels and buttons use restrained 4–7px radii. Full pills are limited to compact provenance badges. Numbered workflow markers may be circular because they communicate sequence rather than decoration.

## Components

- `Evidence conflict summary` contrasts the release claim with the checked claim. After Apply, it changes to a truthful before/after repair summary.
- `Cited evidence` shows only real anchors supplied by the workflow state.
- `Bounded patch` shows the exact before/after diff, scope, invalidated artifacts, and cited anchors.
- `Proof Ledger` remains visible across states and never implies that a model approved or verified its own proposal.
- `Decision bar` maps to Analyze, Approve, Apply & verify, or the disabled verified receipt. Reset, reject, and guarded undo remain secondary.
- Icons come from Phosphor Icons. Do not replace them with emoji, text glyphs, handcrafted SVG, or CSS drawings.

## Do's and Don'ts

- Do preserve the sequence: correction, source-bound proposal, human approval, deterministic checks, proof hash.
- Do keep live GPT-5.6 provenance and deterministic fixture provenance visibly distinct.
- Do show current release, plan, and proof hashes only when the state supplies them.
- Do keep semantic status colors consistent across the main review and ledger.
- Do not add a marketing hero, decorative artwork, generic feature cards, or repeated primary calls to action.
- Do not claim a timestamp, evidence line, hash, check result, or verified state that the runtime did not produce.
- Do not use green for approval alone; approval is recorded, while verification is earned by deterministic checks.
