# Veza shared interface system

The `@veza/ui` package is the authoritative reusable component layer for institution workspaces and the control plane. It implements the interaction, visual and accessibility contracts described in the product and technical architecture.

The current system is Design System v2. The migration rationale and primitive ownership rules are documented in [`design-system-v2-migration.md`](./design-system-v2-migration.md).

## Design principles

1. Preserve one dominant task area.
2. Use cards only for distinct decisions, metrics or self-contained workflows.
3. Use tables for dense records and timelines for historical evidence.
4. Prefer spacing, rules and typography before decoration.
5. Use elevation only when a surface is meaningfully raised or transient.
6. Apply the institution accent only through validated role tokens.
7. Keep critical, warning, success and information colours outside institution branding.
8. Use explicit status language alongside colour.
9. Use one shared icon language with a 24px source grid and 2px stroke.
10. Do not implement route-local fixes for shared component geometry.

The completed application audit, screen-family matrix and release gates are documented in [`ui-ux-audit.md`](./ui-ux-audit.md). Palette statements in that older audit are historical where they conflict with the approved Brand CI and current `tokens.css`.

## Package entry points

Applications use the v2 aggregate stylesheet:

```ts
import { Button, DataTable, Field, TextInput } from "@veza/ui";
import "@veza/ui/system.css";
```

`system.css` loads the compatibility layer followed by the v2 component corrections. New application shells should not import `styles.css` directly.

The web and control-plane applications place the shared system in an explicit CSS cascade layer so product feature CSS cannot accidentally redefine base component geometry through import order alone.

## Primitive ownership

Application code consumes `@veza/ui`, not raw primitive libraries.

Inside `@veza/ui`:

- Radix UI owns complex accessible interaction mechanics where appropriate.
- shadcn source patterns may be selectively adapted when they improve a component architecture.
- Lucide supplies the shared line icon vocabulary.
- native HTML remains preferred where it provides the strongest semantics and behavior with less abstraction.

Veza owns all visual styling, variants, tokens, density and product-specific composition. Default third-party themes are not imported as a design language.

## Density

Set `data-veza-density` on the stable application shell:

- `comfortable` is the default staff workspace density.
- `compact` is for high-volume records and operating consoles.
- `reduced` increases control, row and text sizing for learner and simplified experiences.

Density changes control and row geometry through shared tokens. Feature CSS must not independently shrink icon or text alignment inside a control.

## Institution accents

Use `institutionAccentVariables()` before applying an institution accent. It validates hexadecimal input and returns a black or white foreground with the stronger WCAG contrast ratio.

```ts
const style = institutionAccentVariables("#4f46e5");
```

Do not apply institution accents to critical, warning, success, information or identity-trust states.

## Component catalogue

The design-system catalogue is mounted at `/design-system` in the web application. It exercises components under:

- comfortable, compact and reduced density
- high contrast
- institution accent changes
- right-to-left direction
- long institutional language
- reduced motion
- desktop and mobile layouts
- icon-only and icon-plus-label action geometry
- loading, disabled, error and destructive states

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
