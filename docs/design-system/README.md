# Veza shared interface system

The `@veza/ui` package is the authoritative reusable component layer for institution workspaces and the control plane. It implements the interaction and accessibility contracts described in the product and technical architecture.

## Design principles

1. Preserve one dominant task area.
2. Use cards only for distinct decisions, metrics or self-contained workflows.
3. Use tables for dense records and timelines for historical evidence.
4. Prefer spacing, rules and typography before elevation.
5. Reserve shadows for dialogs, drawers, popovers, combobox lists and toasts.
6. Apply the institution accent only to selected, active and primary-action states.
7. Keep platform-danger, warning and success colours outside institution branding.
8. Use explicit status language alongside colour.

The completed application audit, screen-family matrix and release gates are documented in [`ui-ux-audit.md`](./ui-ux-audit.md).

## Package entry points

```ts
import { Button, DataTable, Field, TextInput } from "@veza/ui";
import "@veza/ui/styles.css";
```

Institution and control-plane global styles import the shared stylesheet before app-specific layout styles. Existing shells remain application-owned.

## Density

Set `data-veza-density` on the stable application shell:

- `comfortable` is the default staff workspace density.
- `compact` is for high-volume records and operating consoles.
- `reduced` increases control, row and text sizing for learner and simplified experiences.

## Institution accents

Use `institutionAccentVariables()` before applying an institution accent. It validates hexadecimal input and returns a black or white foreground with the stronger WCAG contrast ratio.

```ts
const style = institutionAccentVariables("#0d9488");
```

Do not apply institution accents to critical, warning, success or identity-trust states.

## Component catalogue

The equivalent of Storybook is mounted at `/design-system` in the web application. It exercises components under:

- comfortable, compact and reduced density
- high contrast
- institution accent changes
- right-to-left direction
- long institutional language
- reduced motion
- desktop and mobile layouts

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
