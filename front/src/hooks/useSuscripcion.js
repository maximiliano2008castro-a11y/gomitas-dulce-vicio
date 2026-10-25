// Tema: Hooks personalizados. Abre una subscription de GraphQL mientras el componente
// esta en pantalla y la cierra al desmontarse.
import { useEffect, useRef } from "react";
import { suscribir } from "../api/graphql";

export function useSuscripcion(query, alRecibir) {
  // Se guarda la ultima funcion para no reabrir la subscription en cada render.
  const ultima = useRef(alRecibir);
  useEffect(() => {
    ultima.current = alRecibir;
  });

  useEffect(() => {
    const cancelar = suscribir(query, (datos) => ultima.current(datos));
    return cancelar;
  }, [query]);
}
