/* Generated from the Veza OpenAPI 3.1 operation registry. Do not hand-edit. */

export interface VezaApiProblem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly instance?: string;
  readonly correlationId: string;
  readonly timestamp: string;
  readonly errors?: readonly string[];
}

export interface VezaApiClientOptions {
  readonly baseUrl: string;
  readonly accessToken?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  readonly accessToken?: string;
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
  readonly headers?: Readonly<Record<string, string>>;
}

export class VezaApiError extends Error {
  constructor(readonly problem: VezaApiProblem) {
    super(problem.detail);
    this.name = "VezaApiError";
  }
}

export class VezaApiClient {
  private readonly baseUrl: string;
  private readonly accessToken: string | undefined;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: VezaApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.accessToken = options.accessToken;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  search(
    input: {
      readonly query: string;
      readonly entityTypes?: readonly string[];
      readonly institutionId?: string;
      readonly cursor?: string;
      readonly limit?: number;
    },
    options?: RequestOptions,
  ) {
    const query = new URLSearchParams({ query: input.query });
    if (input.entityTypes?.length) query.set("entityTypes", input.entityTypes.join(","));
    if (input.institutionId) query.set("institutionId", input.institutionId);
    if (input.cursor) query.set("cursor", input.cursor);
    if (input.limit) query.set("limit", String(input.limit));
    return this.request<Readonly<Record<string, unknown>>>(`/v1/search?${query}`, {}, options);
  }

  queueNotification(
    input: Readonly<Record<string, unknown>>,
    options: RequestOptions & { readonly idempotencyKey: string },
  ) {
    return this.request<Readonly<Record<string, unknown>>>(
      "/v1/communications/intents",
      { method: "POST", body: JSON.stringify(input) },
      options,
    );
  }

  createMediaUpload(
    input: Readonly<Record<string, unknown>>,
    options: RequestOptions & { readonly idempotencyKey: string },
  ) {
    return this.request<Readonly<Record<string, unknown>>>(
      "/v1/storage/uploads",
      { method: "POST", body: JSON.stringify(input) },
      options,
    );
  }

  completeMediaUpload(
    sessionId: string,
    input: Readonly<Record<string, unknown>>,
    options: RequestOptions & { readonly idempotencyKey: string },
  ) {
    return this.request<Readonly<Record<string, unknown>>>(
      `/v1/storage/upload-sessions/${encodeURIComponent(sessionId)}/complete`,
      { method: "POST", body: JSON.stringify(input) },
      options,
    );
  }

  createMediaDeliveryUrl(assetId: string, rendition?: string, options?: RequestOptions) {
    const query = rendition ? `?rendition=${encodeURIComponent(rendition)}` : "";
    return this.request<{ readonly url: string; readonly expiresAt: string }>(
      `/v1/storage/assets/${encodeURIComponent(assetId)}/delivery${query}`,
      {},
      options,
    );
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    options: RequestOptions | undefined,
  ): Promise<T> {
    const token = options?.accessToken ?? this.accessToken;
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options?.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
        ...options?.headers,
      },
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    const text = await response.text();
    const body = text ? (JSON.parse(text) as T | VezaApiProblem) : undefined;
    if (!response.ok) {
      throw new VezaApiError(
        body as VezaApiProblem ?? {
          type: "about:blank",
          title: "request failed",
          status: response.status,
          code: "request.failed",
          detail: `Veza API returned HTTP ${response.status}`,
          correlationId: response.headers.get("x-correlation-id") ?? "unavailable",
          timestamp: new Date().toISOString(),
        },
      );
    }
    return body as T;
  }
}
