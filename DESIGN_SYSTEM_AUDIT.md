# Operon Design Consistency Audit

## Purpose

This audit freezes new component work until Operon's authenticated application, Workforce surfaces, and document reader share one visual language. The canonical direction is minimal, warm, spacious, typography-led, iOS-inspired, and application-first with restrained editorial character.

## Canonical visual language

1. **Application first.** Functional content remains the hero. Editorial character is limited to typography, rhythm, and small moments of composition.
2. **Typography before containers.** Section hierarchy uses `T.pageTitle`, `T.sectionTitle`, `T.sectionLabel`, body roles, alignment, and spacing before background or border changes.
3. **One elevated surface per task.** A page may have one shell/card around a genuinely grouped workflow. Rows and subsections inside it should normally be borderless.
4. **Spacing scale only.** Layout spacing uses `Sp`: 8, 16, 24, 32, 40, 48, and 64px. Four and 12px are reserved for control internals.
5. **Semantic color only.** Orange is the product accent. Green means Present/success, blue means WFH/information, yellow means Leave/pending, muted gold means Holiday. Error red is reserved for destructive or failed states.
6. **Quiet borders.** Borders identify controls, true floating surfaces, tables that need a grid, and modal boundaries. They do not separate every section or row.
7. **Quiet motion.** Page fade/lift, disclosure height/fade, and 1-2px hover translation are allowed. Letter-by-letter reveals, looping decoration, parallax, bounce, glow, and large transforms are not part of the application language.
8. **Consistent density.** Primary pages use 32px section rhythm; major content transitions use 48px; editorial reader sections may use 64px. Dense data views may compress row internals but not the page shell.

## System-level findings

### Critical: surface primitives encourage nesting

`S.card`, `S.cardInner`, `S.cardRaised`, `S.glassBase`, and `S.glassRaised` all include borders and backgrounds. This makes nested cards the easiest implementation path. Introduce explicit primitives for:

- `S.section`: transparent, no border, vertical rhythm only.
- `S.group`: one quiet surface for related controls or records.
- `S.row`: transparent row with optional bottom divider.
- `S.inset`: subtle background without an additional outline.
- `S.floatingPanel`: retained only for popovers, menus, drawers, and modals.

`S.cardInner` should not be the default for list rows or subsections.

### Critical: spacing guidance is not enforced

`sharedUi.ts` declares that arbitrary pixel spacing is forbidden, but the application contains hundreds of raw padding, margin, and gap declarations. The worst concentrations are Attendance, the main page, Employee Profile, and Lifecycle. New and refactored components must import `Sp` and use the shared scale.

### Critical: two token vocabularies coexist

Older screens use `--surface`, `--border`, and `--text`; newer screens use `--op-surface`, `--op-border`, and `--op-text`. These aliases currently appear visually similar but encourage divergent implementations. Authenticated surfaces should use the `--op-*` vocabulary through `S` and `T`; legacy aliases should remain compatibility-only until removed.

### High: motion language has split

The core motion specification says fade and lift only. The Reader currently adds letter-by-letter title animation, scroll-parallax ghost text, a looping scroll indicator, staggered word reveals, and glowing progress. These feel like a separate editorial product. Reader motion should use `motionPreset.page`, `listStagger`, and restrained section reveals.

### High: typography tokens are bypassed

Home, Reader, Attendance, and Employee Profile contain one-off `fontFamily`, `fontSize`, and `fontWeight` combinations. Typography roles already exist in `T`; the audit standard is to extend semantic roles only when a genuinely new role is missing.

### High: raw colors bypass semantic status tokens

Attendance and Workforce use repeated hex values alongside `STATUS_TOKENS`. All attendance state rendering must use `STATUS_TOKENS`; destructive states use the global error token. Purple probation accents and miscellaneous notification colors should become monochrome unless they communicate a defined semantic state.

## Route and component audit

### `/` authenticated shell and dashboard — medium drift

- Strength: establishes the restrained density and straightforward application composition.
- Drift: HomePanel repeats bordered outer cards and bordered inner rows; it also bypasses `T`, `S`, and `motionPreset` despite being the reference surface.
- Action: make Home the canonical implementation by converting section wrappers to borderless sections, retaining a surface only for actionable collections, and adopting shared typography/motion tokens.

### Library, Resources, Activity, Team, Roles, Finance sections in `app/page.tsx` — high drift risk

- Twenty-four uses of shared card primitives plus extensive local spacing create inconsistent density inside one file.
- Repeated local panel patterns should become reusable Section, ListRow, EmptyState, Toolbar, and FormGroup primitives.
- Search/filter toolbars should share one compact control row and wrap consistently.

### `/login` and authentication surfaces — low/medium drift

- Strength: sparse composition and clear primary action.
- Drift: MVP access mode introduces many bordered role tiles and one-off white/cool color values.
- Action: preserve the sparse login shell; simplify role selection to a quiet list or segmented selector using product tokens.

### Sidebar and dashboard shell — low drift, canonical

- The shell spacing, restrained active-row navigation, and warm palette are closest to the intended system.
- Remove secondary borders from non-interactive status blocks and ensure all route shells inherit the same content width and page padding.

### `/workforce/calendar` and Attendance — critical drift

- Highest border count, raw spacing count, shadow count, and raw semantic-color usage.
- Calendar, organization register, holiday management, request actions, filters, and summaries compete at the same visual level.
- The monthly calendar should be the single elevated object. Summary becomes typography/chips; controls become one borderless toolbar; organization rows use dividers rather than individual cards.
- Popovers may remain floating surfaces. Calendar cells should use background/semantic marker changes, not a visible border on every cell.

### Employee Profile — critical drift

- Profile, employment, analytics, calendar, attendance history, leave, holidays, probation, manager history, and activity are stacked as equivalent modules.
- Recent metric hierarchy is directionally correct but still uses three adjacent bordered containers and a shadowed calendar.
- Action: remove the outer profile card, make profile/employment a borderless settings summary, retain one quiet analytics group, elevate only the calendar, and use one unified chronological history with disclosure subsections.

### `/workforce/lifecycle` — high drift

- Thirteen nested card usages make roster, editor, deboarding, and onboarding layers visually heavy.
- Action: use one roster surface with divider rows; expanded employee content becomes an inline section rather than another card; forms use FormGroup spacing without panel nesting.

### `/workforce/probation` — medium/high drift

- Repeated card shells and colored action treatments fragment a relatively small workflow.
- Action: one review queue surface, borderless timeline rows, shared destructive/primary actions, and status communicated through `StatusPill` rather than colored borders.

### Reader — superseded by product decision

> **Superseded.** The Reader is a deliberate exception to this audit's "quiet
> motion" rule, confirmed by product direction: uploaded documents are meant to
> read as premium editorial websites (Apple/Stripe/Linear-caliber presentation),
> not as an application surface, and should keep their own bolder motion language
> (poster-style hero, parallax, letter/word reveals, scroll-driven reveals) rather
> than being pulled back to match Attendance/Home/Employee Profile. The rest of
> this audit's findings for the Reader's *typography/token/spacing* discipline
> (reuse `T`/`S`/`Sp`, no raw hex/pixel values) still apply — only the "reduce
> motion to match the application language" recommendation below is retracted.
> Refactor-order item 5 ("Reduce Reader hero/motion and reuse application
> controls") is dropped for the same reason.

- The section layouts are spacious and editorial, which is appropriate.
- ~~The hero is too poster-like: 76vh height, 17rem ghost text, letter-level animation, parallax, grid overlay, and looping indicator exceed the application's motion and density language.~~ Intentional — see note above.
- Table of contents and reader controls should still reuse shell buttons, pills, and typography conventions where that doesn't conflict with the editorial treatment (e.g. `S.floatingPanel` for the TOC panel itself is fine; the section content underneath it is not bound by application density rules).
- ~~Action: reduce hero to a compact editorial header, remove decorative grid/parallax/looping motion, use `T.displayLg` or a reader-specific semantic role capped near application proportions, and standardize section padding to 64px.~~ Retracted.

### Notifications, errors, upload, and utility overlays — medium drift

- These appropriately use floating surfaces, but several semantic colors and internal radii are one-offs.
- Action: retain elevation because these components float; normalize their controls, status colors, and empty states to shared primitives.

## Quantitative drift snapshot

Source-level counts identify concentration, not design quality by themselves:

| Surface | Border declarations | Card primitive uses | Shadows | Raw spacing declarations | Raw hex colors |
|---|---:|---:|---:|---:|---:|
| Attendance | 33 | 8 | 4 | 61 | 18 |
| Main application page | 18 | 24 | 0 | 76 | 2 |
| Employee Profile | 17 | 7 | 2 | 43 | 6 |
| Lifecycle | 7 | 13 | 0 | 35 | 10 |
| Home | 6 | 0 | 0 | 13 | 0 |
| Probation | 2 | 4 | 0 | 18 | 3 |

## Required reusable primitives

Before another feature is added, establish:

- `PageHeader`
- `Section` and `SectionHeader`
- `SurfaceGroup`
- `ListRow` and `TimelineRow`
- `Toolbar`
- `FormField` and `FormGroup`
- `Disclosure`
- `MetricGroup`
- `EmptyState`
- `ModalShell` and `DrawerShell`
- canonical Button, IconButton, Input, Select, Tabs, Badge, and StatusPill wrappers

Each primitive must use `T`, `Sp`, `S`, `motionPreset`, and semantic status tokens. Page files should compose primitives rather than create visual systems inline.

## Refactor order

1. Correct shared surfaces, spacing, typography, and motion primitives.
2. Refactor Home and DashboardShell as the canonical reference implementation.
3. Refactor Attendance and Employee Profile around the shared primitives.
4. Refactor Lifecycle and Probation to the same density and surface rules.
5. ~~Reduce Reader hero/motion and reuse application controls.~~ Superseded — Reader keeps its editorial motion language by product decision; see "Reader — superseded by product decision" above.
6. Normalize utility overlays, auth selection, and remaining main-page sections.
7. Run an automated consistency scan that rejects arbitrary spacing, direct semantic hex colors, and nested `S.card`/`S.cardInner` patterns in new code.

## Acceptance criteria

- No card nested directly inside another card except a floating overlay above a page surface.
- Major sections are separated primarily by 32-48px whitespace and typography.
- All status colors come from semantic tokens.
- All common controls are shared primitives.
- Reader chrome (TOC panel, back/download/prev/next controls) reuses application
  primitives; Reader *section content* is exempt from application density/motion
  rules by design (see Reader note above).
- No looping decorative motion in authenticated application surfaces outside the Reader.
- Every route uses the same shell width, page padding, heading scale, and section rhythm.
- New UI cannot introduce raw visual tokens without extending the design system first.

## Design system freeze

The shared primitive layer in `src/components/ui` is the single source of truth for application UI. New route-specific buttons, cards, inputs, tabs, badges, overlays, timelines, tables, or matrix wrappers are prohibited unless the shared primitive cannot express a required behavior. Any necessary visual variation must be added as a documented primitive variant and reused from there.

Route migration replaces legacy primitives; it does not wrap them. Obsolete route helpers and styles must be deleted when their last active use is removed. A migrated route is accepted only when shared controls, empty states, surfaces, data displays, and motion presets are used wherever practical, type-check passes, and the production build succeeds.

Home is the canonical reference for page rhythm, typography, surface treatment, toolbar composition, and motion. Subsequent routes inherit those decisions. After Home and Attendance, migration pauses for a report before Employee Profile begins.
