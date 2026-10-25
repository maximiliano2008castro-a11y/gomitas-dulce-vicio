// Estado de interfaz compartido: avisos (toasts) y estado de la conexion en vivo (WebSocket).
import { create } from "zustand";

let siguienteId = 1;
let yaSeConecto = false;

export const useUiStore = create((set, get) => ({
  toasts: [],
  // true cuando el WebSocket de las subscriptions esta conectado.
  conectado: false,
  // Sube cada vez que el WebSocket se RECONECTA (no la primera vez): las pantallas
  // vuelven a pedir sus datos porque pudieron perderse eventos mientras estaba caido.
  reconexiones: 0,

  avisar: (texto, tipo = "info", icono = null) => {
    const id = siguienteId++;
    set({ toasts: [...get().toasts, { id, texto, tipo, icono }] });
    setTimeout(() => get().quitarAviso(id), 5000);
  },
  quitarAviso: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  alConectar: () => {
    set({ conectado: true, reconexiones: yaSeConecto ? get().reconexiones + 1 : get().reconexiones });
    yaSeConecto = true;
  },
  alDesconectar: () => set({ conectado: false }),
}));
