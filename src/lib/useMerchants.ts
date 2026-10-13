import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Merchant = { id: string; name: string };

// El listado se comparte entre el editor de la ficha y el resumen de solo lectura, que están
// montados a la vez. Se cachea a nivel de módulo para no disparar dos requests idénticos por
// cada raw que el operador abre; el catálogo no cambia dentro de una sesión de clasificación.
let cache: Promise<Merchant[]> | null = null;

function fetchMerchants(): Promise<Merchant[]> {
  if (!cache) {
    cache = Promise.resolve(
      supabase.from("merchants").select("id, name").order("name"),
    ).then(({ data, error }) => {
      // Un fallo no se cachea: la próxima ficha vuelve a intentar en vez de quedar sin
      // catálogo para toda la sesión.
      if (error) {
        cache = null;
        throw new Error(error.message);
      }
      return (data ?? []) as Merchant[];
    });
  }
  return cache;
}

export function useMerchants() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchMerchants()
      .then((rows) => {
        if (!active) return;
        setMerchants(rows);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { error, loading, merchants };
}
