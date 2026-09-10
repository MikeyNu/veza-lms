# Veza LMS Design Governance

## Purpose and authority

This document is the primary design decision framework for Veza LMS. It governs product UI, public pages, learner experiences, educator workspaces, institution administration, the control plane, shared components, responsive behavior, motion, visual QA, and design-system implementation.

It is based on the supplied `DESIGN.md` framework, adapted to Veza's product architecture, Brand CI, reference screens, and recurring implementation failures.

The goal is not minimalism. The goal is not maximalism. The goal is an authored interface that is useful, recognizable, visually compelling, coherent, accessible, responsive, and specific to Veza.

The central correction is mandatory:

> Anti-generic design must never be interpreted as a mandate for flat, bland, timid, low-contrast, or visually empty UI.

A screen can be semantically correct and still be badly designed. If the result feels like a cleaned-up wireframe, a default component-library example, a field of white rectangles, or an anonymous enterprise interface, it is not done.

## 1. Source of truth

Apply design evidence in this order:

1. Explicit requirements in the current task.
2. Approved reference images and screenshots supplied for the task.
3. Veza Brand CI and approved brand assets.
4. Product and technical architecture.
5. This `DESIGN.md`.
6. `docs/design/ui-principles.md`.
7. `docs/design-system/` contracts.
8. Existing high-quality Veza patterns.
9. `@veza/ui` primitives and tokens.
10. Framework and library defaults.

A component library is an implementation resource, not a design director.

Do not replace an approved visual structure merely because a library component is easier to use. Do not override product architecture to create a more visually fashionable page.

## 2. Mandatory quick reference

Before UI work, apply these rules:

1. Classify the surface before designing it.
2. Establish a product-specific design thesis before styling.
3. Do not use a familiar pattern merely because it is common or easy.
4. Do not ban familiar patterns merely to look creative.
5. Anti-slop is not a reduction exercise.
6. Flatness is a defect when it weakens hierarchy, identity, or emotional quality.
7. Contrast must be intentionally composed, not only technically validated.
8. Depth can come from tone, layering, scale, media, overlap, elevation, background fields, or motion.
9. Cards are valid when they represent meaningful independent units.
10. Bento is valid when content genuinely differs in importance, span, media, or interaction role.
11. Public and learner surfaces are allowed to be considerably more expressive than operational administration.
12. Operational screens can be dense and precise without becoming visually monotonous.
13. Motion must communicate state, continuity, hierarchy, narrative, or product behavior.
14. Responsive design is recomposition, not desktop shrinkage.
15. Render and inspect the actual interface before claiming design completion.
16. If swapping the logo and copy would make the design fit an unrelated product, redesign it.
17. If a screen is usable but boring, bland, or visually timid, it still needs design work.
18. Do not use em dashes in generated interface or project copy.

## 3. Product-specific design thesis

Veza is a multi-tenant education operating system, not a generic SaaS dashboard.

The visual system should communicate two qualities at the same time:

- confidence and operational control for institutions;
- progress, energy, possibility, and human learning for learners and educators.

The system therefore needs controlled contrast between a stable product shell and more expressive task surfaces.

A useful default thesis is:

> Veza uses a confident dark navigation spine, precise working surfaces, bold but controlled brand accents, and richer visual moments where learning, progress, analysis, or storytelling benefits from them. The interface should feel composed and contemporary, not sterile. Density and clarity are protected, while depth, media, scale, and contrast create identity.

Do not use vague goals such as "clean and modern" as design rationale.

## 4. Surface classification

Veza contains several surface types. They require different visual defaults.

### 4.1 Public and acquisition surfaces

These are the most expressive surfaces.

Appropriate tools include:

- editorial asymmetry;
- full-width and full-bleed visual regions;
- dramatic dark-light section contrast;
- large product screenshots and device compositions;
- controlled overlap;
- layered product imagery;
- brand-informed gradients;
- selective texture;
- large typographic moments;
- content-driven bento;
- scroll storytelling;
- product demonstration;
- carefully choreographed motion.

Do not make public pages look like the institution admin workspace.

Do not default to the standard AI landing-page sequence of centered hero, logo strip, three cards, testimonials, FAQ, and final CTA.

### 4.2 Learner-facing surfaces

Learner UI should feel motivating, clear, contemporary, and human. It can be visually richer than staff administration without becoming childish.

Use:

- subject-specific imagery;
- strong course art;
- progress visualizations;
- meaningful illustration;
- visibly prioritized next actions;
- richer accent use;
- bento regions for heterogeneous learner context;
- visual distinction between active learning, upcoming work, progress, resources, and support;
- stronger media integration;
- calm but noticeable feedback and motion.

Do not interpret education, accessibility, or simplicity as a requirement for blandness.

### 4.3 Educator and institution administration

These surfaces need speed, precision, dense information, and state clarity.

Use:

- tables for comparative records;
- lists for linear workflows;
- split panes;
- master-detail structures;
- inspectors;
- anchored filters;
- context rails;
- charts when they answer real questions;
- bento for high-level heterogeneous overview regions;
- stronger tonal separation between workspace zones;
- selective elevation for focused or transient work.

Do not make every page a white header followed by a white table on a white canvas.

### 4.4 Control plane and governance

This is the most restrained environment because trust, auditability, permissions, and operational control dominate.

Restraint does not mean flatness. Use clear layer separation, strong information hierarchy, visible risk state, high-contrast focus, and deliberate density.

## 5. Visual richness, depth, and contrast

### 5.1 Richness must be authored

Visual richness is valid when it improves:

- hierarchy;
- comprehension;
- product recognition;
- narrative;
- comparison;
- emotional engagement;
- spatial continuity;
- perceived quality;
- learning motivation.

Decoration is not automatically invalid. Brand expression and emotional character are legitimate jobs.

The test is whether the treatment has a coherent role and whether removing it weakens the experience.

### 5.2 Depth model

Use depth intentionally across four possible planes:

1. **Canvas:** the environmental background of the route or section.
2. **Grounded workspace:** the main working region or content field.
3. **Emphasis plane:** selected objects, focal content, active learning, key metrics, media, or next actions.
4. **Transient plane:** menus, dialogs, drawers, tooltips, drag previews, and temporary overlays.

Not every screen needs all four planes, but the relationship between planes must be clear.

Depth can be created through:

- tonal fields;
- light-dark shifts;
- background contrast;
- selective borders;
- selective shadow;
- inset or outset relationships;
- controlled overlap;
- scale;
- media layering;
- sticky regions;
- foreground and background planes;
- crop and mask treatment;
- motion continuity.

Do not add the same shadow to every object. Do not remove all shadow merely because shadow can be overused.

### 5.3 Contrast model

WCAG compliance is the baseline. The composition must also create perceptual contrast.

Use several contrast dimensions as appropriate:

- light versus dark;
- saturated versus neutral;
- large versus small;
- dense versus open;
- image-led versus text-led;
- stable versus interactive;
- quiet versus emphatic;
- flat versus raised;
- broad field versus precise detail.

Avoid pages where every surface uses the same white, the same 1px grey border, the same 12px radius, and the same weak shadow.

### 5.4 Section contrast

Adjacent major sections should not all have identical visual weight.

Possible transitions include:

- white to pale neutral;
- pale neutral to dark;
- text-led to media-led;
- dense to spacious;
- grid to full-width feature;
- flat working area to focused elevated object;
- static explanation to interactive demonstration.

The purpose is rhythm, not random variation.

## 6. Layout and composition

Start from relationships, not containers.

Determine:

- what the user is trying to do;
- what must be understood first;
- what needs comparison;
- what requires persistent context;
- what can be disclosed later;
- what deserves visual dominance;
- how information changes at narrower widths.

Then choose a structure.

Allowed structures include:

- asymmetric grids;
- editorial columns;
- full-width bands;
- master-detail;
- split panes;
- context rails;
- sticky side regions;
- bento;
- layered media;
- deliberate overlap;
- table-first layouts;
- timeline-first layouts;
- immersive visual stages.

Do not force every page through one template in the name of consistency.

Consistency means shared grammar, not identical composition.

## 7. Bento rules

Bento is encouraged when heterogeneous content genuinely benefits from different spans and visual weights.

Good Veza use cases include:

- learner home;
- course overview;
- institutional analytics summary;
- risk and intervention overview;
- teaching dashboard;
- public product storytelling.

A strong bento composition should:

- contain a clear dominant tile or region;
- vary span according to information priority;
- mix content types intentionally;
- avoid identical internal formulas;
- use adjacency to express relationships;
- transform deliberately on mobile.

Do not create a bento layout where every tile contains an icon, heading, two lines of copy, identical padding, and the same radius.

## 8. Cards and containers

Cards are not prohibited.

Use a card when at least two of these are true:

- the unit is an independent entity;
- it repeats in a collection;
- it combines multiple content types;
- the whole unit is clickable or selectable;
- it has its own state or actions;
- it benefits from strong common-region grouping.

Valid Veza examples can include:

- course objects;
- learning resources;
- assignment summaries;
- metric summaries;
- approval decisions;
- media objects;
- compact empty states;
- actionable learner recommendations.

Avoid cards around ordinary prose, simple headings, permanent forms, every filter, every table row, and every navigation item.

If cards are used, create hierarchy between them through span, media, background, density, state, and action prominence.

Do not flatten every card into the same white rectangle.

## 9. Borders, surfaces, and backgrounds

Borders communicate boundary, state, affordance, or graphic structure.

Spacing and alignment may replace borders where the relationship is already clear.

However, the instruction "avoid unnecessary borders" must not be interpreted as "remove all surface structure."

Backgrounds are active compositional tools.

Use background treatment to create:

- section identity;
- hierarchy;
- depth;
- atmosphere;
- continuity;
- contrast;
- narrative.

Acceptable treatments can include:

- solid tonal fields;
- subtle brand-informed gradients;
- restrained texture;
- large imagery;
- graphic motifs;
- media backdrops.

Avoid meaningless glowing blobs, generic aurora backgrounds, random dot grids, or decorative effects copied from trend-driven templates.

## 10. Colour

Use the approved Brand CI.

Primary brand roles:

- Indigo 600 `#4F46E5`
- Purple 600 `#7C3AED`
- Blue 500 `#3B82F6`
- Teal 500 `#14B8A6`

Neutral foundation:

- Slate 900 `#0F172A`
- Slate 700 `#334155`
- Slate 500 `#64748B`
- Slate 300 `#CBD5E1`
- Slate 100 `#F1F5F9`
- White `#FFFFFF`

Semantic roles remain reserved for their meanings.

Brand colour should not be sprayed across every icon and label, but it should not be rationed so aggressively that Veza loses visual identity.

A visually empty area is not a reason to invent a new colour. A visually important product moment is a valid reason to use approved colour more strongly.

Institution accenting may vary through validated tokens but must not replace platform semantics, trust states, focus behavior, or critical status colours.

## 11. Typography

Satoshi is the authoritative product typeface.

Use the approved role hierarchy, but do not rely on size alone.

Create hierarchy through:

- weight;
- width;
- line height;
- measure;
- tracking;
- alignment;
- colour;
- position;
- whitespace;
- contrast with surrounding media.

Operational screens normally use compact heading roles. Public and learner surfaces may use larger editorial scale where it creates useful hierarchy.

Do not make every heading oversized. Do not make every heading small in the name of enterprise restraint.

## 12. Imagery, illustration, and product media

Media should participate in the composition.

For each image or screenshot, consider:

- crop;
- direction;
- subject placement;
- negative space;
- scale;
- relationship to text;
- overlap potential;
- mask or clipping treatment;
- responsive transformation.

Do not place every screenshot inside the same rounded white card.

Approved product screenshots and reference designs should be treated as visual evidence, not as generic placeholders.

Course media, learner imagery, interface mockups, diagrams, and educational illustration can be central visual anchors.

## 13. Motion

Motion must have a job.

Valid roles include:

- state change;
- spatial continuity;
- task feedback;
- direct manipulation;
- learning progression;
- navigation orientation;
- product demonstration;
- narrative sequencing;
- brand expression where it does not compete with the task.

Do not animate every viewport entrance.

Do not interpret "avoid decorative motion" as "make the page static."

Public pages may use a stronger motion system than operational screens. Learner screens may use restrained reward and progress feedback. Admin screens should prioritize state clarity and task continuity.

Respect `prefers-reduced-motion`.

## 14. Real estate and progressive disclosure

Do not expose secondary creation, invite, assign, configuration, or advanced workflows as permanent multi-field regions when a button can open the workflow in a suitable panel, drawer, dialog, or dedicated page.

Choose the disclosure mechanism based on complexity and task continuity.

Use desktop width intelligently through:

- wider data views;
- context rails;
- previews;
- inspectors;
- comparisons;
- timelines;
- visualizations;
- supporting media.

Do not create large dead zones and call them whitespace.

Whitespace must create hierarchy, calm, focus, or rhythm.

## 15. Tables, lists, forms, and data density

Use tables when users need cross-row comparison, sorting, filtering, or bulk action.

Use lists when the hierarchy is primarily linear.

Use cards for richer independent objects.

Forms should feel like tasks, not collections of boxes.

Do not use permanent multi-column forms when they impair reading order. Do not hide high-frequency actions behind multiple layers just to make the page look clean.

On mobile, do not automatically convert every table row into a giant card. Preserve the decision-relevant fields and provide deliberate access to secondary information.

## 16. Responsive design

Responsive design is transformation.

At each meaningful breakpoint decide:

- what remains primary;
- what changes order;
- what collapses;
- what becomes a different component;
- what becomes progressively disclosed;
- how imagery changes crop;
- how bento relationships transform;
- how pointer interactions become touch interactions;
- what visual complexity should reduce.

Learner mobile surfaces may need a different composition from staff desktop screens.

Do not mechanically stack desktop columns.

## 17. Accessibility

Accessibility is a design input.

Validate:

- semantic structure;
- heading order;
- keyboard operation;
- visible focus;
- focus not obscured;
- text and non-text contrast;
- target size and spacing;
- control labels;
- error identification;
- zoom and reflow;
- reduced motion;
- screen-reader naming;
- logical reading and focus order.

Accessibility does not require muted visual design. Strong contrast, clear hierarchy, and expressive composition can improve accessibility when used correctly.

## 18. Anti-slop threat model

Never default to:

- decorative eyebrow pills above every section;
- generic gradient-highlighted hero words;
- identical icon cards;
- nested cards;
- universal 1px borders;
- the same radius on every component;
- glassmorphism without environmental logic;
- generic SaaS section order;
- fake metrics or testimonials;
- decorative charts;
- every element fading upward;
- generic startup copy;
- empty background blobs;
- component-library demo composition.

But do not reverse these rules mechanically.

Cards are not bad.
Borders are not bad.
Gradients are not bad.
Bento is not bad.
Centered composition is not bad.
Minimalism is not bad.
Richness is not bad.
Common controls are not bad.

The wrong decision is the one selected without product-specific reasoning.

## 19. Anti-overcorrection rules

This section has high priority.

Do not use the anti-slop policy to produce:

- uniformly white pages;
- excessive empty space;
- weak hierarchy;
- near-invisible borders;
- tiny typography everywhere;
- no imagery;
- no depth;
- no motion;
- no strong brand colour moments;
- repeated flat rows;
- generic table-first pages where another topology would work better;
- visually timid learner experiences;
- public pages that resemble admin workspaces.

"Use the minimum visual treatment" is not a Veza design principle.

Use the right visual treatment.

A useful visual treatment can be bold.

## 20. Reference-screen protocol

The approved Brand CI and reference screens in `/designs` establish visual evidence for:

- shell confidence;
- dark-light contrast;
- density;
- typography;
- navigation;
- data presentation;
- content hierarchy;
- use of media;
- accent behavior;
- page proportion.

When implementing from a reference:

1. Inspect the actual reference at the target viewport.
2. Identify structural rules before decorative details.
3. Preserve product-specific hierarchy and relationships.
4. Do not simplify rich structures into generic components.
5. Improve weak areas without erasing the reference identity.
6. Compare the rendered implementation against the reference after coding.

A reference is a minimum fidelity bar, not permission to create a flatter substitute.

## 21. Mandatory design workflow

### Discover

Inspect:

- requirements;
- architecture;
- Brand CI;
- references;
- existing routes;
- shared tokens;
- real content;
- responsive constraints.

### Define

Write a concise design thesis.

Identify:

- dominant task;
- hierarchy strategy;
- surface personality;
- contrast strategy;
- depth strategy;
- experimentation zone;
- anti-goals.

### Diverge

For a significant new surface, explore at least three materially different structural directions before polishing.

Variation must include topology, hierarchy, composition, or interaction, not merely colour.

### Converge

Choose the direction that best balances:

- task clarity;
- brand specificity;
- distinctiveness;
- responsiveness;
- accessibility;
- implementation feasibility;
- performance;
- content scalability.

### Implement

Use semantic components and shared tokens.

Preserve product architecture.

### Inspect

Render the interface.

Check visual, interaction, responsive, accessibility, and content-stress states.

### Refine

Fix structural issues before cosmetic details.

Do not declare completion because the requested components exist.

## 22. Visual QA

A major design task is incomplete until rendered inspection has occurred.

Review:

- attention order;
- dominant region;
- visual balance;
- section rhythm;
- tonal contrast;
- depth;
- whitespace;
- image crop;
- text measure;
- density;
- alignment;
- state hierarchy;
- responsive transformation;
- keyboard and focus behavior.

Run the following quality questions:

1. Does this look intentionally Veza?
2. Is there a clear dominant visual area?
3. Are primary and supporting regions meaningfully differentiated?
4. Is the page too flat?
5. Is the page too noisy?
6. Is brand colour used purposefully but visibly?
7. Does the layout have rhythm rather than repeated equal blocks?
8. Is bento used only where heterogeneous content benefits from it?
9. Are cards semantically justified?
10. Does media participate in the composition?
11. Is motion purposeful?
12. Does mobile feel recomposed rather than stacked?
13. Would the page still look like Veza without the logo?
14. Did anti-slop guidance accidentally make the page boring?
15. Does the result feel authored rather than generated?

If several answers expose weakness, redesign before completion.

## 23. Definition of done

A design is complete only when:

- the primary task is clear;
- the information hierarchy matches product priorities;
- brand identity is visible;
- the page has appropriate contrast and depth;
- visual richness is justified rather than arbitrary;
- the page is not interchangeable with an unrelated product;
- cards, borders, tags, and pills are semantically justified;
- public and learner surfaces have appropriate expressive quality;
- operational surfaces preserve density without visual monotony;
- responsive behavior is intentional;
- accessibility is tested;
- reduced motion is handled;
- realistic content states are considered;
- the rendered interface has been inspected;
- the anti-template review has passed;
- the anti-overcorrection review has passed.

The desired outcome is not maximum novelty and not maximum restraint.

The desired outcome is a coherent Veza interface that feels deliberately designed.
