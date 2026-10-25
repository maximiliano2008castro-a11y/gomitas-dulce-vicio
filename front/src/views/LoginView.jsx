// Tema: Eventos HTML (onSubmit/onChange) + Hooks (useState) + Fetching (OAuth2).
// Una sola vista con dos modos: iniciar sesion o crear cuenta.
import { useState } from "react";
import { API } from "../api/client";
import { useAuthStore } from "../store/useAuthStore";

export default function LoginView({ mensaje, onExito, onVolver }) {
  const [modo, setModo] = useState("login");
  const [form, setForm] = useState({ nombre: "", email: "", password: "" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const iniciarSesion = useAuthStore((s) => s.iniciarSesion);

  const esRegistro = modo === "registro";

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    try {
      if (esRegistro) {
        await API.registro(form);
      }
      const { access_token } = await API.login(form.email, form.password);
      // Se guarda el token primero para que /auth/me ya vaya autenticado.
      iniciarSesion(access_token, null);
      const usuario = await API.yo();
      iniciarSesion(access_token, usuario);
      onExito(usuario);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="main">
      <button className="boton boton--enlace" onClick={onVolver}>
        ← Volver
      </button>

      <h2>{esRegistro ? "Crear cuenta" : "Iniciar sesion"}</h2>
      {mensaje && <p>{mensaje}</p>}

      <form className="form" onSubmit={handleSubmit}>
        {esRegistro && (
          <>
            <label htmlFor="nombre">Nombre</label>
            <input
              id="nombre"
              name="nombre"
              type="text"
              required
              value={form.nombre}
              onChange={handleChange}
            />
          </>
        )}

        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={form.email}
          onChange={handleChange}
        />

        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={esRegistro ? "new-password" : "current-password"}
          minLength={esRegistro ? 8 : undefined}
          required
          value={form.password}
          onChange={handleChange}
        />

        {error && <p className="error">{error}</p>}

        <button className="boton boton--primario" type="submit" disabled={enviando}>
          {enviando ? "Un momento..." : esRegistro ? "Crear cuenta" : "Entrar"}
        </button>

        <button
          type="button"
          className="boton boton--enlace form__alternar"
          onClick={() => {
            setModo(esRegistro ? "login" : "registro");
            setError(null);
          }}
        >
          {esRegistro ? "¿Ya tienes cuenta? Inicia sesion" : "¿No tienes cuenta? Registrate"}
        </button>
      </form>
    </main>
  );
}
