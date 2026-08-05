# Veza LMS UI and UX audit

Status: implemented on `agent/design-system-ux`

Date: 5 August 2026

## 1. Audit objective

This audit evaluates the application as one product system rather than a collection of isolated pages. The review covers information hierarchy, task order, route safety, page composition, component styling, colour ownership, density, responsive behaviour, evidence language and accessibility.

The governing direction is complex minimalism with selective bento composition:

- one dominant task or decision per screen
- bento panels only where a region owns an independent state or workflow
- tables, registers and timelines for dense or chronological records
- neutral page structure created by spacing, rules and typography
- teal reserved for primary action, selection, progress and active learning state
- semantic colours reserved for information, warning, critical and success states
- transient elevation only for dialogs, drawers, popovers, menus and toasts

## 2. Sources reviewed

The implementation was assessed against:

- `docs/design/ui-principles.md`
- `docs/design-system/README.md`
- `docs/design-system/content-and-layout-guidelines.md`
- `docs/design-system/keyboard-and-semantics.md`
- architecture documents for tenant access, institution structure, roles, boundaries and time
- shared UI tokens and component contracts in `packages/ui`
- page, feature and stylesheet structure in `apps/web`
- repository reference assets: `Brand CI.png`, `overview.png`, `courses.png`, `my-learning.png`, `assessments.png`, `analytics.png` and `calender.png`

### Reference image verification boundary

The reference image files were inventoried and their repository identities were confirmed. The current execution environment could not decode private repository binary assets through the GitHub connector, and GitHub Actions artifact export was blocked by the repository account billing lock. The implementation therefore uses the documented design direction, the existing reference-driven component structure and the architecture as the enforceable source of truth.

Final visual signoff against the image pixels must be repeated in a normal repository checkout. This limitation does not affect the structural, responsive, route, token or source-level QA completed here.

## 3. Critical defects found and resolved

### 3.1 Broken stylesheet graph

`apps/web/app/globals.css` referenced multiple stylesheet names that did not exist and omitted most of the actual feature styles. Several routes could therefore render with incomplete styling or browser defaults.

Resolution:

- rebuilt the complete stylesheet import graph
- added shared reset and application token aliases
- loaded every active workspace style domain explicitly
- added an automated contract that fails when a local stylesheet import does not resolve

### 3.2 Uncontrolled colour drift

The shell and feature surfaces used purple gradients, multiple unrelated accents and hard-coded presentation colours. This weakened brand recognition and made semantic states ambiguous.

Resolution:

- made teal `#0D9488` the single primary brand and learning action colour
- made teal strong `#0F766E` the primary action and active-navigation colour
- retained blue only for semantic information
- retained dedicated warning, critical and success colours
- mapped legacy learning and violet variables to the primary brand token to stop further drift
- removed approved-surface dependence on purple presentation colours
- added prohibited-colour contracts for audited surfaces

### 3.3 Generic shell hierarchy

The earlier shell used a purple gradient mark, a visually dominant top bar and desktop-only controls that disappeared at mobile widths.

Resolution:

- introduced a restrained dark ink sidebar with a flat teal mark
- reduced shell contrast so the task canvas remains dominant
- preserved institution context, permission-aware search, notifications and contextual actions
- added a complete mobile navigation panel with account and sign-out access
- retained compact search and primary action access on mobile
- used explicit current-page semantics

### 3.4 Learner dashboard lacked decision priority

The dashboard gave similar visual weight to continuation, schedule, metrics and deadlines. Some metrics lacked calculation context. Decorative colour treatments risked becoming a rainbow course grid.

Resolution:

- made course continuation the dominant surface
- placed the nearest deadline immediately after the dominant task in mobile order
- retained schedule and progress as supporting decisions
- added definitions and freshness language to progress and activity metrics
- replaced decorative course palettes with ink, teal and one dark teal variant
- removed sparkle iconography
- replaced dead or forbidden links with valid task destinations

### 3.5 Role and route collisions

Navigation exposed routes whose implemented pages rejected the same role. Examples included learner access to the staff assessment workspace and learner or guardian access to staff analytics.

Resolution:

- made `/learning` role-aware
- routed learners to the authoritative learner Today workspace
- retained curriculum governance for authorised staff
- made `/insights` role-aware
- added an authoritative learner progress workspace
- rendered a privacy-preserving guardian state when no authorised relationship is available
- routed the assessment navigation key to `/assessments`
- removed the unsupported learner top-level assessment index until a real cross-course index exists
- corrected the assessment active-navigation key

### 3.6 Over-carded operational workspaces

People, person records, terminology, catalogue governance, storage, administration and evidence surfaces used too many disconnected cards. This increased visual noise and wasted page width.

Resolution:

- converted summary cards into connected metric strips
- converted record collections into tables or ruled lists
- used seamless page regions for continuous tasks
- retained bordered panels only for independent state, governance or inspector boundaries
- expanded content width to the shared `100rem` maximum
- made filter bars reflow into purposeful rows
- removed panel shadows
- kept inspectors sticky only while sufficient horizontal space remains

### 3.7 Weak fallback and empty states

Catch-all role routes and invitation forms relied on style rules that were lost when the shell changed. This risked unstyled or decorative empty cards.

Resolution:

- added a governed workspace-state layer
- made empty states full-width decision surfaces with evidence language
- preserved tenant, role and privacy boundaries in the copy
- gave forms a context column and action column on desktop
- stacked context before action on mobile

### 3.8 Authentication did not match the product system

Authentication used a separate purple and glow-heavy visual language and floating workspace option cards.

Resolution:

- introduced the same ink, teal, rules and typography used by the application
- separated brand context and action form without decorative blur
- converted workspace choices into a clear ruled list
- simplified the mobile path to one focused column
- preserved visible focus, error and pending-access states

## 4. Screen-family QA matrix

| Screen family | Desktop composition | Tablet and mobile composition | QA outcome |
| --- | --- | --- | --- |
| Product shell | Quiet 15.5rem navigation, compact top bar, full-width task canvas | Compact rail at intermediate widths, complete mobile menu below 900px | Corrected |
| Authentication | Editorial ink context panel plus focused form panel | Brand panel removed, one focused form column | Corrected |
| Workspace selection | One contained decision surface with ruled options | Full-width choices with preserved labels and touch targets | Corrected |
| Learner overview | Dominant continue panel, supporting schedule, progress and deadline | Explicit order: continue, deadline, schedule, progress | Corrected |
| Learner learning | Authoritative Today workspace for learners, curriculum governance for staff | Rails and governance controls stack below the task | Corrected |
| Course room | Module rail, learning canvas and context inspector | One-column task flow, context follows learning content | Preserved and hardened |
| Learner progress | Metric strip plus seamless course register | Metrics stack and course values move below course identity | Added |
| Staff assessment | Assessment task canvas, governance controls and gradebook directory | Governance and secondary records stack below main task | Route corrected and hardened |
| Institutional analytics | Existing analytics workspace within shared full-width grammar | Secondary panels and wide records reflow or scroll | Hardened |
| Calendar and role states | Catch-all workspace state with clear role context | Full-width decision state, no centred decorative card | Restored |
| Communications | Summary strip, filters and record surface | Filters reflow, records retain comparison and scroll | Hardened |
| People directory | Metric strip, full-width filters, data table and import workflow | Two-column filters then one-column controls, table scroll retained | Hardened |
| Person record | Primary record canvas plus supporting relationship context | Supporting context moves below the record | Hardened |
| Person administration | Structured evidence grid and expandable actions | Two columns at tablet, one column on mobile | Rebuilt |
| Terminology | Resolved terms, hierarchy and version records | Continuous task sections stack without duplicate cards | Hardened |
| Catalogue governance | Main catalogue canvas with bounded action rail | Action rail becomes non-sticky and moves below task | Hardened |
| Storage administration | Configuration, asset register, inspector and governance surfaces | Three columns become two, then one | Hardened |
| Evidence room | Filters, evidence stream and record context | Filters stack and evidence chronology remains primary | Hardened |
| Institution administration | Section navigation plus operational workspaces | Navigation remains accessible without compressing forms | Hardened |
| Empty and pending states | Wide decision surface with evidence boundary | Content width and action order preserved | Rebuilt |

## 5. Layout rules now enforced

### 5.1 Real estate

- application content may use up to `100rem`
- readable text regions remain constrained inside the wider canvas
- dense records use available width instead of being placed in narrow centred cards
- context rails use stable widths and disappear as columns before content becomes cramped

### 5.2 Task hierarchy

- each page has one visually dominant task or decision
- primary actions are teal or dark ink, never one colour per feature
- supporting actions are secondary, quiet or inline
- mobile order follows urgency and task sequence rather than desktop coordinates

### 5.3 Card rationale

Use a card or bounded panel when:

- the region has an independent state
- the region contains an isolated workflow
- the region is an inspector or governance boundary
- the region is a metric group that must be scanned as one unit

Use a seamless region when:

- sections belong to one continuous form or decision
- records are best compared in a table or ruled register
- headings and rules can establish sufficient hierarchy
- an extra container would only duplicate the page boundary

### 5.4 Responsive thresholds

- below 1180px: desktop navigation compacts and wide three-column workspaces begin reducing secondary regions
- below 1040px: inspectors and governance rails move below the dominant task
- below 900px: the desktop sidebar becomes a complete mobile navigation panel
- below 760px: metric strips and content grids reduce to one or two columns according to comparison needs
- below 640px: learner bento surfaces follow explicit urgency order and course rails become single-column task flows

## 6. Component styling decisions

### Buttons

- primary: teal strong
- secondary: white surface with strong neutral border
- quiet: transparent, used only for low-priority actions
- danger: critical red and explicit destructive wording
- disabled: reduced opacity with unchanged semantic label

### Inputs and selectors

- persistent labels
- neutral surface and strong neutral border
- teal focus border and accessible focus ring
- error state uses critical colour and linked explanatory text

### Navigation

- dark ink stable shell
- teal active marker and icon
- no gradient, glow or sparkle decoration
- mobile navigation includes account and sign-out controls

### Data and records

- tables for comparison
- ruled lists for sequential or single-object records
- timelines for history
- metric strips for small related summaries
- horizontal scrolling retained where column comparison is essential

### Elevation

- no panel shadow
- overlay shadow only for command search, dialogs, drawers, popovers, menus and toasts
- no backdrop blur in audited application surfaces

## 7. Accessibility review

The implementation preserves or introduces:

- visible `:focus-visible` treatment
- explicit current-page semantics
- persistent field labels
- status text alongside semantic colour
- mobile touch targets around 2.5rem to 2.8rem minimum for compact controls
- keyboard command search
- reduced-motion token support
- privacy-safe unavailable states
- metric calculation and freshness explanations
- task order that remains logical when layouts collapse

A full automated accessibility browser run still requires a normal project checkout and running application.

## 8. Automated QA contracts

`apps/web/tests/ui-ux-contracts.test.mjs` now verifies:

1. every imported local stylesheet exists
2. all required workspace style domains are loaded
3. teal owns the shared action system
4. panel elevation remains disabled
5. sparkle glyphs are absent from audited surfaces
6. backdrop blur is absent from audited surfaces
7. prohibited purple presentation colours are absent
8. placeholder links are absent
9. em dash characters are absent from audited surfaces
10. learner learning and insights routes are role-aware
11. the assessment route and active-navigation key agree
12. learners are not exposed to the staff assessment index
13. dashboard metrics include evidence language
14. mobile dashboard order is explicit
15. catalogue actions become non-sticky before the layout becomes cramped

## 9. Validation completed

Completed in this audit:

- six UI and UX contract tests passed
- ten changed TypeScript and TSX files passed syntax transpilation
- changed CSS files passed structural brace checks
- audited sources passed sparkle, blur, purple and em dash scans
- route definitions were checked against implemented explicit and catch-all pages
- stylesheet imports were checked against repository paths

## 10. Release gates outside this environment

Before merging to `main`, run the following in a normal checkout:

```bash
pnpm install --frozen-lockfile
pnpm --filter @veza/web typecheck
pnpm --filter @veza/web test
pnpm --filter @veza/web build
pnpm --filter @veza/ui test
pnpm --filter @veza/ui test:a11y
pnpm --filter @veza/ui test:visual
```

Perform screenshot comparison at minimum at:

- 1440 by 1024 desktop
- 1024 by 768 tablet
- 390 by 844 mobile

Compare the relevant routes directly with the repository reference PNGs after binary assets are available in the checkout. Any visual-baseline update must explain the hierarchy or accessibility reason for the change.

## 11. Final assessment

The application now follows one coherent product language. The shell is quiet, the task canvas is dominant, bento panels are selective, records use the correct structures, colour has one global owner, role routes are safe, and mobile order reflects user intent. The largest systemic faults found during the audit were corrected rather than hidden with local page polish.
