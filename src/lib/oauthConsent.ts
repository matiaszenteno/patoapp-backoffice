// Pantalla de consentimiento del servidor OAuth de Supabase Auth (decisión 0024 de
// patoapp). Un cliente de chat que se conecta al MCP de campañas envía aquí al
// admin para que apruebe el acceso con su propia sesión.

/** Ruta interna a la que volver después del login. Rechaza URLs externas. */
export function safeNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}

export function consentLoginPath(authorizationId: string): string {
  const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

/** Permisos pedidos, en palabras. Supabase usa los scopes de OpenID. */
export function describeScopes(scope: string): string[] {
  const labels: Record<string, string> = {
    openid: "Confirmar tu identidad",
    email: "Ver tu correo",
    profile: "Ver tu nombre",
  };
  return scope
    .split(/\s+/)
    .filter(Boolean)
    .map((item) => labels[item] ?? item);
}

/** Host al que vuelve el cliente: lo único verificable de su identidad. */
export function redirectHost(redirectUri: string): string {
  try {
    return new URL(redirectUri).host;
  } catch {
    return redirectUri;
  }
}
