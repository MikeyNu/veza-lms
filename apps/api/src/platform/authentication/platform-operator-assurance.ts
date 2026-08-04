export const PLATFORM_OPERATOR_ROLE = "veza:platform-operator";

interface AssuranceClaims {
  readonly platformRoles: readonly string[];
  readonly authenticationMethods: readonly string[];
}

export function requiredPlatformOperatorMethods(): readonly string[] {
  const configured = process.env.PLATFORM_OPERATOR_REQUIRED_AMR ?? "mfa";
  const methods = configured
    .split(",")
    .map((method) => method.trim())
    .filter(Boolean);
  return methods.length > 0 ? methods : ["mfa"];
}

export function hasPlatformOperatorAssurance(claims: AssuranceClaims): boolean {
  return claims.platformRoles.includes(PLATFORM_OPERATOR_ROLE)
    && requiredPlatformOperatorMethods().every((method) => claims.authenticationMethods.includes(method));
}
