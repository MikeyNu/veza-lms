export interface ComponentContract {
  readonly name: string;
  readonly category: "actions" | "forms" | "data" | "overlays" | "feedback" | "navigation" | "authoring";
  readonly density: readonly ("comfortable" | "compact" | "reduced")[];
  readonly keyboard: readonly string[];
  readonly semantics: readonly string[];
}

export const vezaComponentContracts: readonly ComponentContract[] = Object.freeze([
  { name: "Button", category: "actions", density: ["comfortable", "compact", "reduced"], keyboard: ["Enter and Space activate"], semantics: ["Native button", "aria-busy while loading"] },
  { name: "Combobox", category: "forms", density: ["comfortable", "compact"], keyboard: ["Arrow keys move active option", "Enter selects", "Escape restores selection", "Home and End jump"], semantics: ["role=combobox", "aria-expanded", "aria-controls", "aria-activedescendant", "role=listbox and option"] },
  { name: "DataTable", category: "data", density: ["comfortable", "compact"], keyboard: ["Native checkbox and button behaviour", "Sort controls are in the tab order"], semantics: ["Native table with caption", "scope=col", "aria-sort", "indeterminate selection"] },
  { name: "Tabs", category: "navigation", density: ["comfortable", "compact"], keyboard: ["Arrow keys move", "Home and End jump", "Tab enters the active panel"], semantics: ["tablist", "tab", "tabpanel", "aria-selected", "aria-controls"] },
  { name: "Dialog", category: "overlays", density: ["comfortable", "compact", "reduced"], keyboard: ["Escape closes", "Focus enters on open", "Native modal focus containment"], semantics: ["Native dialog", "aria-labelledby", "aria-describedby"] },
  { name: "Drawer", category: "overlays", density: ["comfortable", "compact"], keyboard: ["Escape closes", "Focus enters on open"], semantics: ["Native modal dialog", "Named region"] },
  { name: "Popover", category: "overlays", density: ["comfortable", "compact"], keyboard: ["Escape closes", "Tab remains within the open surface"], semantics: ["aria-haspopup=dialog", "aria-expanded", "role=dialog"] },
  { name: "Toast", category: "feedback", density: ["comfortable", "compact"], keyboard: ["Dismiss and optional action are keyboard reachable"], semantics: ["role=status for routine feedback", "role=alert for critical feedback"] },
  { name: "CommandPalette", category: "navigation", density: ["comfortable", "compact"], keyboard: ["Ctrl or Command K opens", "Arrow keys move", "Enter runs", "Escape closes"], semantics: ["Modal dialog", "combobox", "listbox", "option"] },
  { name: "FileUpload", category: "forms", density: ["comfortable", "compact"], keyboard: ["Choose files button provides the non-drag path", "Remove actions are named"], semantics: ["Native file input", "Errors announced with role=alert", "Progress uses progress element"] },
  { name: "StructuredContent", category: "authoring", density: ["comfortable", "reduced"], keyboard: ["Every move action has button alternatives", "Enter and Space select blocks", "Formatting toolbar is keyboard reachable"], semantics: ["Typed block metadata", "role=textbox for editable content", "aria-multiline"] },
]);
