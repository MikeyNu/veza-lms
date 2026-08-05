# Keyboard and screen-reader contracts

These contracts are mandatory for shared components and module-specific compositions.

## Actions and links

- Native buttons activate with Enter and Space.
- Links represent navigation and preserve browser link behaviour.
- Icon-only buttons require an accessible name.
- Loading actions expose `aria-busy` and remain disabled until completion.

## Fields and validation

- Every field has a persistent visible label.
- Descriptions use `aria-describedby`.
- Invalid controls use `aria-invalid` and `aria-errormessage`.
- Validation summaries use `role="alert"` and link to affected controls.
- Related controls use `fieldset` and `legend`.

## Combobox

- Down Arrow and Up Arrow move the active option.
- Home and End move to the first and last enabled option.
- Enter selects the active option.
- Escape closes and restores the selected label.
- Tab closes without trapping focus.
- The input exposes `role="combobox"`, `aria-expanded`, `aria-controls` and `aria-activedescendant`.
- The options surface uses `listbox` and `option` roles.

## Tabs

- Arrow keys move among enabled tabs.
- Home and End move to the first and last enabled tabs.
- The active tab is the only tab in the sequential tab order.
- Tabs expose `tablist`, `tab`, `tabpanel`, `aria-selected` and `aria-controls`.

## Dialogs and drawers

- Native modal dialogs contain focus while open.
- Escape closes unless the workflow explicitly blocks dismissal.
- Focus enters the first interactive control.
- The title and description are programmatically associated.
- Destructive dialogs include visible consequence language.

## Popovers

- The trigger exposes expanded state and the controlled surface.
- Escape and outside-pointer interaction close the surface.
- Tab remains within the open bounded surface when it behaves as a dialog.

## Data tables

- Tables contain a caption, scoped headers and explicit sort state.
- Sort controls are native buttons.
- Selection checkboxes have row-specific names.
- Partial selection uses the native indeterminate state.
- Row actions remain keyboard reachable.

## Command palette

- Ctrl K and Command K toggle the palette.
- Down Arrow and Up Arrow move through enabled commands.
- Enter runs the active command.
- Escape closes the palette.
- Search uses combobox semantics with a listbox result set.

## File upload

- Drag and drop is supplementary.
- A native file input and named Choose files button are always present.
- Validation failures use an alert region.
- Upload progress uses the native progress element.
- Every selected file has an independently named removal action.

## Structured content

- Blocks are typed and programmatically named.
- Enter and Space can select a block.
- Move Up and Move Down buttons are required even when drag sorting exists.
- Formatting controls use `aria-pressed`.
- Editable regions use `role="textbox"` and `aria-multiline` when applicable.
- Save, offline, conflict and failure states use status or alert semantics.
