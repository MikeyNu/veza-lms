# Veza product UI principles

## Source of truth

UI decisions follow this order:

1. Current explicit product requirements.
2. Supplied reference screenshots.
3. Approved Veza Brand CI and shared design tokens.
4. Product and technical architecture.
5. Existing high-quality Veza patterns.
6. `@veza/ui` component contracts.
7. Platform conventions and design judgment.

The Brand CI is not a loose theme. Its typography, colour roles, icon geometry and control language are product contracts.

## Product shell

The top bar contains institution switching, permission-aware search, contextual creation, notifications and support. Stable applications live in the left navigation. Object-level navigation uses a context rail. An inspector appears only for properties, learner context, review or history.

The shell must remain quieter than the active workspace. It establishes location and access context without competing with the dominant task.

The desktop shell follows the supplied references:

- deep slate navigation surface
- indigo selected navigation state
- approximately 14.5rem navigation width at the reference desktop scale
- approximately 4rem top bar height
- search and institution context before utility actions
- consistent 24px-grid line iconography
- no decorative shell gradients, glow or background grid

## Complex minimalism and selective bento

A bento surface must answer a decision, expose a meaningful state or lead directly to a workflow. Size reflects priority. Long records use tables, timelines, registers or canvases. Borders, spacing and typography create structure. Shadows are reserved for real layering and intentionally raised reference surfaces.

Do not wrap every section in a card. Use seamless page regions when the content is part of one continuous task. Use a bordered panel when the region owns an independent decision, state or interaction boundary.

The page architecture must be selected from the user task before selecting components.

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

Indigo is the default product primary for actions, selected states and active learning states. Purple, blue and teal are supporting Brand CI colours and must not become competing page-level action systems. Semantic colours remain reserved for their actual meanings.

Institution branding may alter a constrained accent token after contrast validation. It may not redefine semantic status colours, the dark shell, accessible focus treatment or hierarchy of primary actions.

## Typography

Satoshi is the application typeface. The Brand CI scale is authoritative:

- Display 1: Bold 56/64
- Display 2: Bold 40/48
- Heading 1: SemiBold 28/36
- Heading 2: SemiBold 22/28
- Heading 3: Medium 18/24
- Body 1: Regular 16/24
- Body 2: Regular 14/20
- Small: Regular 12/16

Operational screens should normally use the Heading 1 through Small range. Display sizes are reserved for contexts that genuinely require editorial scale. Control labels must not be vertically centered by arbitrary padding. Their line boxes and control geometry are defined by `@veza/ui`.

## Iconography

Veza uses one coherent line icon language:

- 24px source grid
- 2px stroke
- rounded joins and caps
- consistent optical sizing
- no Unicode glyphs used as substitute interface icons
- no route-local hand-drawn SVG sets when a supported shared icon exists

Application code should use the shared Veza icon layer. Icon-only controls require an accessible name. Icons in buttons are aligned through the shared button icon slot and never through route-specific margin nudges.

## Component architecture

Applications import product components from `@veza/ui`.

`@veza/ui` owns:

- Brand CI token mapping
- variants and component geometry
- accessible interaction wrappers
- icon sizing
- density
- focus treatment
- responsive component behavior
- loading, empty, error and disabled states

Radix UI primitives may be used inside `@veza/ui` for complex interaction mechanics. Select shadcn patterns may be adapted as owned Veza source when they improve reliability or composition. Neither Radix nor shadcn default visual styling is a product source of truth.

Feature modules should not import Radix directly unless there is a documented component-system exception.

## Layout and responsive behavior

Desktop layouts use the full available content width while preserving readable line length inside text regions. A screen may use a dominant canvas with a context rail or inspector when those secondary regions support the current task.

Tablet layouts remove sticky behavior before columns become compressed. Inspectors and governance actions move below the dominant task. Filter bars reflow into intentional rows rather than forcing controls into narrow columns.

Mobile layouts follow task order, not desktop column order. The next action or blocker appears before supporting context. Tables remain horizontally scrollable when comparison is essential. Card grids become ruled lists when card treatment no longer adds useful grouping.

## Metrics and evidence

Every metric must state what it measures, what records it includes and when it was generated or updated. Unreleased marks, future activities and inaccessible records must not be implied by a summary.

Progress interfaces must use authoritative completion evidence. Privacy-sensitive workspaces must render a truthful withheld or unavailable state instead of an invented empty dashboard.

## Accessibility and motion

Controls require persistent labels, keyboard access, visible focus and explicit status language. Colour never carries meaning alone. Touch targets remain usable at mobile widths. Reduced-motion preferences remove non-essential transitions without changing task order or state communication.

Complex composite behavior should use proven accessible primitives rather than reimplementing focus management, dismissal, keyboard navigation or portal behavior independently in each feature.
