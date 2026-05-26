import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type FeedbackRow = {
  id: string;
  created_at: string;
  benefit_id: string;
  user_email: string | null;
  comment: string;
  benefit_title: string | null;
  issuer_name: string | null;
  merchant_name: string | null;
};

export function Feedback() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("benefit_feedback")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
        } else {
          setRows((data ?? []) as FeedbackRow[]);
        }
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-stone-400 text-sm">
        Cargando feedback…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500 text-sm">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-stone-200 shrink-0">
        <span className="text-sm font-medium text-stone-700">Feedback de usuarios</span>
        <span className="text-xs text-stone-400">{rows.length} registros</span>
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-stone-400 text-sm">
          Sin feedback todavía.
        </div>
      ) : (
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-stone-500 whitespace-nowrap">Fecha</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-stone-500 whitespace-nowrap">Usuario</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-stone-500 whitespace-nowrap">Emisor</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-stone-500 whitespace-nowrap">Merchant</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-stone-500 whitespace-nowrap">Beneficio</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-stone-500">Comentario</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={`border-b border-stone-100 align-top ${i % 2 === 0 ? "bg-white" : "bg-stone-50"}`}
                >
                  <td className="px-4 py-2 text-stone-500 whitespace-nowrap text-xs">
                    {new Date(row.created_at).toLocaleString("es-CL", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2 text-stone-600 whitespace-nowrap text-xs">
                    {row.user_email ?? <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-stone-600 whitespace-nowrap text-xs">
                    {row.issuer_name ?? <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-stone-600 whitespace-nowrap text-xs">
                    {row.merchant_name ?? <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-stone-600 text-xs max-w-[160px] truncate">
                    {row.benefit_title ?? <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-stone-800 text-xs max-w-[320px]">
                    {row.comment}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
