# Veza design-system quality guardrails

Status: mandatory design and implementation standard.

This document translates the product UI principles into reviewable failure conditions. It is not a visual mood board. A screen passes only when its hierarchy, interaction model, state communication and responsive behaviour are justified by the task.

## 1. Start with the user decision

Every page must identify one dominant task or decision. The title, first content region and primary action must support that task. Supporting metrics, history, help and configuration follow the task rather than competing with it.

Reject a layout when:

- every region has equal visual weight
- the first viewport is mostly decoration or generic summary cards
- the primary action is repeated in several unrelated panels
- the screen cannot explain why each panel exists
- a large empty region remains while relevant data is compressed elsewhere

## 2. Use cards only for real boundaries

A bordered or elevated container is appropriate when the region owns an independent decision, state, interaction or removable unit. Continuous records, timelines, tables, editors and form sequences should normally sit on the page canvas or inside one task surface.

Reject a layout when:

- headings, filters and tables are each placed in separate decorative cards
- nested cards exist only to create depth
- every item uses a rounded container regardless of information type
- shadows are used on permanent page regions
- borders and backgrounds create more hierarchy than the content itself

## 3. Preserve Veza colour ownership

Use the shared tokens documented in `docs/design/ui-principles.md` and `@veza/ui`. Teal owns primary action, active navigation, learning progress and selected learning states. Blue is informational. Warning, critical and success colours keep their semantic meanings.

Reject a layout when:

- multiple bright accent colours are used for unrelated cards
- gradients replace hierarchy or meaning
- status colours are used decoratively
- institution branding overrides focus, status or primary-action semantics
- a component introduces a new hard-coded colour without a documented token decision

## 4. Avoid generic software-as-a-service composition

Veza is an education operating system, not a generic analytics dashboard. Interfaces must reflect academic records, learning work, evidence, governance and institutional operations.

Reject a layout when:

- a page is primarily a row of interchangeable metric cards
- icons replace domain language
- decorative charts appear without a decision or evidence question
- empty states use vague promotional copy instead of the next valid action
- labels such as activity, growth, performance or engagement appear without a defined measure

## 5. Make information density intentional

Use the available page width for operational work. Keep long prose readable, but do not constrain tables, registers, canvases or multi-column administration workspaces to article widths. Dense interfaces require alignment, grouping and progressive disclosure, not excessive whitespace.

Reject a layout when:

- desktop tables are narrower than the data they compare
- important controls are hidden below large decorative headers
- whitespace separates fields that belong to one operation
- mobile simply stacks desktop cards without reconsidering task order
- filters remain sticky after they begin to obscure the active work

## 6. Represent state truthfully

Loading, empty, withheld, unavailable, error and permission-denied states are different. Each must explain what is known, what is not available and the next valid action. Skeletons should resemble the final information structure and must not imply records that may not exist.

Reject a state when:

- an empty state is shown for an upstream error
- access denial is described as no data
- a spinner replaces the entire page without preserving context
- optimistic success is shown before a consequential command is accepted
- unreleased or privacy-restricted data is approximated with invented values

## 7. Keep interaction language explicit

Use verbs that describe the governed result. Consequential operations must state scope, affected records and evidence requirements before confirmation. Bulk actions must remain bounded and must not disguise individual governance decisions as convenience operations.

Reject an interaction when:

- primary buttons use vague labels such as Continue, Submit or Process without context
- destructive or irreversible effects are hidden in helper text
- the same icon performs different operations across workspaces
- confirmation dialogs repeat the button label but do not explain impact
- a disabled control has no reason or recovery path

## 8. Design responsive task order

Desktop may use a dominant canvas with a context rail or inspector. Tablet removes sticky and secondary columns before compression damages usability. Mobile presents the next action or blocker before supporting context.

Reject responsive behaviour when:

- desktop column order is copied directly to mobile
- comparison tables are converted to cards and lose comparison value
- critical actions become icon-only on small screens
- fixed widths create horizontal page overflow
- touch targets, labels or focus states degrade at mobile widths

## 9. Build from shared components without forcing uniformity

Use `@veza/ui` for primitives, semantics and tokens. Shared domain components are appropriate when behaviour, accessibility and data contracts are genuinely common. Do not create one universal card, modal or workspace component with dozens of flags.

Reject implementation when:

- a shared component is copied and renamed instead of reused
- a component has unrelated boolean flags that change its fundamental purpose
- page files duplicate authentication, loading, error or bulk-selection behaviour
- visual consistency depends on repeated literal class strings
- abstraction hides domain language or lifecycle rules

## 10. Review checklist

Before accepting a screen, verify:

1. The dominant task is identifiable in the first viewport.
2. Every container has a structural reason.
3. Colour usage follows Veza semantic ownership.
4. Data labels define their measure and timeframe.
5. Loading, empty, error and permission states remain distinct.
6. Consequential commands show scope, reason and outcome.
7. Keyboard, focus, labels and landmarks are correct.
8. Desktop, tablet and mobile preserve task order.
9. The implementation uses shared primitives without a universal flag-driven component.
10. No decorative element exists only to make the interface appear more complex.
