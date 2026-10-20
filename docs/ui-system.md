# FinBank UI System: extracted from the "FinBank QMS v3" bundle (80dd6a…cf0.html)
The source is a bundled single-file prototype of the FinBank **Queue Management System**. Its screens are:
- a customer kiosk (trilingual welcome, language choice)
- a hall display (Now serving / Up next / Forex ticker / PesaFlash promo slot)
- a Counter Operator Console (Call next, Recall, Transfer, No-show, Undo, Manual token, Pause, Lock)
- a PIN lock screen
- a dev toolbar that switches Direction A "Tiles" / B "Split" and simulates "Offline" / "Printer error"

It is built for fixed 1920×1080 / 1280×720 canvases with inline styles. There are no CSS variables, so the tokens below were inferred from how often each value is used.

> NOTE: This palette (**navy #0B2D63 + orange #F5821F**) differs from the earlier prototype's purple #312783 / yellow #FDC808. We need to confirm with the user which one is the official FinBank identity.

## Colour tokens (number of times used)
| Token | Hex | Use |
|---|---|---|
| brand.primary | #0B2D63 (110) | Navy: headings, primary buttons, top bars, links |
| brand.primary-hover | #08214A | Hover on primary |
| brand.accent | #F5821F (46) | Orange: status dots, icons on primary, ticker label, focus ring |
| accent.dark text | #B85A00 / #8A4300 / #7A3E00 | Link hover, warning text |
| accent.soft bg | #FFF1E4 / #FFF4E5, border #F5C58A | Warning/attention surfaces |
| text.primary | #101828 (66) | Body text; also the dark "Lock" button |
| text.secondary | #4B5565 (66) | Secondary text |
| text.muted | #9AA4B2 | Tertiary text |
| border | #E1E6EF, #D5DCE8, #C9D5EA, #C3CAD5, #EEF1F5 (row dividers) | |
| surface | #FFFFFF; page #F4F6FA / #E4E8EF; tint #E8EEF8 | |
| info.mid | #3A5689 | |
| success | text #146C43 / bg #E6F4EC | |
| danger | text #B42318 / #8A1C12, bg #FDECEC, border #F3C7C7 | No-show, errors |
| dark chrome | #1F2A3D | Dev toolbar, segmented control |

## Typography
- **Figtree** (self-hosted woff2, weights 400/500/600/700/800), falling back to system-ui.
- Display headings: 52–76px, weight 800, letter-spacing −0.02 to −0.03em, line-height 1.05.
- Section titles: 26–36px / 800. Body: 18–24px / 400–600. Chips: 12–13px / 700.
- Clocks and numbers use `font-variant-numeric: tabular-nums`.
- Kiosk and display sizes are large (18–28px is typical). For a staff web/tablet app, scale down to about 14–16px body, 20–28px headings.

## Shape, spacing, elevation
- Border radius scale: 6 (chips), 8 (small buttons/tags), 12 (toolbar buttons, 58px tall), 20 (large action buttons/cards, the most used), 28 (panels/modals).
- Spacing is mostly multiples of 4 and 8 (gaps 2, 8, 14, 16, 20, 28, 64; padding 18–24 inside cards, 48–64 at page level).
- Shadow: `0 24px 60px rgba(11,45,99,0.08)` (soft, navy-tinted) on modals.
- Focus ring: `outline: 4px solid #F5821F` (accessible and strong). `prefers-reduced-motion` is respected.

## Components seen
- **Primary action tile:** navy background, white 32px/800 label, orange icon, light sub-label (#C9D5EA), radius 20, 108px tall, in a grid of 2fr 1fr 1fr 1fr.
- **Secondary button:** white with a 2px #D5DCE8 border and navy text.
- **Destructive outline button:** white, #F3C7C7 border, #B42318 text.
- **Accent button:** orange background, dark text (for example "Undo no-show").
- **Toolbar button:** 58px tall, radius 12, plus a dark "Lock" button with a padlock icon.
- **Segmented control:** dark track, radius 8, padding 3.
- **Status header:** orange 14px dot + bold label ("En service · Now serving").
- **Cards/panels:** white, 1px #E1E6EF border, radius 20–28.
- **Lock modal:** 620px, an 88px circular icon badge on the soft-orange background, a 4-digit PIN.
- **Banners:** offline/kiosk warning banner (triangle icon) and printer-error state.
- **Ticker:** navy bar with an orange label block and a scrolling marquee (forex rates).
- **Image slot** placeholders for promos. Lists show empty states ("No one is waiting").
- **Icons:** inline SVG, stroke 2.2, round caps (Lucide-like).

## Patterns worth reusing in the account-opening app
- Copy is bilingual or trilingual and shown side by side (FR · EN · Kirundi "Murakaza neza"). FR is shown first.
- Operator console layout: a top bar (branch, operator, voice/lock), KPI strip (Completed today / Waiting / Longest wait), main work card, queue list on the side.
- Terminal **auto-lock with PIN**, which suits shared branch and field tablets.
- **Offline** and **device error** states are designed explicitly.
- Large touch targets (58–108px), suitable for tablets.
- Two layout directions (Tiles vs Split). This suggests a choice between a tile dashboard and a list-detail split. Split fits a review queue.
