// Tema: Hooks personalizados + Fetching con loading/error/data.
import { useEffect, useState } from "react";

// `peticion` es una funcion que regresa una promesa (ej. () => API.categoria(id)).
// `deps` decide cuando se vuelve a pedir, igual que en useEffect.
export function useApi(peticion, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);

    peticion()
      .then((res) => {
        if (!cancelado) setData(res);
      })
      .catch((err) => {
        if (!cancelado) setError(err.message);
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}
