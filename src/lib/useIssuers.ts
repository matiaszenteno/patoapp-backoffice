import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Issuer = { slug: string; name: string };

// Origen único de la lista de emisores: la tabla `issuers` en Supabase.
// Evita listas hardcodeadas y desincronizadas en cada página del backoffice.
export function useIssuers() {
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase
      .from("issuers")
      .select("slug, name")
      .order("name")
      .then(({ data }) => {
        if (!active) return;
        setIssuers((data as Issuer[] | null) ?? []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { issuers, loading };
}
