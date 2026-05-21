import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import type { LatLng } from "leaflet";
import { supabase } from "../lib/supabase";
import { inputCls } from "../lib/styles";

type LocationRow = {
  id: string;
  label: string;
  address: string;
  latitude: string;
  longitude: string;
  source: string;
};

type MerchantRow = {
  id: string;
  addresses_resolved_at: string | null;
  image_url: string | null;
  name: string;
  normalized_name: string;
  location_count: number;
  location_sources: Record<string, number>;
  scraped_addresses: Array<{ address?: string; captured_at?: string; source?: string }>;
};

const DEFAULT_LAT = -33.4489;
const DEFAULT_LNG = -70.6693;

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
        .select("id, label, address, latitude, longitude, source")
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
          source: (data.source as string) ?? "manual",
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
      {!isNew && (
        <div>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {draft.source}
          </span>
        </div>
      )}
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
  const [draftMerchant, setDraftMerchant] = useState({
    image_url: merchant.image_url ?? "",
    name: merchant.name,
    normalized_name: merchant.normalized_name,
  });
  const [locations, setLocations] = useState<LocationRow[] | null>(null);
  const [loadingLocs, setLoadingLocs] = useState(false);
  const [merchantSaving, setMerchantSaving] = useState(false);
  const [merchantResult, setMerchantResult] = useState<string | null>(null);
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
    source: "manual",
  };

  const handleExpand = async () => {
    setExpanded((prev) => !prev);
    if (locations !== null) return;
    setLoadingLocs(true);
    const { data } = await supabase
      .from("merchant_locations")
      .select("id, label, address, latitude, longitude, source")
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
          source: (l.source as string) ?? "manual",
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

  const handleSaveMerchant = async () => {
    const name = draftMerchant.name.trim();
    const normalizedName = draftMerchant.normalized_name.trim();
    if (!name || !normalizedName) {
      setMerchantResult("Nombre y normalized_name son requeridos.");
      return;
    }
    setMerchantSaving(true);
    setMerchantResult(null);
    const { error } = await supabase
      .from("merchants")
      .update({
        image_url: draftMerchant.image_url.trim() || null,
        name,
        normalized_name: normalizedName,
      })
      .eq("id", merchant.id);
    setMerchantSaving(false);
    setMerchantResult(error ? error.message : "Merchant guardado.");
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
        <span className="flex min-w-0 items-center gap-3">
          {merchant.image_url ? (
            <img alt="" className="h-9 w-9 rounded-md border border-gray-100 object-cover" src={merchant.image_url} />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-100 text-xs text-gray-400">
              —
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium text-gray-900">{merchant.name}</span>
            <span className="block truncate text-xs text-gray-400">{merchant.normalized_name}</span>
          </span>
        </span>
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
            <div className="flex flex-col gap-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
              <h3 className="text-sm font-semibold text-gray-700">Datos del merchant</h3>
              <div className="flex flex-col gap-4 md:flex-row">
                <div className="h-24 w-32 overflow-hidden rounded-lg border border-gray-200 bg-white">
                  {draftMerchant.image_url.trim() ? (
                    <img alt="" className="h-full w-full object-cover" src={draftMerchant.image_url.trim()} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-400">Sin foto</div>
                  )}
                </div>
                <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                    Nombre
                    <input
                      className={inputCls}
                      onChange={(e) => setDraftMerchant((d) => ({ ...d, name: e.target.value }))}
                      value={draftMerchant.name}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                    Normalized name
                    <input
                      className={inputCls}
                      onChange={(e) => setDraftMerchant((d) => ({ ...d, normalized_name: e.target.value }))}
                      value={draftMerchant.normalized_name}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 md:col-span-2">
                    URL de imagen
                    <input
                      className={inputCls}
                      onChange={(e) => setDraftMerchant((d) => ({ ...d, image_url: e.target.value }))}
                      placeholder="https://..."
                      value={draftMerchant.image_url}
                    />
                  </label>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span>addresses_resolved_at: {merchant.addresses_resolved_at ? new Date(merchant.addresses_resolved_at).toLocaleString("es-CL") : "pendiente"}</span>
                {Object.entries(merchant.location_sources).map(([source, count]) => (
                  <span className="rounded-full bg-white px-2 py-0.5" key={source}>{source}: {count}</span>
                ))}
              </div>
              {merchant.scraped_addresses.length > 0 && (
                <div className="rounded-lg bg-white p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Direcciones scrapeadas</p>
                  <div className="flex flex-col gap-1">
                    {merchant.scraped_addresses.map((entry, index) => (
                      <div className="text-xs text-gray-600" key={`${entry.address ?? index}-${index}`}>
                        {entry.address ?? "—"}
                        {entry.source ? <span className="ml-2 text-gray-400">({entry.source})</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                  disabled={merchantSaving}
                  onClick={handleSaveMerchant}
                  type="button"
                >
                  {merchantSaving ? "Guardando..." : "Guardar merchant"}
                </button>
                {merchantResult && (
                  <span className={`text-xs ${merchantResult.includes("guardado") ? "text-emerald-700" : "text-red-600"}`}>
                    {merchantResult}
                  </span>
                )}
              </div>
            </div>

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
      .select("id, name, normalized_name, image_url, scraped_addresses, addresses_resolved_at, merchant_locations(id,source)")
      .order("name")
      .then(({ data }) => {
        if (!data) return;
        const rows = data.map((m) => {
          const locations = Array.isArray(m.merchant_locations) ? (m.merchant_locations as Array<{ source?: string | null }>) : [];
          const locationSources = locations.reduce<Record<string, number>>((acc, loc) => {
            const source = loc.source || "manual";
            acc[source] = (acc[source] ?? 0) + 1;
            return acc;
          }, {});
          return {
          id: m.id as string,
          addresses_resolved_at: m.addresses_resolved_at as string | null,
          image_url: m.image_url as string | null,
          name: m.name as string,
          normalized_name: m.normalized_name as string,
          location_count: locations.length,
          location_sources: locationSources,
          scraped_addresses: Array.isArray(m.scraped_addresses)
            ? (m.scraped_addresses as MerchantRow["scraped_addresses"])
            : [],
        };
        });
        setMerchants(rows);
        setFiltered(rows);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    setFiltered(q ? merchants.filter((m) =>
      m.name.toLowerCase().includes(q) || m.normalized_name.toLowerCase().includes(q)
    ) : merchants);
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
