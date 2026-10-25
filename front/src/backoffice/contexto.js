// Contexto compartido por las secciones del backoffice.
import { createContext, useContext } from "react";

export const BackofficeContext = createContext(null);

export function useBackoffice() {
  return useContext(BackofficeContext);
}
