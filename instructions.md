# Veza UI implementation instructions

This file is the mandatory entry point for any UI, UX, frontend styling, page creation, responsive work, visual redesign, or design-system task.

## Required reading order

Before changing UI:

1. Read the current task requirements.
2. Inspect supplied reference images at the relevant viewport.
3. Read `DESIGN.md`.
4. Read `docs/design/ui-principles.md`.
5. Read the relevant files in `docs/design-system/`.
6. Inspect the current route and shared `@veza/ui` components.
7. Confirm the change does not contradict product architecture.

Do not design from component-library memory.

## Critical interpretation correction

Anti-AI-slop rules are not a mandate for minimal, flat, neutral UI.

The following failure mode is explicitly prohibited:

`remove cards -> remove borders -> remove shadows -> remove gradients -> remove motion -> use white backgrounds -> increase whitespace -> call it clean`

That sequence can produce technically tidy but visually weak interfaces.

For Veza:

- semantic discipline and visual richness must coexist;
- depth is allowed and expected where it improves hierarchy;
- strong dark-light contrast is allowed and often useful;
- brand colour can create meaningful focal moments;
- bento is allowed where heterogeneous content benefits from different spans;
- cards are allowed where they represent genuine independent units;
- imagery, illustration, charts, and product mockups can be visually dominant;
- public and learner surfaces can be substantially more expressive than administration;
- operational surfaces should be precise without becoming visually monotonous.

Do not use "minimum visual treatment" as a design goal. Use the correct visual treatment.

## Veza surface personalities

### Public pages

Highest expressive range. Use strong composition, product imagery, tonal section changes, controlled motion, asymmetry, large visual moments, and content-driven bento when appropriate.

Do not style public pages like dashboards.

### Learner pages

Motivating, human, contemporary, and visually engaging. Use course imagery, progress, illustration, media, richer accent moments, and a clearly dominant next action.

Do not make learner UI childish or bland.

### Educator and institution administration

Precise, dense, and operational. Use tables, lists, split panes, inspectors, data visualization, and bento overview regions where they improve decisions.

Do not reduce every route to white tables and flat rows.

### Control plane

Most restrained surface, but still requires strong hierarchy, contrast, and clear depth between canvas, workspace, focus, and transient layers.

## Composition rules

Before creating a component, determine:

- user goal;
- content priority;
- action priority;
- comparison needs;
- persistent context;
- responsive transformation;
- visual hierarchy;
- contrast strategy;
- depth strategy.

Use cards only when content is independently meaningful.

Use bento when spans and visual weight reflect real differences in information importance.

Use tonal fields, backgrounds, scale, media, overlap, selective borders, and selective elevation to create depth.

Avoid pages where every region has the same white fill, faint border, radius, padding, and visual weight.

## Existing references

The Veza Brand CI and `/designs` reference screens are visual evidence.

When a related reference exists, compare the implementation against it after rendering. Do not simplify a rich reference into a flatter component-library interpretation.

## Real-estate rule

Do not permanently expose secondary creation, invite, assign, configuration, or advanced forms if a button can open the workflow in a suitable panel, drawer, dialog, or dedicated route.

Do not create dead desktop space merely to look minimal.

Use width for useful context, previews, filters, data, comparisons, timelines, media, or inspectors.

## Design-system rule

Applications consume `@veza/ui`.

Radix, shadcn, Lucide, and browser primitives are implementation resources. They do not define Veza page composition.

Shared component behavior, tokens, focus, density, and geometry belong in the shared system. Do not patch repeated primitive defects route by route.

## Accessibility and responsive behavior

Accessibility is non-negotiable and must coexist with expressive visual design.

Responsive work must recompose the task. Do not mechanically stack desktop columns.

Respect:

- keyboard navigation;
- visible focus;
- contrast;
- semantic structure;
- touch targets;
- zoom and reflow;
- screen-reader naming;
- reduced motion.

## Visual QA gate

Do not claim a major UI task is complete from code inspection alone.

Render representative desktop and mobile states and check:

- dominant visual area;
- hierarchy;
- contrast;
- depth;
- rhythm;
- crop quality;
- whitespace;
- density;
- loading, empty, error, success, disabled, and selected states;
- keyboard and focus behavior;
- reduced motion where relevant.

Final check:

> If the interface is usable but boring, bland, visually timid, or interchangeable with an unrelated product, the design is not done.

Do not use em dashes in generated interface copy or project documentation.
