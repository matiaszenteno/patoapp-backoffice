import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setError("Credenciales incorrectas.");
      setLoading(false);
      return;
    }

    if (data.user?.app_metadata?.role !== "admin") {
      await supabase.auth.signOut();
      setError("No tienes acceso al backoffice.");
      setLoading(false);
      return;
    }

    setLoading(false);
    navigate("/inicio");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-8">
        <h1 className="mb-1 text-2xl font-bold text-stone-900">🐥 Backoffice</h1>
        <p className="mb-6 text-sm text-stone-500">Solo para administradores de Patoapp</p>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700" htmlFor="email">
              Email
            </label>
            <input
              autoComplete="email"
              autoFocus
              className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-300 text-stone-900 placeholder:text-stone-300"
              id="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              type="email"
              value={email}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700" htmlFor="password">
              Contraseña
            </label>
            <input
              autoComplete="current-password"
              className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-300 text-stone-900 placeholder:text-stone-300"
              id="password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={password}
            />
          </div>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <button
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
