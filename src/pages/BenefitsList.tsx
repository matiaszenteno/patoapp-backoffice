import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const PAGE_SIZE = 20;

type BenefitRow = {
  id: string;
  image_url: string | null;
  title: string;
  category_name: string | null;
  merchant_image_url: string | null;
  merchant_name: string | null;
  issuer_name: string | null;
  source_url: string | null;
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

    const base = () => supabase
      .from("benefits")
      .select("id, title, image_url, source_url, status, ends_at, issuers(name), merchants(name,image_url), categories(name)")
      .order("updated_at", { ascending: false });

    let data, error;
    let more = false;

    if (search.trim()) {
      const term = search.trim();
      const [byTitle, byMerchant] = await Promise.all([
        base().ilike("title", `%${term}%`).limit(500),
        supabase
          .from("benefits")
          .select("id, title, image_url, source_url, status, ends_at, issuers(name), merchants!inner(name,image_url), categories(name)")
          .order("updated_at", { ascending: false })
          .ilike("merchants.name", `%${term}%`)
          .limit(500),
      ]);
      if (byTitle.error ?? byMerchant.error) {
        error = byTitle.error ?? byMerchant.error;
      } else {
        const seen = new Set<string>();
        const merged = [...(byTitle.data ?? []), ...(byMerchant.data ?? [])].filter((b) => {
          if (seen.has(b.id as string)) return false;
          seen.add(b.id as string);
          return true;
        });
        const start = pageIndex * PAGE_SIZE;
        data = merged.slice(start, start + PAGE_SIZE);
        more = merged.length > start + PAGE_SIZE;
      }
    } else {
      ({ data, error } = await base().range(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE - 1));
      more = (data?.length ?? 0) === PAGE_SIZE;
    }
    setLoading(false);

    if (error) {
      setQueryError(error.message);
      return;
    }
    if (!data) return;

    const rows = data.map((b) => ({
      id: b.id as string,
      image_url: b.image_url as string | null,
      title: b.title as string,
      category_name: (b.categories as unknown as { name: string } | null)?.name ?? null,
      merchant_image_url: (b.merchants as unknown as { image_url: string | null } | null)?.image_url ?? null,
      merchant_name: (b.merchants as unknown as { name: string } | null)?.name ?? null,
      issuer_name: (b.issuers as unknown as { name: string } | null)?.name ?? null,
      source_url: b.source_url as string | null,
      status: b.status as string,
      ends_at: b.ends_at as string | null,
    }));

    setBenefits((prev) => (replace ? rows : [...prev, ...rows]));
    setHasMore(more);
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
    <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-stone-900">Beneficios</h1>
        <Link
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
          to="/benefits/new"
        >
          + Nuevo beneficio
        </Link>
      </div>

      {queryError ? (
        <div className="rounded-md border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
          <strong>Error:</strong> {queryError}
        </div>
      ) : null}

      <input
        className="rounded-md border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-300 text-stone-900 placeholder:text-stone-300"
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por título o merchant..."
        type="search"
        value={query}
      />

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Foto</th>
              <th className="px-4 py-3">Merchant</th>
              <th className="px-4 py-3">Título</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Emisor</th>
              <th className="px-4 py-3">Vence</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {benefits.map((b) => (
              <tr
                className="cursor-pointer hover:bg-stone-50"
                key={b.id}
                onClick={() => navigate(`/benefits/${b.id}`)}
              >
                <td className="px-4 py-3">
                  {b.image_url || b.merchant_image_url ? (
                    <img
                      alt=""
                      className="h-12 w-16 rounded-md border border-stone-100 object-cover"
                      src={b.image_url ?? b.merchant_image_url ?? ""}
                    />
                  ) : (
                    <div className="flex h-12 w-16 items-center justify-center rounded-md border border-dashed border-stone-200 text-xs text-stone-300">
                      —
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-medium text-stone-900">
                  {b.merchant_name ?? "—"}
                </td>
                <td className="max-w-xs px-4 py-3 text-stone-700">
                  <span className="line-clamp-1">{b.title}</span>
                  {b.source_url ? (
                    <span className="block truncate text-xs text-stone-400">{b.source_url}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-stone-500">{b.category_name ?? "—"}</td>
                <td className="px-4 py-3 text-stone-500">{b.issuer_name ?? "—"}</td>
                <td className="px-4 py-3 text-stone-500">
                  {b.ends_at ? b.ends_at.substring(0, 10) : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-block rounded bg-stone-100 border border-stone-200 px-2 py-0.5 text-xs text-stone-500">
                    {b.status === "active" ? "activo" : "expirado"}
                  </span>
                </td>
              </tr>
            ))}
            {!loading && benefits.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-stone-400" colSpan={7}>
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && (
        <p className="text-center text-sm text-stone-400">Cargando...</p>
      )}

      {!loading && hasMore && (
        <button
          className="mx-auto text-sm font-medium text-stone-600 hover:underline"
          onClick={handleLoadMore}
          type="button"
        >
          Cargar más
        </button>
      )}
    </div>
  );
}
