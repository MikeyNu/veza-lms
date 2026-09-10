# Veza shared interface system

The `@veza/ui` package is the authoritative reusable component layer for institution workspaces and the control plane. It implements interaction, visual, accessibility, and density contracts described by the product architecture and repository-root `DESIGN.md`.

The current system is Design System v2. The migration rationale and primitive ownership rules are documented in [`design-system-v2-migration.md`](./design-system-v2-migration.md).

## Design principles

1. Preserve one dominant task area.
2. Use cards for meaningful independent units, not as automatic section wrappers.
3. Use tables for dense comparative records and timelines for historical evidence.
4. Build hierarchy through typography, spacing, tone, background fields, scale, media, and controlled depth.
5. Do not interpret anti-slop as a requirement for flat or visually timid UI.
6. Use elevation selectively, but allow it wherever spatial separation or emphasis is meaningful.
7. Use content-driven bento for heterogeneous overview regions when span and priority differences are real.
8. Preserve strong dark-light and primary-supporting contrast where it improves hierarchy.
9. Apply institution accents only through validated role tokens.
10. Keep critical, warning, success, and information colours outside institution branding.
11. Use explicit status language alongside colour.
12. Use one shared icon language with a 24px source grid and 2px stroke.
13. Do not implement route-local fixes for shared component geometry.
14. Keep component primitives coherent while allowing page composition to vary by surface.

The completed application audit, screen-family matrix, and release gates are documented in [`ui-ux-audit.md`](./ui-ux-audit.md). Palette statements in that older audit are historical where they conflict with the approved Brand CI and current `tokens.css`.

## Component consistency versus page richness

A shared design system is not a page template.

`@veza/ui` standardizes:

- behavior;
- accessibility;
- control geometry;
- focus;
- density;
- state;
- typography roles;
- tokens;
- reusable domain primitives.

It does not require every page to use the same card grid, white surface, border, radius, or spacing pattern.

Visual richness should primarily come from composition:

- region scale;
- span;
- background contrast;
- content density;
- media;
- layout topology;
- selective elevation;
- meaningful overlap;
- visualized data;
- product-specific states.

Do not duplicate components to make pages feel different. Do not flatten page composition to maximize component reuse.

## Depth roles

Use the shared visual system to support four possible depth roles:

- canvas;
- grounded workspace;
- focus or emphasis;
- transient overlay.

Component elevation must reflect one of these relationships.

Avoid universal shadow tokens applied to all cards. Avoid the opposite failure mode where every element is visually coplanar.

## Surface expression

The design-system primitives support different expression levels:

- public surfaces: expressive composition and brand storytelling;
- learner surfaces: motivating, media-rich, and progress-led;
- educator and institution surfaces: precise, dense, and layered;
- control plane: restrained, high-trust, and state-focused.

The same primitive can appear within materially different compositions.

## Package entry points

Applications use the v2 aggregate stylesheet:

```ts
import { Button, DataTable, Field, TextInput } from "@veza/ui";
import "@veza/ui/system.css";
```

`system.css` loads the compatibility layer followed by v2 component corrections. New application shells should not import `styles.css` directly.

The web and control-plane applications place the shared system in an explicit CSS cascade layer so product feature CSS cannot accidentally redefine base component geometry through import order alone.

## Primitive ownership

Application code consumes `@veza/ui`, not raw primitive libraries.

Inside `@veza/ui`:

- Radix UI owns complex accessible interaction mechanics where appropriate.
- shadcn source patterns may be selectively adapted when they improve component architecture.
- Lucide supplies the shared line icon vocabulary.
- native HTML remains preferred where it provides stronger semantics with less abstraction.

Veza owns all visual styling, variants, tokens, density, and product-specific composition.

Default third-party themes are not a design source of truth.

## Density

Set `data-veza-density` on the stable application shell:

- `comfortable` is the default staff workspace density;
- `compact` is for high-volume records and operating consoles;
- `reduced` increases control, row, and text sizing for learner and simplified experiences.

Density changes control and row geometry through shared tokens. Feature CSS must not independently shrink icon or text alignment inside a control.

Density is not the same as visual weight. A compact surface can still have strong contrast and hierarchy.

## Institution accents

Use `institutionAccentVariables()` before applying an institution accent. It validates hexadecimal input and returns a black or white foreground with the stronger WCAG contrast ratio.

```ts
const style = institutionAccentVariables("#4f46e5");
```

Do not apply institution accents to critical, warning, success, information, or identity-trust states.

## Component catalogue

The design-system catalogue is mounted at `/design-system` in the web application. It exercises components under:

- comfortable, compact, and reduced density;
- high contrast;
- institution accent changes;
- right-to-left direction;
- long institutional language;
- reduced motion;
- desktop and mobile layouts;
- icon-only and icon-plus-label action geometry;
- loading, disabled, error, and destructive states.

Production access is disabled unless `VEZA_ENABLE_DESIGN_SYSTEM_CATALOGUE=true`.

## Quality commands

```bash
pnpm --filter @veza/ui typecheck
pnpm --filter @veza/ui test
pnpm --filter @veza/ui test:a11y
pnpm --filter @veza/ui test:visual
node --test apps/web/tests/ui-ux-contracts.test.mjs
```

Visual baselines are updated intentionally with:

```bash
UPDATE_VISUAL_BASELINES=true pnpm --filter @veza/ui test:visual
```

Baseline changes require design review and an explanation in the pull request.
