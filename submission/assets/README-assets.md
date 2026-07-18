# LessonProof submission assets

These are original, truthfully labeled assets for the LessonProof competition
submission. They use no third-party logos or brand marks.

## Asset manifest

| File | Canvas | Intended use |
|---|---:|---|
| `cover.png` | 1600×900 | Deployed public live UI at commit `2610375`, captured in the initial `BLOCKED` state |
| `architecture.svg` / `architecture.png` | 1600×900 | Architecture visual for the repository, submission description, and final demo-video explanation |
| `youtube-thumbnail.svg` / `youtube-thumbnail.png` | 1280×720 | YouTube demo thumbnail |
| `screenshots/01-initial-blocked.png` | 1600×900 | Deployed public live UI at commit `2610375`, captured in the initial `BLOCKED` state |
| `screenshots/02-repair-proposed.png` | 1600×900 | Current local code in the built-in demo proposal state, visibly labeled `Built-in demo · no AI call` |
| `screenshots/03-release-verified.png` | 1600×900 | Deployed public live UI at commit `2610375`, captured in the verified six-check state |
| `screenshots/04-mobile-initial.png` | 390×844 | Responsive deployed public live UI at commit `2610375`, captured in a clean initial `BLOCKED` session |

## Content contract

- The palette is derived from the implemented Proof Ledger UI: cool gray
  canvas, white evidence surfaces, graphite text, ultramarine for the current
  action, amber for pending human review, and green for checked or verified
  states.
- The architecture asset reflects implemented boundaries: per-browser isolated
  sessions, same-origin mutations, a read-only planner, explicit reviewer
  approval, all six deterministic checks, a proof hash, and guarded undo.
- GPT-5.6 is shown as the live read-only planner capability. The cover and
  live-mode captures document the current deployed UI at commit `2610375`:
  the initial release gate, the verified six-check result, and the responsive
  initial `BLOCKED` state.
- The built-in demo follows the same validation and approval path without an AI
  call. Its proposal capture visibly shows `Built-in demo · no AI call` and
  comes from the current local code.
- The formula example is synthetic: `sin⁻¹(x) = 1/sin(x)` is corrected to
  `sin⁻¹(x) = arcsin(x)`.
- The architecture and thumbnail pairs are explanatory compositions, not
  screenshots. They do not fabricate
  product screens, metrics, endorsements, prizes, or verification results.
- `cover.png`, `screenshots/01-initial-blocked.png`,
  `screenshots/03-release-verified.png`, and
  `screenshots/04-mobile-initial.png` are real captures of the public
  deployment at commit `2610375`. `screenshots/02-repair-proposed.png` is a
  real capture of the current local built-in demo path, with its no-AI
  provenance visible in the interface.

## Export to PNG on macOS

The checked-in PNG files are the approved submission exports. Keep SVG as the
canonical source only for the architecture and video thumbnail. To reproduce
those SVG exports on macOS, use headless Chrome:

```bash
cd submission/assets
assets_dir="$(pwd)"

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1600,900 \
  --screenshot=architecture.png "file://${assets_dir}/architecture.svg"

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1280,720 \
  --screenshot=youtube-thumbnail.png \
  "file://${assets_dir}/youtube-thumbnail.svg"
```

Confirm the exported dimensions:

```bash
sips -g pixelWidth -g pixelHeight cover.png architecture.png youtube-thumbnail.png
```

Expected results are 1600×900, 1600×900, and 1280×720 respectively. If a
platform accepts SVG directly, prefer the canonical SVG to avoid raster
resampling.

## Validation and safe use

```bash
xmllint --noout architecture.svg youtube-thumbnail.svg
```

Before submission or upload:

1. visually inspect the exact exported files at 100% scale;
2. keep important thumbnail text inside the existing safe margins;
3. do not add third-party logos or unverified claims;
4. use only screenshots captured separately from the real running application;
5. retain this README as the provenance and export note for the asset pack.

Created for the LessonProof 2026 competition submission. No organizer logo or
visual identity is used.
