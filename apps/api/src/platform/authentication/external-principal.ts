export interface ExternalPrincipal {
  readonly issuer: string;
  readonly subject: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly platformRoles: readonly string[];
  readonly authenticationMethods: readonly string[];
  readonly issuedAt: string;
}
