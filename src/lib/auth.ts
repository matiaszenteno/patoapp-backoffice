import { supabase } from "./supabase";

/**
 * Devuelve un access_token válido para llamar edge functions, refrescando la
 * sesión si el token ya venció o vence dentro de los próximos 2 minutos.
 *
 * getSession() puede devolver un token stale sin refrescarlo (el auto-refresh
 * corre en un timer que no siempre disparó, p.ej. con la pestaña en segundo
 * plano). Pasar ese token a una edge function provoca 403. Centralizar el
 * refresh acá evita esa clase de bug en todos los call sites.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
  if (expiresAtMs && expiresAtMs < Date.now() + 120_000) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) return null;
    return data.session.access_token;
  }
  return session.access_token;
}
