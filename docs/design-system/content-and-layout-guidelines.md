# Content and layout guidelines

## Purpose

These guidelines translate `DESIGN.md` into page-composition rules for Veza workspaces.

They are not a fixed page template.

A route must answer the user's core questions, but the visual arrangement should change according to the surface, task, content, and available reference designs.

## Page hierarchy questions

Every operational page must make the following understandable:

1. Where am I?
2. What is the current task, decision, or object?
3. What needs attention now?
4. What evidence or state supports that decision?
5. What can I do next?
6. What secondary context can be disclosed without interrupting the task?
7. What historical or audit information is available when needed?

These questions do not require a literal vertical stack of title, action, filters, table, rail, and audit log.

Use the topology that best serves the task.

## Dominant region

Every page should have one clearly dominant working region.

Examples include:

- course canvas;
- learner lesson;
- data table;
- analytics visualization;
- calendar;
- marking workspace;
- certificate preview;
- people register;
- public product demonstration.

Supporting regions should not compete equally with the dominant region.

## Visual hierarchy and depth

Do not rely on whitespace alone.

Create hierarchy through combinations of:

- tonal background changes;
- scale;
- density;
- typography;
- section bands;
- media;
- controlled overlap;
- selective borders;
- selective elevation;
- foreground and background planes.

Avoid white panels on a white page separated only by faint grey outlines.

Operational precision can still use strong contrast.

## When to use a card

Use a bounded card when the content is independently actionable or conceptually self-contained, such as:

- course object;
- metric summary;
- approval decision;
- upload queue;
- learner resource;
- compact empty state;
- media object;
- actionable recommendation.

Do not use cards to separate every heading, field group, navigation item, table, or paragraph.

Alternatives include:

- section rules;
- whitespace;
- native fieldsets;
- table rows;
- timelines;
- split workspaces;
- context rails;
- inspectors;
- background fields;
- direct placement on the canvas.

Cards can vary in visual weight. Do not force all cards to share identical fill, border, radius, padding, and shadow.

## Bento

Use bento when a region contains heterogeneous information with different priority, span, media, or interaction roles.

Good candidates include:

- learner home;
- course overview;
- institutional health;
- analytics summary;
- public product storytelling.

A bento region requires a dominant area and purposeful span differences.

Do not use bento as a synonym for a grid of identical cards.

## Real estate

Desktop width should support the task.

Use available space for:

- wider records;
- context;
- previews;
- filters;
- comparisons;
- timelines;
- inspectors;
- data visualizations;
- supporting media.

Do not leave large unexplained dead zones in the name of minimalism.

Do not permanently expose secondary creation, invite, assign, or configuration forms when they can open from a focused action.

## Copy

- Use concrete institutional language.
- Name the record, action, and consequence.
- Avoid promotional filler such as unlock, supercharge, transform, seamless, and effortless.
- Avoid decorative microcopy that does not help a learner, staff member, or operator decide what to do.
- State why a consequential action is restricted.
- Preserve formal programme, qualification, and policy names without truncating required meaning.
- Do not use em dashes.

## Status and risk

- Colour supplements status text and never replaces it.
- Institution branding does not override warning, critical, success, or trust semantics.
- Consequential actions include a reason, impact, or approval requirement near the control.
- Empty states describe what belongs in the space and the correct next action.
- Errors include recovery guidance and a support reference when available.

## Imagery and visualization

Use imagery when it supports subject recognition, learning context, product storytelling, or visual hierarchy.

Use charts when they answer a concrete question.

Do not reduce meaningful course or product media to small decorative thumbnails merely to preserve a flat layout.

## Responsive behavior

- Recompose the page according to task priority.
- Collapse secondary rails before compressing the dominant task.
- Convert multi-column forms to one column when reading order would become unclear.
- Keep dense tables horizontally scrollable when comparison is essential.
- Preserve keyboard order when visual columns change.
- Keep primary actions discoverable without duplicating them unnecessarily.
- Recompose bento by importance rather than mechanically stacking source order.
- Adjust image crop and visual complexity intentionally on smaller screens.

## Internationalisation

- Use logical CSS properties.
- Do not rely on short English labels.
- Test right-to-left direction.
- Allow field labels, tab names, and table headings to wrap where meaning would be lost.
- Keep identifiers and dates distinguishable from translated prose.

## Motion and contrast

- Motion communicates state, continuity, feedback, product behavior, or narrative.
- Public and learner surfaces may use more expressive motion than administration.
- Respect reduced-motion preferences and the catalogue override.
- High-contrast mode must retain boundaries, selection, focus, and hierarchy.
- Institution accents require computed foreground contrast through `institutionAccentVariables()`.
- Passing numeric contrast checks does not excuse a visually flat composition.

## Completion check

Before approving a page, confirm:

- one region is clearly dominant;
- hierarchy uses more than whitespace;
- primary and supporting areas have meaningful contrast;
- depth is appropriate;
- visual rhythm exists;
- cards are semantically justified;
- bento, if used, has meaningful span differences;
- media is integrated where relevant;
- responsive behavior is recomposed;
- the page does not feel bland or interchangeable with a generic enterprise template.
