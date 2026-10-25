import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { consentLoginPath, describeScopes, redirectHost } from "../lib/oauthConsent";

type Details = {
  authorization_id: string;
  redirect_uri: string;
  client: { name: string; uri: string };
  user: { email: string };
  scope: string;
};

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "consent"; details: Details }
  | { kind: "redirecting" };

// Consentimiento del servidor OAuth de Supabase Auth: un cliente de chat (MCP de
// campañas) pide actuar con la sesión de este admin. Aprobar no da más permisos
// que los del admin; el backend sigue verificando el rol en cada acción.
export function OAuthConsent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const authorizationId = params.get("authorization_id");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    if (!authorizationId) {
      setState({ kind: "error", message: "Falta authorization_id en el enlace." });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.app_metadata?.role !== "admin") {
        navigate(consentLoginPath(authorizationId), { replace: true });
        return;
      }
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (cancelled) return;
      if (error || !data) {
        setState({ kind: "error", message: error?.message ?? "No se encontró la autorización." });
        return;
      }
      if ("redirect_url" in data) {
        // Ya habías aprobado este cliente: vuelve directo.
        setState({ kind: "redirecting" });
        window.location.assign(data.redirect_url);
        return;
      }
      setState({ kind: "consent", details: data as Details });
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizationId, navigate]);

  const decide = async (approve: boolean) => {
    if (!authorizationId) return;
    setDeciding(true);
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (error || !data?.redirect_url) {
      setDeciding(false);
      setState({ kind: "error", message: error?.message ?? "No se pudo registrar tu decisión." });
      return;
    }
    setState({ kind: "redirecting" });
    window.location.assign(data.redirect_url);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-8">
        <h1 className="mb-4 text-xl font-bold text-stone-900">Autorizar acceso</h1>

        {state.kind === "loading" && <p className="text-sm text-stone-500">Cargando...</p>}
        {state.kind === "redirecting" && <p className="text-sm text-stone-500">Volviendo a la aplicación...</p>}
        {state.kind === "error" && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>
        )}

        {state.kind === "consent" && (
          <div className="flex flex-col gap-4 text-sm text-stone-700">
            <p>
              <span className="font-semibold text-stone-900">{state.details.client.name || "Una aplicación"}</span>{" "}
              quiere operar campañas de Pato con tu cuenta{" "}
              <span className="font-medium">{state.details.user.email}</span>.
            </p>
            <p>
              Podrá crear borradores, enviar pruebas, aprobar, enviar y leer resultados con tus mismos permisos de
              admin. Volverá a <span className="font-mono">{redirectHost(state.details.redirect_uri)}</span>.
            </p>
            <ul className="list-disc pl-5 text-stone-600">
              {describeScopes(state.details.scope).map((label) => <li key={label}>{label}</li>)}
            </ul>
            <p className="text-xs text-stone-500">
              Si no iniciaste esta conexión desde tu cliente de chat, rechaza.
            </p>
            <div className="flex gap-3">
              <button
                className="rounded-md bg-stone-900 px-5 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
                disabled={deciding}
                onClick={() => void decide(true)}
                type="button"
              >
                Aprobar
              </button>
              <button
                className="rounded-md border border-stone-300 px-5 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                disabled={deciding}
                onClick={() => void decide(false)}
                type="button"
              >
                Rechazar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
