// Tema: Fetching y componentes dinamicos.
// Cliente minimo para hablar con la API REST (FastAPI) del backend.
// Si hay sesion, cada peticion lleva "Authorization: Bearer <token>" (OAuth2).
import { useAuthStore } from "../store/useAuthStore";

// En desarrollo (npm run dev) la API esta en el puerto 8000. Ya publicada, el mismo servidor
// entrega la pagina y la API, asi que se usa la direccion de la propia pagina.
const API_POR_DEFECTO = import.meta.env.PROD ? window.location.origin : "http://localhost:8000";
export const BASE_URL = (import.meta.env.VITE_API_URL || API_POR_DEFECTO).replace(/\/$/, "");

// FastAPI responde los errores como { detail: "..." } o, si falla la validacion,
// { detail: [{ msg, loc }, ...] }.
function mensajeDeError(json, status) {
  const detail = json?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) return detail[0].msg;
  return `Error ${status}`;
}

// Las imagenes subidas desde el backoffice se guardan como "/uploads/abc.png" (ruta del
// backend); las de relleno ya son URLs completas. Aqui se arma la direccion final.
export function urlImagen(ruta) {
  if (!ruta) return "";
  if (ruta.startsWith("/uploads/")) return BASE_URL + ruta;
  return ruta;
}

export async function apiRequest(path, { method = "GET", body, form, archivo } = {}) {
  const headers = {};
  const token = useAuthStore.getState().token;
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (archivo) {
    // Subida de archivos: multipart. No se pone Content-Type, el navegador agrega el boundary.
    payload = new FormData();
    payload.append("archivo", archivo);
  } else if (form) {
    // OAuth2 exige que el login vaya como formulario, no como JSON.
    payload = new URLSearchParams(form);
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload });

  if (res.status === 401 && token) {
    // Token vencido o invalido: se cierra la sesion local.
    useAuthStore.getState().cerrarSesion();
  }

  if (res.status === 204) return null;

  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(mensajeDeError(json, res.status));
  return json;
}

export const API = {
  categorias: () => apiRequest("/categorias"),
  categoria: (id) => apiRequest(`/categorias/${id}`),
  crearPedido: (items, metodoPago) =>
    apiRequest("/pedidos", { method: "POST", body: { items, metodo_pago: metodoPago } }),
  misPedidos: () => apiRequest("/pedidos/mios"),
  pedido: (id) => apiRequest(`/pedidos/${id}`),
  cancelarPedido: (id) => apiRequest(`/pedidos/${id}/cancelar`, { method: "POST" }),

  // Pagos
  configPagos: () => apiRequest("/pagos/config"),
  reintentarPago: (id, metodoPago) =>
    apiRequest(`/pagos/${id}/reintentar`, { method: "POST", body: { metodo_pago: metodoPago } }),
  verificarPago: (id, paymentId) =>
    apiRequest(`/pagos/${id}/verificar`, { method: "POST", body: { payment_id: paymentId || null } }),
  simularPago: (id, resultado) =>
    apiRequest(`/pagos/${id}/simular`, { method: "POST", body: { resultado } }),

  // Admin
  estadisticas: (dias) => apiRequest(`/admin/estadisticas?dias=${dias}`),
  pedidosAdmin: (filtros = {}) => {
    const params = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v));
    return apiRequest(`/pedidos?${params}`);
  },
  entregarPedido: (id) => apiRequest(`/pedidos/${id}/entregar`, { method: "POST" }),
  actualizarPago: (id, estado, detalle) =>
    apiRequest(`/pagos/${id}`, { method: "PATCH", body: { estado, detalle } }),

  login: (email, password) =>
    apiRequest("/auth/token", { method: "POST", form: { username: email, password } }),
  registro: (datos) => apiRequest("/auth/registro", { method: "POST", body: datos }),
  yo: () => apiRequest("/auth/me"),

  // Backoffice: sube una imagen y regresa { url }
  subirImagen: (archivo) => apiRequest("/imagenes", { method: "POST", archivo }),
};
