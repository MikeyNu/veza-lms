# Veza product UI principles

## Product shell

The top bar contains institution switching, permission-aware search, contextual creation, notifications and support. Stable applications live in the left navigation. Object-level navigation uses a context rail. An inspector appears only for properties, learner context, review or history.

The shell must remain quieter than the active workspace. It establishes location and access context without competing with the dominant task.

## Bento minimalism

A bento surface must answer a decision, expose a meaningful state or lead directly to a workflow. Size reflects priority. Long records use tables, timelines, registers or canvases. Borders, spacing and typography create structure. Shadows are reserved for transient layers.

Do not wrap every section in a card. Use seamless page regions when the content is part of one continuous task. Use a bordered panel when the region owns an independent decision, state or interaction boundary.

## Global colour ownership

The shared application colour system is intentionally narrow:

- ink: `#0B1220`
- canvas: `#F4F6F3`
- surface: `#FFFFFF`
- primary brand and learning action: `#0D9488`
- primary brand strong: `#0F766E`
- information: `#2563EB`
- warning: `#A35F00`
- critical: `#B4233B`
- success: `#14804A`

Teal owns primary actions, active navigation, progress and selected learning states. Blue is semantic information only. Warning, critical and success colours are reserved for their corresponding system meanings.

Institution branding may alter a constrained accent token after contrast validation. It may not redefine semantic status colours, the dark shell, accessible focus treatment or the hierarchy of primary actions.

## Layout and responsive behaviour

Desktop layouts use the full available content width while preserving readable line length inside text regions. A screen may use a dominant canvas with a context rail or inspector when those secondary regions support the current task.

Tablet layouts remove sticky behaviour before columns become compressed. Inspectors and governance actions move below the dominant task. Filter bars reflow into intentional rows rather than forcing controls into narrow columns.

Mobile layouts follow task order, not desktop column order. The next action or blocker appears before supporting context. Tables remain horizontally scrollable when comparison is essential. Card grids become ruled lists when the card treatment no longer adds useful grouping.

## Metrics and evidence

Every metric must state what it measures, what records it includes and when it was generated or updated. Unreleased marks, future activities and inaccessible records must not be implied by a summary.

Progress interfaces must use authoritative completion evidence. Privacy-sensitive workspaces must render a truthful withheld or unavailable state instead of an invented empty dashboard.

## Accessibility and motion

Controls require persistent labels, keyboard access, visible focus and explicit status language. Colour never carries meaning alone. Touch targets remain usable at mobile widths. Reduced-motion preferences remove non-essential transitions without changing task order or state communication.
