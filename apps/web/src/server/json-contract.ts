export type JsonRecord = Readonly<Record<string, unknown>>;

export function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

export function requireRecord(value: unknown, label: string): JsonRecord {
  const record = asRecord(value);
  if (!record) throw new Error(`${label} did not match the API contract`);
  return record;
}

export function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} did not match the API contract`);
  return value;
}

export function optionalArray(value: unknown, label: string): readonly unknown[] {
  return value === undefined || value === null ? [] : requireArray(value, label);
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} did not match the API contract`);
  }
  return value;
}

export function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${label} did not match the API contract`);
  return value;
}

export function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} did not match the API contract`);
  }
  return value;
}

export function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return requireNumber(value, label);
}

export function requireInteger(value: unknown, label: string): number {
  const number = requireNumber(value, label);
  if (!Number.isInteger(number)) throw new Error(`${label} did not match the API contract`);
  return number;
}

export function optionalInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return requireInteger(value, label);
}

export function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} did not match the API contract`);
  return value;
}

export function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  return requireBoolean(value, label);
}

export function requireStringArray(value: unknown, label: string): readonly string[] {
  return requireArray(value, label).map((item, index) =>
    requireString(item, `${label}[${index}]`),
  );
}

export function optionalStringArray(value: unknown, label: string): readonly string[] {
  return optionalArray(value, label).map((item, index) =>
    requireString(item, `${label}[${index}]`),
  );
}

export function requireRecordArray(value: unknown, label: string): readonly JsonRecord[] {
  return requireArray(value, label).map((item, index) =>
    requireRecord(item, `${label}[${index}]`),
  );
}

export function optionalRecordArray(value: unknown, label: string): readonly JsonRecord[] {
  return optionalArray(value, label).map((item, index) =>
    requireRecord(item, `${label}[${index}]`),
  );
}

export function requireOneOf<const TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  label: string,
): TValue {
  if (typeof value !== "string" || !allowed.includes(value as TValue)) {
    throw new Error(`${label} did not match the API contract`);
  }
  return value as TValue;
}
