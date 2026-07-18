# LessonProof submission assets

These are original, deterministic SVG assets for the LessonProof competition
submission. They use no external images, fonts, logos, or third-party brand
marks.

## Asset manifest

| File | Canvas | Intended use |
|---|---:|---|
| `cover.svg` / `cover.png` | 1600×900 | Primary project cover for the submission page, repository social preview, and opening/closing video frame |
| `architecture.svg` / `architecture.png` | 1600×900 | Architecture visual for the repository, submission description, and final demo-video explanation |
| `youtube-thumbnail.svg` / `youtube-thumbnail.png` | 1280×720 | YouTube demo thumbnail |
| `screenshots/01-initial-blocked.png` | 1600×900 | Real fixture-mode initial state with the unresolved correction and blocked gate |
| `screenshots/02-repair-proposed.png` | 1600×900 | Real fixture-mode proposal state with bounded evidence and review gate |
| `screenshots/03-release-verified.png` | 1600×900 | Real fixture-mode verified state with six checks and proof hash |
| `screenshots/04-mobile-initial.png` | 390×844 | Responsive and independent-session QA evidence |

## Content contract

- The palette is derived from the implemented LessonProof UI: ink `#1d211b`,
  paper `#fbfaf6`, orange `#d15f35`, blue `#305f8c`, and green `#1d6b49`.
- The architecture asset reflects implemented boundaries: per-browser isolated
  sessions, same-origin mutations, a read-only planner, explicit reviewer
  approval, all six deterministic checks, a proof hash, and guarded undo.
- GPT-5.6 is shown as the optional live planner capability. The assets do not
  state or imply that a live API smoke test has passed.
- The deterministic fixture follows the same validation and approval path and
  is identified as the judge-safe mode.
- The formula example is synthetic: `sin⁻¹(x) = 1/sin(x)` is corrected to
  `sin⁻¹(x) = arcsin(x)`.
- The cover, architecture, and thumbnail pairs are explanatory compositions,
  not screenshots. They do not fabricate
  product screens, metrics, endorsements, prizes, or verification results.
- Files under `screenshots/` are real captures of the local production build.
  They show `Deterministic fixture` in the header or inline proposal provenance;
  they prove the interface and complete state machine, not a provider call.

## Export to PNG on macOS

Keep the SVG files as the canonical sources. The checked-in PNG files are the
approved submission exports. To reproduce them on macOS, use headless Chrome:

```bash
cd submission/assets
assets_dir="$(pwd)"

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1600,900 \
  --screenshot=cover.png "file://${assets_dir}/cover.svg"

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
xmllint --noout cover.svg architecture.svg youtube-thumbnail.svg
```

Before submission or upload:

1. visually inspect the exact exported files at 100% scale;
2. keep important thumbnail text inside the existing safe margins;
3. do not add third-party logos or unverified claims;
4. use only screenshots captured separately from the real running application;
5. retain this README as the provenance and export note for the asset pack.

Created for the LessonProof 2026 competition submission. No organizer logo or
visual identity is used.
