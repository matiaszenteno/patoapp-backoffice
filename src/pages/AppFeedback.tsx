import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Status = "new" | "triaged" | "done";

type AppFeedbackRow = {
  id: string;
  created_at: string;
  user_email: string | null;
  topic: "bug" | "idea" | "benefit_data" | "other";
  message: string;
  image_paths: string[];
  app_version: string | null;
  platform: string | null;
  os_version: string | null;
  status: Status;
};

const TOPIC_LABELS: Record<AppFeedbackRow["topic"], string> = {
  bug: "Problema",
  idea: "Idea",
  benefit_data: "Datos beneficio",
  other: "Otro",
};

const TOPIC_STYLES: Record<AppFeedbackRow["topic"], string> = {
  bug: "bg-red-50 text-red-700",
  idea: "bg-blue-50 text-blue-700",
  benefit_data: "bg-amber-50 text-amber-700",
  other: "bg-stone-100 text-stone-600",
};

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "new", label: "Nuevo" },
  { value: "triaged", label: "Revisado" },
  { value: "done", label: "Cerrado" },
];

export function AppFeedback() {
  const [rows, setRows] = useState<AppFeedbackRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data, error: queryError } = await supabase
        .from("app_feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (!active) return;

      if (queryError) {
        setError(queryError.message);
        setLoading(false);
        return;
      }

      const feedbackRows = (data ?? []) as AppFeedbackRow[];
      setRows(feedbackRows);
      setLoading(false);

      // El bucket es privado: las capturas solo se ven con signed URL. La policy
      // de SELECT sobre storage.objects ya autoriza al dev que está logueado.
      const paths = feedbackRows.flatMap((row) => row.image_paths ?? []);
      if (paths.length === 0) return;

      const { data: signed } = await supabase.storage
        .from("app-feedback")
        .createSignedUrls(paths, 60 * 60);
      if (!active || !signed) return;

      const urls: Record<string, string> = {};
      for (const item of signed) {
        if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
      }
      setSignedUrls(urls);
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const updateStatus = async (id: string, status: Status) => {
    const previous = rows;
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status } : row)));
    const { error: updateError } = await supabase
      .from("app_feedback")
      .update({ status })
      .eq("id", id);
    if (updateError) {
      setRows(previous);
      setError(updateError.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-stone-400 text-sm">
        Cargando comentarios…
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
        <span className="text-sm font-medium text-stone-700">Comentarios sobre la app</span>
        <span className="text-xs text-stone-400">{rows.length} registros</span>
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-stone-400 text-sm">
          Sin comentarios todavía.
        </div>
      ) : (
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-stone-500 whitespace-nowrap">Fecha</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-stone-500 whitespace-nowrap">Usuario</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-stone-500 whitespace-nowrap">Tema</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-stone-500 whitespace-nowrap">App</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-stone-500">Comentario</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-stone-500 whitespace-nowrap">Imagen</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-stone-500 whitespace-nowrap">Estado</th>
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
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded text-xs ${TOPIC_STYLES[row.topic]}`}>
                      {TOPIC_LABELS[row.topic]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-stone-500 whitespace-nowrap text-xs">
                    {row.platform ?? "—"} {row.app_version ?? ""}
                    {row.os_version ? <span className="text-stone-400"> · {row.os_version}</span> : null}
                  </td>
                  <td className="px-4 py-2 text-stone-800 text-xs max-w-[420px] whitespace-pre-wrap">
                    {row.message}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {(row.image_paths ?? []).map((path) =>
                        signedUrls[path] ? (
                          <a href={signedUrls[path]} key={path} rel="noreferrer" target="_blank">
                            <img
                              alt="Captura adjunta"
                              className="h-12 w-12 object-cover rounded border border-stone-200"
                              src={signedUrls[path]}
                            />
                          </a>
                        ) : (
                          <span className="text-stone-300 text-xs" key={path}>…</span>
                        ),
                      )}
                      {(row.image_paths ?? []).length === 0 ? (
                        <span className="text-stone-300 text-xs">—</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <select
                      className="text-xs border border-stone-200 rounded px-1.5 py-1 bg-white text-stone-600"
                      onChange={(event) => void updateStatus(row.id, event.target.value as Status)}
                      value={row.status}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
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
