// Tema: Contexto global con Zustand.
// Carrito persistido en localStorage para que sobreviva a un refresh.
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      agregarProducto: (producto, cantidad = 1) => {
        const items = get().items;
        const existente = items.find((item) => item.id === producto.id);

        if (existente) {
          set({
            items: items.map((item) =>
              item.id === producto.id
                ? { ...item, cantidad: item.cantidad + cantidad }
                : item
            ),
          });
        } else {
          set({ items: [...items, { ...producto, cantidad }] });
        }
      },

      cambiarCantidad: (id, cantidad) => {
        if (cantidad <= 0) {
          get().quitarProducto(id);
          return;
        }
        set({
          items: get().items.map((item) =>
            item.id === id ? { ...item, cantidad } : item
          ),
        });
      },

      quitarProducto: (id) => {
        set({ items: get().items.filter((item) => item.id !== id) });
      },

      vaciarCarrito: () => set({ items: [] }),

      total: () =>
        get().items.reduce((acc, item) => acc + item.precio * item.cantidad, 0),

      totalItems: () =>
        get().items.reduce((acc, item) => acc + item.cantidad, 0),
    }),
    { name: "gomitas-carrito-v2" }
  )
);
