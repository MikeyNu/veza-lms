export type TenantId = string & { readonly __tenantId: unique symbol };
export type UserId = string & { readonly __userId: unique symbol };

export interface RequestContext {
  readonly tenantId: TenantId;
  readonly actorId: UserId;
  readonly correlationId: string;
  readonly membershipId: string;
  readonly locale: string;
  readonly timezone: string;
}

export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly tenantId: TenantId;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly occurredAt: string;
  readonly actorId: UserId;
  readonly correlationId: string;
  readonly payload: Readonly<TPayload>;
}
