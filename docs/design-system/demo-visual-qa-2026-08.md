# Veza LMS demo visual QA ledger

Date: 2026-08-08

This ledger is the mandatory visual review register for the demo inspection environment. Every route must be checked against the approved Veza reference language and Brand CI before it is considered visually complete.

## Reference language

- Global shell: deep navy left navigation, white compact top bar, search first, institution context second, utility actions at right, avatar last.
- Brand palette: Indigo 600 `#4F46E5`, Purple 600 `#7C3AED`, Blue 500 `#3B82F6`, Teal 500 `#14B8A6`, Slate 900 `#0F172A`, Slate 700 `#334155`, Slate 500 `#64748B`, Slate 300 `#CBD5E1`, Slate 100 `#F1F5F9` and white.
- Typography: Satoshi throughout. Large page titles are normally 28 to 32 px, section titles 18 to 22 px, operational body copy 12 to 14 px depending on density. Avoid oversized generic SaaS headings.
- Depth: restrained shadow and layering. Do not simulate hierarchy with borders around every object.
- Icons: 24 px design grid, round caps and joins, approximately 2 px stroke. Small inline controls use visually reduced 14 to 18 px rendering.
- Charts: plot directly on a meaningful surface, use minimal grid lines, no decorative chart frame inside a second arbitrary container, no rainbow series.
- Interaction: transient information belongs in popovers or dialogs when appropriate. Complex multi-step workspaces may remain dedicated pages. Do not use navigation as a substitute for a notification popover.

## System-level defects found

1. Header item positioning had drifted from the references because demo controls occupied the product top bar.
2. Notifications were implemented as navigation rather than a transient popover.
3. Many active states were flat border changes rather than the reference indigo/purple elevation treatment.
4. Operational pages inherited large bordered registers with insufficient depth differentiation.
5. Course delivery did not read as an application within the LMS shell. The lesson canvas, course outline and supporting context had equal visual weight.
6. Studio used generic columns rather than the builder hierarchy shown in the course reference.
7. Analytics presented metrics as selectable bordered boxes without an actual analytical canvas.
8. Calendar had the correct broad topology but lacked the reference's depth, hierarchy and compact control treatment.
9. Type scale was inconsistent between dense workspaces and page introductions.
10. Several buttons lacked small icon affordances and did not communicate hierarchy strongly enough.

## Route-by-route register

| Group | Route / screen | Primary benchmark | Main defect before repair | Current QA action | Status |
| --- | --- | --- | --- | --- | --- |
| Shared | Application shell | All references | Header order, flat active state, demo controls in product header | Rebuilt sidebar and top bar, moved demo controls to inspection dock, aligned search/institution/actions/avatar positions | Direct redesign complete |
| Shared | Notification bell | All references | Dedicated page navigation instead of transient notification surface | Added accessible popover, unread badge, outside/Escape close, local read state, notification-centre deep link | Direct redesign complete |
| Learner | Today | Learner reference | Flat priority register and weak course hierarchy | Rebuilt as dominant continuation surface, up-next rail and compact course cards | Direct redesign complete |
| Learner | My learning | Learner reference | Course list did not inherit sufficient depth | Shared learner course-card hierarchy and shell hardening applied | Reference hardening complete |
| Learner | Course room | Learner reference | Generic three-column register with equal visual weight | Rebuilt context bar, outline rail, lesson hero, tabs, content canvas, progress/support rail, share/save/offline actions | Direct redesign complete |
| Learner | Progress | Analytics + learner references | Summary boxes and plain course register | Reduced border emphasis, added reference depth and brand progress treatment | Reference hardening complete |
| Academic | Learning administration | Course reference | Catalogue governance read as flat registers | Shared heading, tabs, record surfaces, governance rail and form hierarchy hardened | Reference hardening complete |
| Academic | Studio home | Course builder reference | Generic tree plus action rail | Strengthened authoring hierarchy, depth, course-space tree, governed action rail | Direct styling pass complete |
| Academic | Studio lesson | Course builder reference | Editor columns lacked builder depth and central-canvas dominance | Rebuilt visual hierarchy for builder bar, block palette, central canvas, inspector, selected blocks and quality evidence | Direct styling pass complete |
| Academic | Assessments | Course + analytics references | Large bordered registers and weak tab/action hierarchy | Hardened tab bar, record surface, evidence table, form/action rail | Reference hardening complete |
| Academic | Gradebook | Analytics reference | Operational table not visually related to analytics language | Shared evidence/table density and panel hierarchy hardened | Reference hardening complete |
| Academic | Evidence | Analytics reference | Credential and export ledgers appeared as equal flat boxes | Shared record surfaces and governed action rail hardened | Reference hardening complete |
| Academic | Governed exports | Analytics reference | Dense register hierarchy too border-driven | Shared evidence hierarchy, table density and form controls hardened | Reference hardening complete |
| Academic | Communications | Learner + calendar references | Message/notification surfaces too flat | Shared panel, heading, table and control depth hardened; bell now handles transient notifications | Reference hardening complete |
| Academic | Calendar | Calendar reference | Correct topology but weak elevation, selected event outline and over-generic controls | Reworked timetable elevation, filters, context rail, attendance, trend and quick actions; removed orange live accent | Direct redesign complete |
| Academic | Institutional insights | Analytics reference | Selectable metric cards with no analytical canvas | Replaced with KPI cards, sparklines, real metric trend chart, signal register, comparisons and drill-through evidence | Direct redesign complete |
| Administration | People | Calendar + analytics operational density | Directory surface too flat and table hierarchy weak | Shared table, heading, row hover, panel depth and forms hardened | Reference hardening complete |
| Administration | Person record | Course inspector + admin density | Record sections visually equal | Shared panel depth, typography, actions and evidence hierarchy hardened | Reference hardening complete |
| Administration | Duplicate review | Admin operational language | Review actions lacked sufficient hierarchy | Shared record/action hierarchy and focus treatment hardened | Reference hardening complete |
| Administration | New invitation | Admin operational language | Form read as generic SaaS card | Form controls, label scale, button hierarchy and surface depth hardened | Reference hardening complete |
| Administration | Access administration | Admin operational language | Membership/register panels excessively outlined | Shared table, tabs, action rail and compact controls hardened | Reference hardening complete |
| Administration | Institution setup | Admin operational language | Setup sections card-heavy with weak hierarchy | Shared setup panel depth and operational type scale hardened | Reference hardening complete |
| Administration | Storage | Analytics operational language | Storage tables and quota surfaces too flat | Shared table, status and panel hierarchy hardened | Reference hardening complete |
| Administration | Terminology | Admin operational language | Form/register hierarchy too generic | Shared record and form hierarchy hardened | Reference hardening complete |
| Administration | Service accounts | Admin operational language | Security actions visually indistinct | Shared action hierarchy, compact form controls and focus states hardened | Reference hardening complete |
| Account | Profile | Learner reference | Settings panels too flat | Shared account panel depth and compact typography hardened | Reference hardening complete |
| Account | Support | Calendar contextual language | Support sections lacked contextual hierarchy | Shared panel depth, density and action hierarchy hardened | Reference hardening complete |
| Account | Help | Learner reference | Help surfaces overly card-like | Shared heading/surface hierarchy hardened | Reference hardening complete |
| Internal | Design system | Brand CI | Catalogue inherited inconsistent application defaults | System shell, type, focus, controls and Brand CI layers now load after legacy styles | Reference hardening complete |
| Demo | QA map | Internal only | Demo tooling distorted product header | Role controls moved to separate inspection dock; QA map remains intentionally utilitarian | Direct redesign complete |

## Verification rules for the next inspection cycle

For every route above, verify all of the following at desktop and mobile widths:

1. The global shell does not move between routes except for role-appropriate navigation labels and primary actions.
2. The first viewport contains the highest-value task surface without large dead zones.
3. No decorative card exists only to hold another card.
4. Section headings use the Satoshi scale consistently and do not exceed the reference hierarchy without a functional reason.
5. Border use is subordinate to whitespace, elevation and background changes.
6. Primary, secondary, tertiary and destructive actions are visually distinguishable.
7. Icon buttons have accessible names and useful hover/focus states.
8. Popovers close on Escape and outside interaction where applicable.
9. Charts have semantic labels, restrained grid lines, readable scales and no meaningless outer outline.
10. Mobile layouts preserve task order rather than merely stacking desktop columns arbitrarily.
11. Empty, loading, error and disabled states preserve layout and do not collapse into generic text blocks.
12. Demo-only controls never distort production reference positioning.

## Implementation files added in this pass

- `apps/web/src/components/notification-popover.tsx`
- `apps/web/src/features/analytics/analytics-reference-workspace.tsx`
- `apps/web/styles/learner-reference.css`
- `apps/web/styles/calendar-reference.css`
- `apps/web/styles/analytics-reference.css`
- `apps/web/styles/studio-reference.css`
- `apps/web/styles/system-reference-hardening.css`

This file remains the authoritative screen checklist for subsequent visual-regression review. A route is not considered reference-complete merely because it compiles.