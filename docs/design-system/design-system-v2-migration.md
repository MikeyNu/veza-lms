# Veza Design System v2 migration

Status: active migration

Date: 8 August 2026

## 1. Objective

Design System v2 replaces fragile hand-rolled interaction mechanics and inconsistent route-local component geometry with a controlled component architecture built around proven primitives.

The objective is not to restyle Veza as shadcn, Radix or another third-party product. The objective is to retain the Veza Brand CI and product-specific visual grammar while delegating difficult interaction mechanics to mature libraries.

The target stack is:

```text
Next.js 16
React 19
Tailwind CSS 4
@veza/ui
Veza Brand CI tokens
Radix UI primitives
selectively adapted shadcn patterns
Lucide iconography
```

## 2. Problems this migration addresses

The previous shared system implemented too many low-level behaviors directly. This created several system-wide risks:

- icon and label alignment depended on arbitrary child geometry
- custom SVG icons used inconsistent optical sizing and a 1.8px stroke instead of the Brand CI 2px rule
- dialogs, drawers and popovers manually managed focus, dismissal and keyboard behavior
- tabs manually implemented roving focus and arrow-key navigation
- comboboxes manually implemented outside-click and active-option behavior
- several UI components used Unicode glyphs as action icons
- feature styles could override shared component rules based only on CSS import order
- the TypeScript token object and design documentation contained stale palette values
- component tests asserted implementation details instead of user-observable behavior

These defects are systemic. Route-local margin or padding patches are therefore prohibited as a substitute for correcting the shared primitive.

## 3. Architectural boundary

### 3.1 Application-facing API

Product applications import components from `@veza/ui`.

Preferred:

```tsx
import { Button, Dialog, Tabs, TextInput } from "@veza/ui";
```

Avoid in feature code:

```tsx
import { Dialog } from "radix-ui";
```

A direct primitive import in a feature requires a documented reason showing why the requirement does not belong in the shared system.

### 3.2 Internal primitive layer

Inside `@veza/ui`, use the simplest reliable primitive for the behavior.

Radix UI is preferred for:

- dialogs
- alert dialogs
- drawers and sheets built on dialog behavior
- popovers
- dropdown menus
- tooltips
- tabs
- checkboxes
- radio groups
- switches
- select-like composite interactions where the Radix contract matches the product requirement
- toast infrastructure where it remains appropriate for the current Radix release

Native HTML remains preferred for:

- text input
- textarea
- ordinary select when a native select is sufficient
- table
- progress
- file input
- semantic headings, sections and lists

A component is not improved merely by adding a library abstraction.

## 4. shadcn policy

shadcn is treated as a source and composition reference, not as Veza's visual system.

A shadcn component may be adapted when:

1. it solves a real Veza interaction requirement;
2. its underlying accessibility model is sound;
3. the source can be expressed through Veza tokens and public APIs;
4. it does not force card-heavy or generic SaaS composition;
5. it does not duplicate an existing Veza primitive without clear benefit.

Do not copy default shadcn page compositions into Veza. In particular, do not use `Card` as the automatic section boundary, do not introduce generic pill tabs, and do not import third-party theme colours as product colours.

## 5. Icon system

Lucide is the shared implementation vocabulary because its line geometry is compatible with the Brand CI.

Veza rules override library defaults where necessary:

- icons originate on a 24px grid
- stroke width is 2px
- joins and caps remain rounded
- inline control icons normally render at 16px or 18px for optical balance
- standalone/navigation icons render at 20px or 24px according to context
- icon-only buttons have a fixed square control box
- button icons use a dedicated icon slot instead of margin hacks
- icons never determine control height
- decorative icons use `aria-hidden`
- icon-only actions require an accessible label
- Unicode arrows, crosses, magnifiers, file symbols and similar stand-ins are not product icons

The app-facing icon map may preserve semantic names such as `search`, `bell` or `calendar`, but those names resolve to shared Lucide components.

## 6. Brand CI contracts

### Colour

Default primary actions and active product states use Indigo 600 `#4F46E5` through the validated institution accent role.

Supporting Brand CI colours:

- Purple 600 `#7C3AED`
- Blue 500 `#3B82F6`
- Teal 500 `#14B8A6`

Semantic roles:

- success `#22C55E`
- warning `#F59E0B`
- critical `#EF4444`
- information `#3B82F6`
- semantic purple `#8B5CF6`

A supporting brand colour is not permission to create a multi-colour dashboard. Colour must have a task or semantic role.

### Typography

Satoshi is authoritative. Operational components use the Brand CI scale and line-height contracts. Controls align through defined line boxes and control heights rather than arbitrary top/bottom padding.

### Shape

The shared geometry scale is intentionally restrained:

- tile radius: 6px
- control radius: 8px
- panel radius: 12px
- overlay radius: 14px
- pills only where semantics justify pill geometry

### Control sizing

Base control geometry:

- small: 34px
- medium: 40px
- large: 46px

Reduced-density learner contexts may increase those values through the density token system.

## 7. Component quality contract

Every reusable component must be assessed against all relevant states before it is considered complete.

### Actions

Buttons must cover:

- text only
- leading icon
- trailing icon
- both icons where semantically justified
- icon only through `IconButton`
- loading
- disabled
- focus-visible
- long labels
- compact density
- reduced density
- RTL

The label and icon must remain optically centered at every size.

### Fields

Fields must cover:

- label
- optional marker
- description
- placeholder
- validation error
- disabled
- read-only where applicable
- long labels
- long localized content
- keyboard focus
- autofill/browser UI where applicable

### Overlays

Overlays must cover:

- focus entry
- focus return
- Escape dismissal when permitted
- outside interaction behavior
- modal/non-modal semantics
- scroll containment
- portal/z-index behavior
- small-screen layout
- long content
- reduced motion
- destructive action treatment

### Data

Dense data surfaces must preserve comparison. Mobile adaptation should not convert every table row into an unrelated card. Horizontal scroll is acceptable when column comparison is essential.

## 8. CSS cascade contract

Both product applications use named CSS cascade layers.

The order is:

```text
theme
base
components
veza-system
veza-shell
veza-features
veza-reference
utilities
```

`@veza/ui/system.css` owns base shared component geometry. Feature CSS may compose a component into a page layout, but it should not redefine shared button, field, icon or overlay internals.

A reference-specific style may intentionally refine composition, but recurring refinements must be promoted back into `@veza/ui` rather than copied route by route.

## 9. Migration sequence

The migration is performed in controlled stages:

1. align Brand CI token sources
2. formalize CSS cascade layers
3. add dependency and utility foundation
4. migrate action primitives and icon system
5. migrate overlays
6. migrate tabs and choice controls
7. harden combobox and command interactions
8. replace glyph icons in data, uploads and authoring
9. update component tests around behavior and design contracts
10. expand the design-system catalogue
11. audit feature-level raw controls and obsolete overrides
12. perform route-by-route visual and interaction QA

Each stage is committed independently so regressions can be isolated.

## 10. Quality gates

A shared-system change is not complete until applicable checks pass:

```bash
pnpm --filter @veza/ui typecheck
pnpm --filter @veza/ui test
pnpm --filter @veza/ui test:a11y
pnpm --filter @veza/ui build
pnpm --filter @veza/web build
pnpm --filter @veza/control-plane build
node --test apps/web/tests/ui-ux-contracts.test.mjs
```

Visual regression requires intentional baseline review. A successful compilation is not visual signoff.

## 11. Non-goals

Design System v2 does not:

- replace Veza with default shadcn styling
- introduce Chakra UI, Material UI or another competing theme system
- turn existing screens into card grids
- weaken production security or authorization boundaries
- force complex workflows into dialogs
- replace native controls merely to increase dependency usage
- introduce a new colour system
- use route-specific CSS nudges to hide a shared primitive defect

## 12. Superseded guidance

Older design audit documents may describe teal as the global primary colour. That statement is superseded by the approved Brand CI, `packages/ui/src/tokens.css`, and this document.

Historical audit observations about task hierarchy, anti-card-wall composition, accessibility, density and responsive behavior remain valid unless a newer source explicitly replaces them.
