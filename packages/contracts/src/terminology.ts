export type CanonicalTerminologyKey =
  | "learner"
  | "staff"
  | "guardian"
  | "sponsor"
  | "programme"
  | "qualification"
  | "learning-path"
  | "subject"
  | "module"
  | "course"
  | "grade"
  | "year"
  | "level"
  | "cohort"
  | "class"
  | "academic-period"
  | "outcome"
  | "competency";

export type TerminologyLifecycle = "draft" | "in_review" | "approved" | "retired";

export interface TerminologyEntry {
  readonly canonicalKey: CanonicalTerminologyKey;
  readonly singularLabel: string;
  readonly pluralLabel: string;
  readonly shortLabel?: string;
  readonly helpText?: string;
}

export interface ProgrammeHierarchyLevel {
  readonly levelOrder: number;
  readonly canonicalType: Extract<CanonicalTerminologyKey,
    "programme" | "qualification" | "learning-path" | "subject" | "module" | "course" | "grade" | "year" | "level">;
  readonly singularLabel: string;
  readonly pluralLabel: string;
  readonly isRequired: boolean;
  readonly minimumOccurrences: number;
  readonly maximumOccurrences?: number;
}

export interface TerminologyVersion {
  readonly id: string;
  readonly institutionId: string;
  readonly locale: string;
  readonly versionNumber: number;
  readonly lifecycle: TerminologyLifecycle;
  readonly title: string;
  readonly description?: string;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly version: number;
  readonly entries: readonly TerminologyEntry[];
  readonly programmeHierarchy: readonly ProgrammeHierarchyLevel[];
}

export interface ResolvedInstitutionTerminology {
  readonly institutionId: string;
  readonly requestedLocale: string;
  readonly resolvedLocale: string;
  readonly terminologyVersionId?: string;
  readonly effectiveAt: string;
  readonly labels: Readonly<Record<CanonicalTerminologyKey, Readonly<{
    singular: string;
    plural: string;
    short?: string;
  }>>>;
  readonly programmeHierarchy: readonly ProgrammeHierarchyLevel[];
}
