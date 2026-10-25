// Equipo: el admin da de alta trabajadores de mostrador y puede deshabilitarlos.
import { useCallback, useEffect, useState } from "react";
import * as consultas from "../consultas";
import { useBackoffice } from "../contexto";
import { Cargando, Interruptor } from "../ui";
import { useUiStore } from "../../store/useUiStore";

export default function Equipo() {
  const { usuario } = useBackoffice();
  const avisar = useUiStore((s) => s.avisar);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState(null);
  const [datos, setDatos] = useState({ nombre: "", email: "", password: "" });
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista(await consultas.equipo());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function agregar(e) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const nuevo = await consultas.crearTrabajador(datos);
      avisar(`${nuevo.nombre} ya puede entrar al backoffice`, "bueno", "👥");
      setDatos({ nombre: "", email: "", password: "" });
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarAcceso(persona, tieneAcceso) {
    try {
      await consultas.cambiarEstadoUsuario(persona.id, !tieneAcceso);
      avisar(tieneAcceso ? `${persona.nombre} puede entrar otra vez` : `${persona.nombre} ya no puede entrar`, "info", tieneAcceso ? "✅" : "🔒");
      cargar();
    } catch (err) {
      avisar(err.message, "malo", "⚠️");
    }
  }

  return (
    <div className="bo-dos-columnas bo-dos-columnas--equipo">
      <section className="bo-tarjeta">
        <div className="bo-seccion-titulo">
          <h3>Personal con acceso</h3>
        </div>
        {!lista && <Cargando />}
        <ul className="bo-lista-simple bo-equipo">
          {lista?.map((p) => (
            <li key={p.id}>
              <div>
                <strong>{p.nombre}</strong>
                <small className="bo-tenue">{p.email}</small>
              </div>
              <span className={"bo-rol" + (p.esAdmin ? " bo-rol--admin" : "")}>{p.esAdmin ? "Administrador" : "Trabajador"}</span>
              <Interruptor
                activo={!p.disabled}
                deshabilitado={p.id === usuario.id}
                etiqueta={`Acceso de ${p.nombre}`}
                onCambio={(v) => cambiarAcceso(p, v)}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="bo-tarjeta">
        <div className="bo-seccion-titulo">
          <h3>Agregar trabajador</h3>
        </div>
        <p className="bo-tenue">Un trabajador ve los pedidos y confirma recogidas. No puede editar productos ni ver dinero.</p>
        <form className="bo-form-simple" onSubmit={agregar}>
          <label className="bo-campo">
            <span>Nombre</span>
            <input className="bo-input" required value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
          </label>
          <label className="bo-campo">
            <span>Email</span>
            <input className="bo-input" type="email" required value={datos.email} onChange={(e) => setDatos({ ...datos, email: e.target.value })} />
          </label>
          <label className="bo-campo">
            <span>Contraseña (minimo 8 caracteres)</span>
            <input className="bo-input" type="password" required minLength={8} value={datos.password} onChange={(e) => setDatos({ ...datos, password: e.target.value })} />
          </label>
          {error && <p className="bo-error">{error}</p>}
          <button className="bo-boton bo-boton--primario" disabled={guardando}>
            {guardando ? "Creando..." : "Crear trabajador"}
          </button>
        </form>
      </section>
    </div>
  );
}
