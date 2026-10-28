# DESIGN.md — Euros Ponto & Vale Alimentação (V4)

## 1. Visual Direction & Mode
- **Surface Mode**: `Operate` (High-density HR/DP operational matrix, legal CLT calendar, REP time-clock telemetry, and financial VA calculation).
- **Core Aesthetic**:
  - **Dark Mode (`:root`)**: *Obsidian & Electric Indigo* — preserved 100% intact (`#0F0F11` base, `#282433` cards, `#4015B8` primary indigo, `#00E5FF` neon cyan).
  - **Light Mode (`[data-theme="light"]`)**: *Architectural Steel Slate & Deep Indigo* — engineered for zero eye strain during full-day HR operations under office lighting, replacing the legacy saturated cyan background (`#AEE3F5`) with a calm, high-contrast neutral slate hierarchy (`#F4F6F9` canvas, `#FFFFFF` cards, `#EEF1F6` recessed wells, `#0F172A` ink, `#4015B8` brand indigo).

## 2. Token Mapping (Dark → Light)

| Semantic Token | Dark Mode (`:root`) | Light Mode (`[data-theme="light"]`) | Role & Contrast Notes |
| :--- | :--- | :--- | :--- |
| `--color-bg-base` | `#0F0F11` | `#F4F6F9` | Root page background (Cool Alabaster Slate) |
| `--color-bg-dark` | `#15131B` | `#EEF1F6` | Secondary wells, toolbars, modal footers |
| `--color-bg-panel` | `#1B1824` | `#E2E8F0` | Segmented nav tracks, subtle dividers |
| `--color-bg-card` | `#282433` | `#FFFFFF` | Pure crisp white cards, modals, sticky columns |
| `--color-bg-surface` | `#2F2D33` | `#F8FAFC` | Inputs, table sub-surfaces, hover states |
| `--color-border` | `#342A52` | `#CBD5E1` | 1px structural hairline |
| `--color-border-bright` | `#422985` | `#94A3B8` | Active/sticky structural borders |
| `--color-primary` | `#4015B8` | `#4015B8` | Brand Electric Indigo (8.4:1 on white) |
| `--color-primary-hover` | `#4E1CDB` | `#331094` | Deep Indigo hover state |
| `--color-cyan` | `#00E5FF` | `#1D4ED8` | Royal Cobalt accent for text/badges (6.7:1 on white) |
| `--color-blue-bright` | `#38BDF8` | `#0369A1` | Deep Ocean accent (5.9:1 on white) |
| `--color-blue-soft` | `#ADD8E6` | `#475569` | Secondary labels & icons (7.5:1 on white) |
| `--color-text-main` | `#F3F4F6` | `#0F172A` | Primary body & data ink (16.8:1 on white) |
| `--color-text-sub` | `#B8B2C7` | `#334155` | Secondary copy (9.8:1 on white) |
| `--color-text-muted` | `#7E7790` | `#64748B` | Muted metadata & hints (4.76:1 on white, WCAG AA) |

## 3. Semantic Status System (Light Mode)
- **OK (`status-ok`)**: Background `#ECFDF5`, Border `#6EE7B7`, Text `#065F46` (8.2:1).
- **Falta Integral (`status-falta`)**: Background `#FEE2E2`, Border `#EF4444`, Text `#991B1B` (8.1:1).
- **Meio Período (`status-half`)**: Background `#FFE4E6`, Border `#F43F5E` (dashed), Text `#9F1239` (7.8:1).
- **Atraso / Batida (`status-atraso`)**: Background `#FEF3C7`, Border `#F59E0B`, Text `#92400E` (7.4:1).
- **Atestado (`status-atestado`)**: Background `#F3E8FF`, Border `#C084FC`, Text `#581C87` (8.9:1).
- **Férias (`status-ferias`)**: Background `#F0F9FF`, Border `#7DD3FC`, Text `#0C4A6E` (8.6:1).
- **Feriado (`status-feriado`)**: Background `#EEF2FF`, Border `#818CF8`, Text `#312E81` (9.5:1).
- **Domingo / Sábado (`status-domingo`)**: Background `#E2E8F0`, Border `#CBD5E1`, Text `#334155` (7.8:1).

## 4. Accessibility & Craft Floor Guardrails
- `color-scheme: light` applied to `html[data-theme="light"]` so native date/time pickers, scrollbars, and dropdowns render in native light mode.
- Visible `:focus-visible` rings (`2px solid #4015B8` with `2px` offset) across all interactive controls.
- `font-variant-numeric: tabular-nums` enforced on matrix cells, KPI values, times, and currency columns.
- Zero zero-offset neon halos in light mode; all shadows use directional Y-offset + soft blur (`0 1px 3px rgba(15, 23, 42, 0.06)`).
