import { useEffect, useRef, useState } from "react";
import { selectCls } from "../lib/styles";
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capturesLoading, setCapturesLoading] = useState(false);
  const [refreshingPaths, setRefreshingPaths] = useState<Set<string>>(() => new Set());
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(() => new Set());
  const imageRetryCounts = useRef<Record<string, number>>({});

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
        setLoadError(queryError.message);
        setLoading(false);
        return;
      }

      const feedbackRows = (data ?? []) as AppFeedbackRow[];
      setRows(feedbackRows);
      setLoading(false);

      // El bucket es privado: las capturas solo se ven con signed URL. La policy
      // de SELECT sobre storage.objects ya autoriza al dev que está logueado.
      const paths = Array.from(new Set(feedbackRows.flatMap((row) => row.image_paths ?? [])));
      if (paths.length === 0) return;

      setCapturesLoading(true);
      const { data: signed, error: signedUrlError } = await supabase.storage
        .from("app-feedback")
        .createSignedUrls(paths, 60 * 60);
      if (!active) return;

      setCapturesLoading(false);
      if (signedUrlError || !signed) {
        setCaptureError(`No se pudieron cargar las capturas: ${signedUrlError?.message ?? "respuesta vacía del storage"}`);
        return;
      }

      const urls: Record<string, string> = {};
      for (const item of signed) {
        if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
      }
      setSignedUrls(urls);
      if (Object.keys(urls).length !== paths.length) {
        setCaptureError("No se pudieron cargar algunas capturas adjuntas.");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const updateStatus = async (id: string, status: Status) => {
    const previousStatus = rows.find((row) => row.id === id)?.status;
    if (!previousStatus || previousStatus === status) return;

    setUpdateError(null);
    setUpdatingIds((current) => new Set(current).add(id));
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status } : row)));
    const { error: statusUpdateError } = await supabase
      .from("app_feedback")
      .update({ status })
      .eq("id", id)
      .select("id")
      .single();
    if (statusUpdateError) {
      setRows((current) => current.map((row) => (
        row.id === id && row.status === status ? { ...row, status: previousStatus } : row
      )));
      setUpdateError(`No se pudo actualizar el estado: ${statusUpdateError.message}`);
    }
    setUpdatingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const refreshSignedUrl = async (path: string) => {
    setRefreshingPaths((current) => new Set(current).add(path));
    setSignedUrls((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });

    const { data, error: signedUrlError } = await supabase.storage
      .from("app-feedback")
      .createSignedUrl(path, 60 * 60);

    if (signedUrlError || !data?.signedUrl) {
      setCaptureError(`No se pudo renovar una captura: ${signedUrlError?.message ?? "respuesta vacía del storage"}`);
    } else {
      setSignedUrls((current) => ({ ...current, [path]: data.signedUrl }));
    }

    setRefreshingPaths((current) => {
      const next = new Set(current);
      next.delete(path);
      return next;
    });
  };

  const handleImageError = (path: string) => {
    const retries = imageRetryCounts.current[path] ?? 0;
    if (retries >= 1) {
      setSignedUrls((current) => {
        const next = { ...current };
        delete next[path];
        return next;
      });
      setCaptureError("No se pudo mostrar una de las capturas adjuntas.");
      return;
    }

    imageRetryCounts.current[path] = retries + 1;
    void refreshSignedUrl(path);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-stone-400 text-sm">
        Cargando comentarios…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full text-red-500 text-sm">
        Error: {loadError}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-stone-200 shrink-0">
        <span className="text-sm font-medium text-stone-700">Comentarios sobre la app</span>
        <span className="text-xs text-stone-400">{rows.length} registros</span>
      </div>

      {updateError ? (
        <div className="mx-6 mt-4 flex items-start justify-between gap-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          <span>{updateError}</span>
          <button className="shrink-0 font-medium hover:text-red-900" onClick={() => setUpdateError(null)} type="button">
            Cerrar
          </button>
        </div>
      ) : null}

      {captureError ? (
        <div className="mx-6 mt-4 flex items-start justify-between gap-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          <span>{captureError}</span>
          <button className="shrink-0 font-medium hover:text-amber-950" onClick={() => setCaptureError(null)} type="button">
            Cerrar
          </button>
        </div>
      ) : null}

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
                <th className="text-left px-4 py-2 text-xs font-medium text-stone-500 whitespace-nowrap">Capturas</th>
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
                              onError={() => handleImageError(path)}
                              onLoad={() => {
                                imageRetryCounts.current[path] = 0;
                              }}
                              src={signedUrls[path]}
                            />
                          </a>
                        ) : (
                          <span className="text-stone-400 text-xs" key={path}>
                            {capturesLoading || refreshingPaths.has(path) ? "Cargando…" : "No disponible"}
                          </span>
                        ),
                      )}
                      {(row.image_paths ?? []).length === 0 ? (
                        <span className="text-stone-300 text-xs">—</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <select
                      aria-label={`Estado del comentario de ${row.user_email ?? "usuario anónimo"}`}
                      className={`${selectCls} !px-2 !py-1 !text-xs disabled:cursor-wait disabled:opacity-60`}
                      disabled={updatingIds.has(row.id)}
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
