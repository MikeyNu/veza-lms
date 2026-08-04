export type Effect = "allow" | "deny";
export type ScopeType = "tenant" | "institution" | "campus" | "programme" | "course" | "cohort" | "self";

export interface PolicyAssignment {
  readonly effect: Effect;
  readonly permission: string;
  readonly scopeType: ScopeType;
  readonly scopeId: string;
  readonly conditions?: Readonly<Record<string, string | number | boolean>>;
}

export function hasPermission(assignments: readonly PolicyAssignment[], permission: string, scopeType: ScopeType, scopeId: string): boolean {
  const relevant = assignments.filter((item) => item.permission === permission && item.scopeType === scopeType && item.scopeId === scopeId);
  if (relevant.some((item) => item.effect === "deny")) return false;
  return relevant.some((item) => item.effect === "allow");
}
