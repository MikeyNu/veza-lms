# Veza product UI principles

## Source of truth

UI decisions follow this order:

1. Current explicit product requirements.
2. Supplied reference screenshots and visual assets.
3. Approved Veza Brand CI and shared design tokens.
4. Product and technical architecture.
5. Repository-root `DESIGN.md`.
6. Existing high-quality Veza patterns.
7. `@veza/ui` component contracts.
8. Platform conventions and design judgment.

The Brand CI is not a loose theme. Its typography, colour roles, icon geometry, control language, and visual contrast are product contracts.

## Product visual thesis

Veza combines a stable, high-trust education operating system with more expressive learning and product-storytelling surfaces.

The shell provides continuity. The active workspace provides identity and task focus.

The system should feel precise without feeling sterile, and visually rich without becoming decorative or chaotic.

Anti-generic guidance must never be interpreted as a requirement to make the interface flat.

## Surface personalities

### Public and acquisition

Use the highest level of visual expression.

Appropriate treatments include editorial asymmetry, layered product imagery, strong section contrast, bento storytelling, large typographic moments, controlled overlap, immersive mockups, and purposeful motion.

Public pages should not resemble the institution administration workspace.

### Learner

Use a motivating, contemporary, human visual language.

Course art, progress, resources, upcoming work, feedback, recommendations, and learning media should create a clear hierarchy. Learner pages can use richer brand colour, imagery, and bento composition than staff administration.

Avoid childish visual language, but also avoid making learner UI visually timid.

### Educator and institution administration

Prioritize task speed, data clarity, and state accuracy.

Use tables, lists, inspectors, split panes, master-detail structures, timelines, and charts where appropriate. Overview regions may use bento when heterogeneous information genuinely benefits from different spans.

Precision does not require monotony.

### Control plane

Use the most restrained visual language, with strong trust cues, visible risk state, clear surface boundaries, and deliberate density.

Restraint still requires contrast and depth.

## Product shell

The top bar contains institution switching, permission-aware search, contextual creation, notifications, and support. Stable applications live in the left navigation. Object-level navigation uses a context rail. An inspector appears only for properties, learner context, review, or history.

The shell should remain calmer than the active workspace, but it must not make the whole product visually quiet.

The desktop shell follows the supplied references:

- deep slate navigation surface;
- indigo selected navigation state;
- approximately 14.5rem navigation width at the reference desktop scale;
- approximately 4rem top bar height;
- search and institution context before utility actions;
- consistent 24px-grid line iconography.

The dark shell creates an intentional depth and contrast relationship with the primary workspace.

## Visual richness, depth, and contrast

Veza must not default to white-on-white composition separated only by faint borders.

Use a layered model:

1. canvas;
2. grounded workspace;
3. focus or emphasis plane;
4. transient overlay plane.

Not every page requires all four, but important regions must be perceptually distinct.

Create depth through combinations of:

- tonal background shifts;
- selective elevation;
- clear inset and outset relationships;
- media planes;
- controlled overlap;
- scale differences;
- section bands;
- foreground and background layering;
- meaningful borders;
- sticky context;
- spatially coherent motion.

Create contrast across multiple axes:

- light and dark;
- saturated and neutral;
- large and small;
- dense and spacious;
- image-led and text-led;
- quiet and emphatic.

WCAG contrast is a baseline. The visual composition must still have an obvious hierarchy.

## Structured richness and selective bento

Bento is a composition strategy, not a prohibited trend.

Use bento when heterogeneous information differs in priority, interaction, media type, or required span.

Strong Veza bento examples can include learner progress, institutional health, course overview, analytics summaries, and public product storytelling.

A bento region must have:

- a dominant tile or region;
- meaningful span differences;
- purposeful adjacency;
- varied content roles;
- responsive recomposition;
- controlled container styling.

Do not make every tile use the same radius, padding, icon treatment, and text formula.

Long records still use tables, lists, timelines, registers, or canvases.

## Cards and grouping

Do not wrap every section in a card.

Use a card when content is an independent object, state, decision, resource, metric, or workflow unit.

Valid examples include course objects, learner resources, approval decisions, media objects, and compact metric summaries.

Cards can use stronger visual hierarchy through imagery, background, span, density, and selected state. They do not all need to be identical white rectangles.

Use direct page placement, rules, typography, spacing, tonal fields, lists, tables, or split panes when those relationships are clearer.

## Global colour ownership

The approved Brand CI defines the shared palette.

Primary brand:

- Indigo 600: `#4F46E5`
- Purple 600: `#7C3AED`
- Blue 500: `#3B82F6`
- Teal 500: `#14B8A6`

Neutral foundation:

- Slate 900: `#0F172A`
- Slate 700: `#334155`
- Slate 500: `#64748B`
- Slate 300: `#CBD5E1`
- Slate 100: `#F1F5F9`
- White: `#FFFFFF`

Semantic roles:

- success: Green 500 `#22C55E`
- warning: Amber 500 `#F59E0B`
- critical: Red 500 `#EF4444`
- information: Blue 500 `#3B82F6`
- purple semantic accent: Purple 500 `#8B5CF6`

Indigo is the default product primary for actions, selected states, and active learning states. Purple, blue, and teal support composition and information hierarchy where their use is coherent with Brand CI.

Do not spray saturated colour across every icon and label. Do not ration brand colour so aggressively that the interface becomes anonymous.

Institution branding may alter a constrained accent token after contrast validation. It may not redefine semantic status colours, the dark shell, accessible focus treatment, or primary-action hierarchy.

## Typography

Satoshi is the application typeface.

Brand CI scale:

- Display 1: Bold 56/64
- Display 2: Bold 40/48
- Heading 1: SemiBold 28/36
- Heading 2: SemiBold 22/28
- Heading 3: Medium 18/24
- Body 1: Regular 16/24
- Body 2: Regular 14/20
- Small: Regular 12/16

Operational screens normally use Heading 1 through Small. Public and learner surfaces may use display scale where it improves hierarchy.

Hierarchy must also use weight, line height, measure, alignment, colour, and position.

## Imagery and illustration

Veza media should participate in composition rather than sit inside generic image cards.

Design around the actual crop, subject placement, negative space, scale, and relationship to adjacent content.

Course media, learner photography, illustration, charts, and product mockups can become dominant visual anchors.

Reference screenshots should be implemented with fidelity, not reduced to simplified placeholders.

## Iconography

Veza uses one coherent line icon language:

- 24px source grid;
- 2px stroke;
- rounded joins and caps;
- consistent optical sizing;
- no Unicode glyphs as substitute interface icons;
- no route-local hand-drawn SVG sets when a supported shared icon exists.

Icon-only controls require accessible names.

## Component architecture

Applications import product components from `@veza/ui`.

`@veza/ui` owns:

- Brand CI token mapping;
- variants and component geometry;
- accessible interaction wrappers;
- icon sizing;
- density;
- focus treatment;
- responsive component behavior;
- loading, empty, error, and disabled states.

Radix UI primitives may be used inside `@veza/ui` for complex interaction mechanics. Select shadcn patterns may be adapted as owned Veza source when they improve reliability.

Neither Radix nor shadcn defines Veza page composition.

## Layout and responsive behavior

Desktop layouts use available width while preserving readable line length.

Use context rails, inspectors, previews, data visualizations, split panes, and supporting media where they improve the task.

Do not create unexplained dead zones to appear minimal.

Tablet layouts remove sticky behavior before columns become compressed. Inspectors and governance actions move below the dominant task. Filter bars reflow into deliberate rows.

Mobile layouts follow task order rather than desktop column order. Bento layouts recompose according to importance. Tables remain horizontally scrollable where comparison is essential. Card grids become lists only when the card treatment no longer adds meaningful grouping.

## Metrics and evidence

Every metric must state what it measures, what records it includes, and when it was generated or updated.

Progress interfaces must use authoritative completion evidence. Privacy-sensitive workspaces must render truthful withheld or unavailable states rather than invented emptiness.

## Motion

Motion should communicate state, continuity, feedback, learning progress, direct manipulation, product demonstration, or narrative.

Public surfaces can use more expressive motion. Administration should remain restrained.

Do not apply the same fade-up animation to every element.

Respect reduced-motion preferences.

## Accessibility

Controls require persistent labels, keyboard access, visible focus, explicit status language, and usable touch targets.

Colour never carries meaning alone.

Accessibility does not require flat visual design. Strong hierarchy and contrast are encouraged when they preserve semantics and task success.

## Completion test

A Veza screen is not complete if it is technically clean but visually bland.

Before approval, confirm:

- there is a clear dominant region;
- primary and supporting content have meaningful contrast;
- depth is appropriate to the surface;
- the page has rhythm rather than repeated equal blocks;
- approved brand colour is visibly present where useful;
- media and visualization are integrated where relevant;
- the design feels like Veza rather than a generic admin template;
- the rendered result has been visually inspected.
