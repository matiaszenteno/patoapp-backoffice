import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const DEV_EMAILS = [
  "c.mansillabrito@gmail.com",
  "nicolas.canalespm@gmail.com",
  "cristobal.a.garridov@gmail.com",
  "matiaszentenoco@gmail.com",
];

const DEV_PASSWORD = import.meta.env.VITE_DEV_PASSWORD as string | undefined;

export function Login() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();
    const isDev = DEV_EMAILS.includes(normalizedEmail) && !!DEV_PASSWORD;

    if (isDev) {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: DEV_PASSWORD!,
      });
      setLoading(false);
      if (authError) {
        setError(authError.message);
      } else {
        navigate("/clasificacion");
      }
    } else {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: window.location.origin },
      });
      setLoading(false);
      if (authError) {
        setError(authError.message);
      } else {
        setError("Te enviamos un link mágico a tu email.");
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-8">
        <h1 className="mb-1 text-2xl font-bold text-stone-900">🐥 Backoffice</h1>
        <p className="mb-6 text-sm text-stone-500">Solo para desarrolladores de Patoapp</p>

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

          {error ? (
            <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
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
