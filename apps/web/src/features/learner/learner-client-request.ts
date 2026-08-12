function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function responseRecord(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return recordValue(JSON.parse(text)) ?? {};
  } catch {
    return {};
  }
}

function errorMessage(record: Readonly<Record<string, unknown>>, fallback: string): string {
  const value = record.message;
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

export async function requestJsonRecord(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackError: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(input, init);
  const body = await responseRecord(response);
  if (!response.ok) throw new Error(errorMessage(body, fallbackError));
  return body;
}

export async function postLearnerCommand(
  operation: string,
  input: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  return requestJsonRecord(
    `/api/learner/${encodeURIComponent(operation)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    "The learner action could not be completed.",
  );
}

export async function postAcademicCommand(
  operation: string,
  input: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  return requestJsonRecord(
    `/api/academic/${encodeURIComponent(operation)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    "The academic action could not be completed.",
  );
}
