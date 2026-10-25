// Cliente GraphQL del backoffice.
//   gql()        -> queries y mutations (HTTP POST /graphql)
//   suscribir()  -> subscriptions (WebSocket /graphql, protocolo graphql-transport-ws)
// Usa el mismo token OAuth2 que el resto de la app.
import { createClient } from "graphql-ws";
import { BASE_URL } from "./client";
import { useAuthStore } from "../store/useAuthStore";
import { useUiStore } from "../store/useUiStore";

const URL_HTTP = `${BASE_URL}/graphql`;
const URL_WS = URL_HTTP.replace(/^http/, "ws");

function manejarError(mensaje) {
  // Si el token ya no sirve, se cierra la sesion y la app regresa al login.
  if (mensaje.startsWith("Sesion invalida")) {
    useAuthStore.getState().cerrarSesion();
  }
}

export async function gql(query, variables = {}) {
  const token = useAuthStore.getState().token;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(URL_HTTP, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => null);

  if (!json) throw new Error(`Error ${res.status}`);
  if (json.errors && json.errors.length > 0) {
    const mensaje = json.errors[0].message;
    manejarError(mensaje);
    throw new Error(mensaje);
  }
  return json.data;
}

// ---------------- Subscriptions ----------------
let clienteWs = null;
let tokenDelCliente = null;

function obtenerClienteWs() {
  const token = useAuthStore.getState().token;

  // Si cambio la sesion (otro usuario), se descarta la conexion vieja.
  if (clienteWs && tokenDelCliente !== token) {
    clienteWs.dispose();
    clienteWs = null;
  }

  if (!clienteWs) {
    tokenDelCliente = token;
    clienteWs = createClient({
      url: URL_WS,
      // Un navegador no puede mandar headers en un WebSocket: el token viaja en connection_init.
      connectionParams: () => ({ Authorization: `Bearer ${useAuthStore.getState().token}` }),
      // Si se cae la conexion, reintenta solo (1s, 2s, 4s... maximo 10s).
      retryAttempts: Infinity,
      shouldRetry: () => true,
      retryWait: (intento) =>
        new Promise((listo) => setTimeout(listo, Math.min(1000 * 2 ** intento, 10000))),
      on: {
        connected: () => useUiStore.getState().alConectar(),
        closed: () => useUiStore.getState().alDesconectar(),
      },
    });
  }
  return clienteWs;
}

// Regresa una funcion para cancelar la subscription.
export function suscribir(query, alRecibir) {
  return obtenerClienteWs().subscribe(
    { query },
    {
      next: (resultado) => {
        if (resultado.data) alRecibir(resultado.data);
      },
      error: (error) => {
        const mensaje = Array.isArray(error) ? error[0]?.message || "" : "";
        manejarError(mensaje);
      },
      complete: () => {},
    }
  );
}
