// Tema: Contexto global con Zustand.
// Sesion del usuario: el access_token de OAuth2 y los datos de /auth/me.
// Se persiste para no tener que iniciar sesion en cada refresh; el token
// vence solo (ACCESS_TOKEN_EXPIRE_MINUTES en el backend).
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      usuario: null,

      iniciarSesion: (token, usuario) => set({ token, usuario }),
      cerrarSesion: () => set({ token: null, usuario: null }),
    }),
    { name: "gomitas-sesion" }
  )
);
