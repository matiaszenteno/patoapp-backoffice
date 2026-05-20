import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import type { LatLng } from "leaflet";
import { supabase } from "../lib/supabase";

type LocationRow = {
  id: string;
  label: string;
  address: string;
  latitude: string;
  longitude: string;
};

type MerchantRow = {
  id: string;
  name: string;
  location_count: number;
};

const DEFAULT_LAT = -33.4489;
const DEFAULT_LNG = -70.6693;

const inputCls =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500";

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function DraggableMarker({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker>(null);
  useMapEvents({});

  return (
    <Marker
      draggable
      eventHandlers={{
        dragend() {
          const marker = markerRef.current;
          if (marker) {
            const pos: LatLng = marker.getLatLng();
            onChange(pos.lat, pos.lng);
          }
        },
      }}
      position={[lat, lng]}
      ref={markerRef}
    />
  );
}

function LocationEditor({
  location,
  merchantId,
  onSaved,
  onDeleted,
  isNew,
}: {
  location: LocationRow;
  merchantId: string;
  onSaved: (updated: LocationRow) => void;
  onDeleted: (id: string) => void;
  isNew?: boolean;
}) {
  const [draft, setDraft] = useState(location);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const lat = parseFloat(draft.latitude) || DEFAULT_LAT;
  const lng = parseFloat(draft.longitude) || DEFAULT_LNG;

  const validateCoords = (): string | null => {
    const latVal = parseFloat(draft.latitude);
    const lngVal = parseFloat(draft.longitude);
    if (draft.latitude.trim() === "" || isNaN(latVal)) return "Latitud requerida";
    if (latVal < -90 || latVal > 90) return "Latitud debe estar entre -90 y 90";
    if (draft.longitude.trim() === "" || isNaN(lngVal)) return "Longitud requerida";
    if (lngVal < -180 || lngVal > 180) return "Longitud debe estar entre -180 y 180";
    return null;
  };

  const handleSave = async () => {
    const coordError = validateCoords();
    if (coordError) { setError(coordError); return; }
    setSaving(true);
    setError(null);
    setSuccess(false);

    if (isNew) {
      const { data, error: err } = await supabase
        .from("merchant_locations")
        .insert({
          merchant_id: merchantId,
          label: draft.label || null,
          address: draft.address || null,
          latitude: lat,
          longitude: lng,
          source: "manual",
          source_reference: crypto.randomUUID(),
        })
        .select("id, label, address, latitude, longitude")
        .single();

      setSaving(false);
      if (err || !data) {
        setError(err?.message ?? "Error al crear");
      } else {
        onSaved({
          id: data.id as string,
          label: (data.label as string) ?? "",
          address: (data.address as string) ?? "",
          latitude: String(data.latitude ?? ""),
          longitude: String(data.longitude ?? ""),
        });
        setSuccess(true);
      }
    } else {
      const { error: err } = await supabase
        .from("merchant_locations")
        .update({ label: draft.label || null, address: draft.address || null, latitude: lat, longitude: lng })
        .eq("id", draft.id);

      setSaving(false);
      if (err) {
        setError(err.message);
      } else {
        onSaved(draft);
        setSuccess(true);
      }
    }
  };

  const handleDelete = async () => {
    if (!confirm("¿Eliminar esta ubicación?")) return;
    const { error: err } = await supabase.from("merchant_locations").delete().eq("id", draft.id);
    if (err) setError(err.message);
    else onDeleted(draft.id);
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Nombre del local</label>
          <input
            className={inputCls}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            placeholder="ej: Sucursal Providencia"
            value={draft.label}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Dirección</label>
          <input
            className={inputCls}
            onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
            placeholder="ej: Av. Providencia 1234"
            value={draft.address}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Latitud</label>
          <input
            className={inputCls}
            onChange={(e) => setDraft((d) => ({ ...d, latitude: e.target.value }))}
            placeholder="-33.4489"
            type="number"
            value={draft.latitude}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Longitud</label>
          <input
            className={inputCls}
            onChange={(e) => setDraft((d) => ({ ...d, longitude: e.target.value }))}
            placeholder="-70.6693"
            type="number"
            value={draft.longitude}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg" style={{ height: 260 }}>
        <MapContainer
          center={[lat, lng]}
          key={`${draft.id}-${lat.toFixed(4)}-${lng.toFixed(4)}`}
          style={{ height: "100%", width: "100%" }}
          zoom={15}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <DraggableMarker
            lat={lat}
            lng={lng}
            onChange={(newLat, newLng) =>
              setDraft((d) => ({ ...d, latitude: newLat.toFixed(6), longitude: newLng.toFixed(6) }))
            }
          />
        </MapContainer>
      </div>

      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : success ? (
        <p className="text-xs text-emerald-600">Guardado.</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          disabled={saving}
          onClick={handleSave}
          type="button"
        >
          {saving ? "Guardando..." : isNew ? "Agregar" : "Guardar"}
        </button>
        {!isNew && (
          <button className="text-sm text-red-500 hover:underline" onClick={handleDelete} type="button">
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

function MerchantCard({ merchant }: { merchant: MerchantRow }) {
  const [expanded, setExpanded] = useState(false);
  const [locations, setLocations] = useState<LocationRow[] | null>(null);
  const [loadingLocs, setLoadingLocs] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [opLoading, setOpLoading] = useState(false);
  const [opResult, setOpResult] = useState<{ ok?: boolean; runUrl?: string; error?: string } | null>(null);
  const [locCount, setLocCount] = useState(merchant.location_count);

  const EMPTY_LOC: LocationRow = {
    id: "new",
    label: "",
    address: "",
    latitude: String(DEFAULT_LAT),
    longitude: String(DEFAULT_LNG),
  };

  const handleExpand = async () => {
    setExpanded((prev) => !prev);
    if (locations !== null) return;
    setLoadingLocs(true);
    const { data } = await supabase
      .from("merchant_locations")
      .select("id, label, address, latitude, longitude")
      .eq("merchant_id", merchant.id)
      .order("label", { ascending: true, nullsFirst: false });

    setLoadingLocs(false);
    if (data) {
      setLocations(
        data.map((l) => ({
          id: l.id as string,
          label: (l.label as string) ?? "",
          address: (l.address as string) ?? "",
          latitude: String(l.latitude ?? ""),
          longitude: String(l.longitude ?? ""),
        })),
      );
    }
  };

  const handleSaved = (updated: LocationRow) => {
    setLocations((prev) => {
      if (!prev) return [updated];
      const idx = prev.findIndex((l) => l.id === updated.id);
      if (idx === -1) {
        setLocCount((c) => c + 1);
        return [...prev, updated];
      }
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
    setShowNewForm(false);
  };

  const handleDeleted = (id: string) => {
    setLocations((prev) => (prev ?? []).filter((l) => l.id !== id));
    setLocCount((c) => Math.max(0, c - 1));
  };

  const handleActualizarUbicaciones = async () => {
    setOpLoading(true);
    setOpResult(null);
    const token = await getToken();
    if (!token) { setOpResult({ error: "No autenticado." }); setOpLoading(false); return; }

    const { data, error } = await supabase.functions.invoke("refresh-merchant-locations", {
      body: { merchantIds: [merchant.id], force: true },
      headers: { Authorization: `Bearer ${token}` },
    });

    setOpLoading(false);
    if (error) {
      setOpResult({ error: error.message });
    } else {
      setOpResult({ ok: true, runUrl: (data as Record<string, unknown>)?.runUrl as string | undefined });
      setLocations(null);
    }
  };

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white transition-colors ${
        expanded ? "border-teal-200" : "border-gray-200"
      }`}
    >
      <button
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50"
        onClick={handleExpand}
        type="button"
      >
        <span className="font-medium text-gray-900">{merchant.name}</span>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {locCount} {locCount === 1 ? "ubicación" : "ubicaciones"}
          </span>
          <span className="text-gray-400">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className={`border-t p-5 ${expanded ? "border-teal-100" : "border-gray-100"}`}>
          <div className="flex flex-col gap-6">
            {/* Ubicaciones */}
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-gray-700">Ubicaciones</h3>

              {loadingLocs ? (
                <p className="text-sm text-gray-400">Cargando ubicaciones...</p>
              ) : (
                <>
                  {(locations ?? []).map((loc) => (
                    <LocationEditor
                      key={loc.id}
                      location={loc}
                      merchantId={merchant.id}
                      onDeleted={handleDeleted}
                      onSaved={handleSaved}
                    />
                  ))}

                  {(locations ?? []).length === 0 && (
                    <p className="text-sm text-gray-400">Sin ubicaciones registradas.</p>
                  )}

                  {showNewForm ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Nueva ubicación
                      </p>
                      <LocationEditor
                        isNew
                        location={EMPTY_LOC}
                        merchantId={merchant.id}
                        onDeleted={() => setShowNewForm(false)}
                        onSaved={(newLoc) => { handleSaved(newLoc); setShowNewForm(false); }}
                      />
                    </div>
                  ) : (
                    <button
                      className="self-start text-sm font-medium text-teal-700 hover:underline"
                      onClick={() => setShowNewForm(true)}
                      type="button"
                    >
                      + Agregar ubicación
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Operaciones */}
            <div className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4">
              <h3 className="text-sm font-semibold text-gray-700">Operaciones</h3>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-gray-500">
                  Busca y actualiza las coordenadas de este merchant usando su dirección. Útil cuando se agregan o modifican ubicaciones.
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    className="rounded-lg border border-teal-600 px-4 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-60"
                    disabled={opLoading}
                    onClick={handleActualizarUbicaciones}
                    type="button"
                  >
                    {opLoading ? "Actualizando..." : "Actualizar ubicaciones"}
                  </button>
                </div>
                {opResult?.error && (
                  <p className="mt-1 text-xs text-red-600">{opResult.error}</p>
                )}
                {opResult?.ok && (
                  <div className="mt-1">
                    <p className="text-xs text-emerald-700">Actualización iniciada correctamente.</p>
                    {opResult.runUrl && (
                      <a className="text-xs text-teal-600 underline" href={opResult.runUrl} rel="noreferrer" target="_blank">
                        Ver progreso →
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Merchants() {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [filtered, setFiltered] = useState<MerchantRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("merchants")
      .select("id, name, merchant_locations(id)")
      .order("name")
      .then(({ data }) => {
        if (!data) return;
        const rows = data.map((m) => ({
          id: m.id as string,
          name: m.name as string,
          location_count: Array.isArray(m.merchant_locations) ? (m.merchant_locations as unknown[]).length : 0,
        }));
        setMerchants(rows);
        setFiltered(rows);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    setFiltered(q ? merchants.filter((m) => m.name.toLowerCase().includes(q)) : merchants);
  }, [query, merchants]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Merchants</h1>
        <p className="mt-0.5 text-sm text-gray-500">Gestiona ubicaciones y operaciones por merchant.</p>
      </div>

      <input
        className={`${inputCls} w-full`}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar merchant por nombre..."
        type="search"
        value={query}
      />

      {loading ? (
        <p className="text-sm text-gray-400">Cargando...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((m) => (
            <MerchantCard key={m.id} merchant={m} />
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-gray-400">Sin resultados</p>
          )}
        </div>
      )}
    </div>
  );
}
