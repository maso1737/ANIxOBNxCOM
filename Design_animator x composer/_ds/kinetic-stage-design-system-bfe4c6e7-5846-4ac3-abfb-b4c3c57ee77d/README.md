# KINETIC STAGE — Design System

> **12 Principles of Animation · touch-&-learn browser app series**
> A shared visual language for a family of single-file browser apps, each one teaching a single principle of animation by letting you *touch and reproduce* it — not just read about it.

---

## 1. What this is

**KINETIC STAGE** is the common design system behind a planned series of **12 small browser apps**, one per classic Disney animation principle (Squash & Stretch, Anticipation, Staging, Pose-to-Pose, Follow-Through, Slow In/Slow Out, Arcs, Secondary Action, Timing, Exaggeration, Solid Drawing, Appeal).

Each app is a **single-file HTML toy**: a dark "stage" you can scrub, edit, and replay, plus a side panel that explains the principle and lets you apply it. The system gives every app the same world so they read as one coherent series sitting side-by-side.

### Product philosophy (from the brief)

> 気づかせる → 体感的理解 → 再現可能な理解
> **Make them notice → experiential understanding → reproducible understanding**
>
> 目指す状態：「見れば分かる」ではなく **「触れば再現できる」**
> Target state: not *"I get it by looking"* but ***"I can reproduce it by touching."***

The whole system is built around **interactive, hands-on learning**. The stage is the protagonist; explanation is secondary and lives off to the side. Motion is used *didactically* — every animation in the system demonstrates a principle, never just decorates.

### Audience & tone

Bilingual **Japanese + English**, aimed at people learning to animate (students, hobbyist VTuber/idol-scene creators, UI motion designers). The mood is **stage-lit, idol/VTuber glamour** — hot pink and spotlight cyan over midnight plum, like a darkened concert hall with the spots up.

---

## 2. Sources

This design system was reconstructed from a provided codebase. No Figma, no production app repo, no slide decks were attached.

| Source | Path | Notes |
|---|---|---|
| Design-system definition page | `design-system/design-system.html` → copied to `reference/original-design-system.html` | The canonical spec: palette, type, chrome diagram, components, banner library, usage rules. Bilingual. |
| Component & layout stylesheet | `design-system/stage-system.css` → copied to `stage-system.css` (root) | The real, importable CSS: tokens, `#app` grid, all component classes, shortcut modal, banner animation library. |

Both were accessed read-only via the mounted `design-system/` folder. The reader of this README is **not** assumed to have access; everything needed has been copied into this project.

**Fonts:** all five families are Google Fonts (no binary font files existed to copy) — see Visual Foundations.
**Images / logos:** none existed in the source. The system is **100% CSS-rendered** (gradients, glows, unicode glyphs). There are no raster assets, SVG logos, or illustration files — and per the system's own rules, none should be invented. See Iconography.

---

## 3. CONTENT FUNDAMENTALS

How copy is written across the system.

### Voice
- **Bilingual, EN-leads-JP.** A label is set in English (often a single wide-tracked word) with a Japanese gloss beneath. EN carries the *system* vocabulary; JP carries the *teaching* and emotional nuance.
  - EN label: `ANTICIPATION` · JP gloss: `予備動作で予感させる`
  - EN quote (ornament): *"Pose, then time."* · JP: `先に魅力的なポーズ、次にタイミング。`
- **Imperative & instructional**, addressed to the learner doing the thing: "押す前に膨らんで → 凹む" (swell before you press → then sink), "膝を曲げてから跳ぶ" (bend the knees, then jump). It tells you the *motion recipe*, not abstract theory.
- **Terse and technical in EN UI.** UI strings are short, uppercase, wide-tracked, mono: `EDIT MODE`, `+ KEY`, `APPLY サンプル`, `FRAME 04 / 18`, `EASING · LINEAR`. They read like a production tool / DAW, not a consumer app.

### Casing & punctuation
- **EN UI / labels:** ALL CAPS with wide letter-spacing (`0.2–0.4em`). `EDIT MODE`, `INDEX`, `STATUS // META`.
- **EN ornament (quotes, titles):** Title or sentence case, italic serif. *"Pose, then time."*
- **JP:** normal casing; serif (Noto Serif JP) for quotes/samples, sans (Noto Sans JP) for captions. Often wide-tracked (`letter-spacing:0.12–0.22em`) to match the EN rhythm.
- Slashes and bullets as structural glue: `KINETIC_GEOMETRY // LEC_NN`, `A · DEMO / FPS`.
- Numbers are zero-padded and framed as data: `NN / NN`, `04 / 18`, `2 OF 12`.

### Person
- **"You," implicitly** — instructions are imperative ("touch it", "bend then jump"). No first-person "we". The app is a tool you operate; it never speaks as a brand persona.

### Emoji
- **No emoji.** The system explicitly forbids them ("絵文字・素のグラデ全面は使わない" — *don't use emoji or full-bleed flat gradients*). "Icons" are unicode **symbol glyphs** only (✦ ✓ ▶ ⏸ ↶ ⌘ ⌨ ▸ ✕ ✏), never pictographic emoji.

### Vibe, in one line
**A backstage production console for animation principles** — terse, lit, glamorous, hands-on. Concert-hall dark with idol-pink spots. Every word earns its tracking.

---

## 4. VISUAL FOUNDATIONS

### Color
- **Dark, always.** There is no light mode. The base is **midnight plum**, layered from `--bg-1 #0c061d` (ceiling) down to `--bg-0 #07030f` (floor), with stage surfaces at `--panel-2 #100728` and recessed cells at `--cell #0d0620`.
- **Three-spotlight accent system:**
  - **Rouge `#FF4FA8`** — PRIMARY, the star. Active states, primary buttons, the protagonist of any composition.
  - **Ice `#5AE9FF`** — SECONDARY, emphasis & "live" data values (gets a cyan text-glow).
  - **Gold `#FFD27A`** — TERTIARY, labels / eyebrows / principle numerals / borders.
  - Support: **Lavender `#B58EFF`** (muted UI text, JP captions) and **Magenta `#B850FF`** (rouge's gradient partner).
- **Signature gradient — "spotlight sweep":** `linear-gradient(120deg,#FFE9B0,#FFD27A 26%,#FF4FA8 62%,#B58EFF 100%)`. Used on the masthead, principle numerals, and `active` button states. On text it is always `background-clip:text` (gradient *fill*, transparent text).
- Rule of thumb: **gold = labels, pink = the subject, cyan = emphasis.** Max 1–2 dark base tones per screen plus spot light.

### Type
Five families, each with a fixed job:
| Family | Role | Default treatment |
|---|---|---|
| **Barlow Condensed** 900 italic | DISPLAY headlines | gradient `clip:text`, tight tracking, often UPPERCASE |
| **Cormorant Garamond** 700 italic | ORNAMENT — numerals, EN quotes | gold or gradient, italic serif |
| **IBM Plex Mono** 400–600 | UI / labels / data / code | wide tracking `0.15–0.4em`, often UPPERCASE |
| **Noto Serif JP** 400–800 | JP quotes & sample sentences | warm white, tracked |
| **Noto Sans JP** 400–700 | JP body & captions | grey/lavender, wide tracked |
- Min UI text **10px**; min label **~9px**; **stage content goes large**. Display is `clamp(52px,9vw,116px)`.

### Background & texture
- **Layered radial "stage glows"** baked into the page background: a magenta wash top-right, cyan bottom-left, pink bottom-center, over a vertical plum gradient. `background-attachment:fixed` so it sits still as a lit room.
- **Starfield sparkle overlay** (`body::after`): five tiny tiled radial dots in white/gold/lavender/cyan/pink at `mix-blend-mode:screen, opacity:0.9` — a faint glitter, like dust in the spotlight. Decorative, optional.
- **Stage grid:** inside the main stage, a faint 40px lavender grid (`rgba(181,142,255,0.04)`) — graph-paper for the "drawing view".
- **Giant ghost numeral:** an enormous italic serif principle-number, stroked outline only (`-webkit-text-stroke`, no fill), bleeding off the bottom-left of the stage. The single biggest decorative motif.
- **No photography, no illustration, no full-bleed flat gradients.** All atmosphere is glow + sparkle + grid.

### Animation (this is the whole point)
- **Motion is didactic.** Every animation demonstrates a principle. The **banner animation library** (`.ba-*`) is a set of pure-CSS loops — a button that swells-then-presses, doors that pull-before-opening, a jumper that crouches-before-leaping, a delete that bloats-then-poofs.
- **Easing:** loops use **`ease-in-out`** as the default; "hold the hero" moments use **`steps()`** to *stop* on a key pose (camera, bullets). The base beat is **anticipation → action → settle** (3 beats).
- **Exaggeration is restrained:** scale overshoots stay in the **×1.1–1.3** range. No rubber-band excess.
- **Decorative infinite loops are quarantined** to banner toys; the actual editing/drawing view stays still so you can focus on operating it.
- Respect `prefers-reduced-motion: reduce` — all banner animations and the edit-toggle shimmer are disabled.

### Interaction states
- **Hover:** lighten the fill (raise the gradient's alpha) **and add a soft glow** of the element's accent. e.g. buttons go from `rgba(255,79,168,0.06)` fill to `0.16` plus `0 0 8px` rouge glow. The primary edit-toggle adds a diagonal **sheen sweep** that translates across on hover.
- **Active / selected:** swap to the **solid gradient** (`--grad-btn` rouge→magenta), drop the border (`border-color:transparent`), text goes to ink or white, and a **stronger glow** turns on (`0 0 14–24px` rouge). This is the single most consistent state pattern in the system — "selected things light up."
- **Press:** the system's *demonstrative* press (the banner button) **swells then sinks** (scale 1.16 → 0.82) — anticipation made literal. UI buttons themselves don't shrink; they just brighten.
- **Checked / done:** checkbox fills with the gold→rouge gradient, shows a `✓`, and the label strikes through in gold. Completing a checklist flips the progress counter to **ice with a cyan glow**.

### Borders, radii, shadows
- **Borders are thin, low-alpha, accent-tinted** — almost always `rgba(255,210,122,0.12–0.35)` (gold) or `rgba(181,142,255,0.08–0.3)` (lavender), 1px. Dashed lavender for internal dividers.
- **Radii are small:** chips/cells `2px`, buttons/keys `3px`, cards/panels `5px`, modal `6px`, capsule toys `~11px`. Nothing is very round. (`--r-xs/sm/md/lg/pill`.)
- **Shadows are glows, not drop-shadows.** Elevation reads as colored **outer glow** (`box-shadow:0 0 14px rgba(255,79,168,…)`) and the occasional `inset 0 1px 0 rgba(255,255,255,0.3)` top-highlight. The only true drop-shadow is on the shortcut modal (`0 20px 60px` black + magenta bloom).
- **Cards:** a faint top-down rouge→magenta tint fill (`linear-gradient(180deg,rgba(255,79,168,0.05),rgba(184,80,255,0.02))`), 1px gold-tinted border, 5px radius, `overflow:hidden`. No heavy shadow — they sit *in* the lit room rather than floating above it.

### Layout
- **The app shell is a fixed CSS grid:** `grid-template-rows:44px 1fr 44px` × `grid-template-columns:1fr 300px`.
  - `#topbar` (44px, full width) — lecture id / principle title / `[ESC] INDEX`.
  - `#main` — the **STAGE** (protagonist). Holds the interactive drawing view, principle-number badge, ghost numeral, corner ticks, and a floating `#playbar`.
  - `#side` (300px) — scrolling panel of stacked sections (`.sp`): DEMO/FPS, DEBUG, APPLY samples, EDIT MODE.
  - `#bottombar` (44px) — status / frame counter / `⌨ SHORTCUTS`.
- **Corner ticks** (`.corner`) — tiny L-shaped gold→rouge gradient brackets in each stage corner, like a viewfinder / film gate.
- `overflow:hidden` on body — these are app screens, not scrolling documents. Only the side panel scrolls (with a 2px rouge scrollbar).

### Transparency & blur
- Used sparingly. The floating playbar uses `backdrop-filter:blur(4px)` so it reads over the moving stage. Most "transparency" is just **low-alpha accent fills** layered over the dark base, not glass.

---

## 5. ICONOGRAPHY

**There is no icon font, SVG set, or raster icon library in this system — and per its own rules, none should be added.** Iconography is intentionally minimal and built from **unicode symbol glyphs** set in the UI mono/serif faces.

- **Transport / playbar:** `▶` play · `⏸` pause · `|◀` `▶|` step · rendered in `.pb` keys.
- **Actions:** `↶` undo · `+` add (e.g. `+ KEY`) · `✕` exit/close · `✏` edit.
- **Ornament marks:** `✦` (four-point sparkle — the quote-box flourish, top-right of `.db`) · `▸` (list bullet, rouge) · `✓` (checkmark, in filled checkboxes).
- **Key-cap / shortcut glyphs:** `⌘` `⇧` `⌨` `Space`, `H`, `E`, `Z` — set in `.sc-key` / `.sc-key` caps.
- **No emoji. No pictographic icons. No logos.** The "brand mark" is typographic: the gradient **KINETIC / STAGE** display lockup plus the giant ghost principle-numeral. If a future app needs an icon, the system's guidance is to **reach for a unicode symbol glyph or a tiny CSS shape**, matching the existing stroke-light, monochrome-accent style — not to import an icon pack or draw illustrative SVGs.

If you later receive real brand marks or an icon set, drop them in `assets/` and update this section.

---

## 6. Index / manifest

Root files in this project:

| File | What it is |
|---|---|
| `README.md` | This document — context, content & visual foundations, iconography, manifest. |
| `colors_and_type.css` | Token layer: brand + semantic CSS variables and `.t-*` type presets. Import for tokens only. |
| `stage-system.css` | Full importable library: tokens, `#app` grid, every component class, shortcut modal, banner animation library. The source of truth for building an app. |
| `SKILL.md` | Agent-Skill manifest so this folder works as a downloadable Claude skill. |
| `reference/original-design-system.html` | The original provided spec page (bilingual), kept verbatim for reference. |
| `preview/` | Small HTML cards for the Design System tab (palette, type, components, banners, etc.). |
| `ui_kits/principle-app/` | UI kit: a high-fidelity, interactive recreation of a single principle app (the `#app` shell in action). See its own README. |

### UI kits
- **`ui_kits/principle-app/`** — the one product surface in this system: a single-principle "touch & learn" app. Recreates the topbar / stage / side-panel / bottombar shell, edit mode, playbar scrubbing, DEMO/DEBUG/APPLY panel sections, the shortcut modal, and the banner library — as a clickable prototype.

### Not included (intentionally)
- **Slides** — no slide template was provided, so none were built.
- **Logos / images / icon fonts** — none existed in the source; the system is CSS-only. See Iconography.
