import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const PAGE_SIZE = 20;

type BenefitRow = {
  id: string;
  title: string;
  merchant_name: string | null;
  issuer_name: string | null;
  status: string;
  ends_at: string | null;
};

export function BenefitsList() {
  const [benefits, setBenefits] = useState<BenefitRow[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async (search: string, pageIndex: number, replace: boolean) => {
    setLoading(true);

    let q = supabase
      .from("benefits")
      .select("id, title, status, ends_at, issuers(name), merchants(name)")
      .order("updated_at", { ascending: false })
      .range(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE - 1);

    if (search.trim()) {
      q = q.ilike("title", `%${search.trim()}%`);
    }

    const { data, error } = await q;
    setLoading(false);

    if (error) {
      setQueryError(error.message);
      return;
    }
    if (!data) return;

    const rows = data.map((b) => ({
      id: b.id as string,
      title: b.title as string,
      merchant_name: (b.merchants as unknown as { name: string } | null)?.name ?? null,
      issuer_name: (b.issuers as unknown as { name: string } | null)?.name ?? null,
      status: b.status as string,
      ends_at: b.ends_at as string | null,
    }));

    setBenefits((prev) => (replace ? rows : [...prev, ...rows]));
    setHasMore(rows.length === PAGE_SIZE);
  }, []);

  useEffect(() => {
    setPage(0);
    load(query, 0, true);
  }, [query, load]);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    load(query, next, false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Beneficios</h1>
        <Link
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          to="/benefits/new"
        >
          + Nuevo beneficio
        </Link>
      </div>

      {queryError ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Error:</strong> {queryError}
        </div>
      ) : null}

      <input
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por título o merchant..."
        type="search"
        value={query}
      />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Merchant</th>
              <th className="px-4 py-3">Título</th>
              <th className="px-4 py-3">Emisor</th>
              <th className="px-4 py-3">Vence</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {benefits.map((b) => (
              <tr
                className="cursor-pointer hover:bg-gray-50"
                key={b.id}
                onClick={() => navigate(`/benefits/${b.id}`)}
              >
                <td className="px-4 py-3 font-medium text-gray-900">
                  {b.merchant_name ?? "—"}
                </td>
                <td className="max-w-xs px-4 py-3 text-gray-700">
                  <span className="line-clamp-1">{b.title}</span>
                </td>
                <td className="px-4 py-3 text-gray-500">{b.issuer_name ?? "—"}</td>
                <td className="px-4 py-3 text-gray-500">
                  {b.ends_at ? b.ends_at.substring(0, 10) : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      b.status === "active"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {b.status === "active" ? "activo" : "expirado"}
                  </span>
                </td>
              </tr>
            ))}
            {!loading && benefits.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-gray-400" colSpan={5}>
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && (
        <p className="text-center text-sm text-gray-400">Cargando...</p>
      )}

      {!loading && hasMore && (
        <button
          className="mx-auto text-sm font-medium text-teal-700 hover:underline"
          onClick={handleLoadMore}
          type="button"
        >
          Cargar más
        </button>
      )}
    </div>
  );
}
