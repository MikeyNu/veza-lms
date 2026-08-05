# Content and layout guidelines

## Page hierarchy

Every operational page should expose, in order:

1. A clear page title and short purpose statement.
2. One primary action or decision path.
3. Attached filters and status evidence.
4. The dominant record, form or workspace.
5. Secondary context in a rail, inspector or drawer.
6. Audit evidence and historical detail after the current task.

## When to use a card

Use a bounded card only when the content is independently actionable or conceptually self-contained, such as a metric, approval decision, upload queue or compact empty state.

Do not use cards to separate every heading, field group, navigation item, table or paragraph. Prefer:

- section rules
- whitespace
- native fieldsets
- table rows
- timelines
- split workspaces
- context rails
- inspectors

## Copy

- Use concrete institutional language.
- Name the record, action and consequence.
- Avoid promotional phrases such as unlock, supercharge, transform, seamless and effortless.
- Avoid decorative microcopy that does not help a learner, staff member or operator decide what to do.
- State why a consequential action is restricted.
- Preserve formal programme, qualification and policy names without truncating required meaning.

## Status and risk

- Colour supplements status text and never replaces it.
- Institution branding does not override platform warning, critical, success or trust semantics.
- Consequential actions include a reason, impact or approval requirement near the control.
- Empty states describe what belongs in the space and the correct next action.
- Errors include recovery guidance and a support reference when available.

## Responsive behaviour

- Collapse secondary rails before shrinking the dominant task.
- Convert multi-column forms to one column below tablet width.
- Keep dense tables horizontally scrollable rather than converting records into unrelated cards.
- Preserve keyboard order when visual columns collapse.
- Keep primary actions visible without duplicating them.

## Internationalisation

- Use logical CSS properties.
- Do not rely on short English labels.
- Test right-to-left direction.
- Allow field labels, tab names and table headings to wrap where meaning would be lost.
- Keep identifiers and dates distinguishable from translated prose.

## Motion and contrast

- Motion communicates state change and should not decorate static content.
- Respect reduced-motion preferences and the catalogue override.
- High-contrast mode must retain boundaries, selection and focus.
- Institution accents require computed foreground contrast through `institutionAccentVariables()`.
