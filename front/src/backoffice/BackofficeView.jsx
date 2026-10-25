// Backoffice: panel para el administrador y los trabajadores de mostrador.
//  - Admin: ve todo (productos, categorias, pedidos, estadisticas, equipo).
//  - Trabajador: solo Inicio, Recogida y Pedidos.
// Aqui vive la subscription "pedidosEnVivo": cuando llega un evento, se avisa con un toast,
// se anota en la actividad y se le dice a las secciones que vuelvan a pedir sus datos.
import { useCallback, useEffect, useState } from "react";
import * as consultas from "./consultas";
import { BackofficeContext } from "./contexto";
import { guardarSonido, pitido, sonidoActivado } from "./sonido";
import { Avisos } from "./ui";
import Inicio from "./secciones/Inicio";
import Recogida from "./secciones/Recogida";
import Pedidos from "./secciones/Pedidos";
import Productos from "./secciones/Productos";
import Categorias from "./secciones/Categorias";
import Equipo from "./secciones/Equipo";
import DashboardView from "../views/DashboardView";
import { useSuscripcion } from "../hooks/useSuscripcion";
import { useUiStore } from "../store/useUiStore";
import { dinero } from "../pagos";
import "./backoffice.css";

const SECCIONES = [
  { id: "inicio", nombre: "Inicio", icono: "🏠" },
  { id: "recogida", nombre: "Recogida", icono: "🛍️" },
  { id: "pedidos", nombre: "Pedidos", icono: "🧾" },
  { id: "productos", nombre: "Productos", icono: "🍬", soloAdmin: true },
  { id: "categorias", nombre: "Categorias", icono: "🗂️", soloAdmin: true },
  { id: "estadisticas", nombre: "Estadisticas", icono: "📊", soloAdmin: true },
  { id: "equipo", nombre: "Equipo", icono: "👥", soloAdmin: true },
];

// Texto de cada evento para la lista de actividad.
function textoDeEvento(evento) {
  const p = evento.pedido;
  const quien = p.cliente.nombre;
  if (evento.tipo === "NUEVO") return { icono: "🛎️", texto: `Pedido #${p.id} nuevo de ${quien} · ${dinero(p.total)}` };
  if (evento.tipo === "PAGADO") return { icono: "💳", texto: `Pedido #${p.id} pagado: listo para recoger` };
  if (evento.tipo === "ENTREGADO") return { icono: "✅", texto: `Pedido #${p.id} recogido por ${quien}` };
  if (evento.tipo === "CANCELADO") return { icono: "⊘", texto: `Pedido #${p.id} cancelado` };
  return { icono: "↻", texto: `Pedido #${p.id} actualizado` };
}

export default function BackofficeView({ usuario, seccionInicial, onVolverTienda, onSalir }) {
  const esAdmin = usuario.es_admin;
  const visibles = SECCIONES.filter((s) => !s.soloAdmin || esAdmin);
  const [seccion, setSeccion] = useState(seccionInicial || (esAdmin ? "inicio" : "recogida"));
  const [version, setVersion] = useState(0);
  const [actividad, setActividad] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [sonido, setSonido] = useState(sonidoActivado());

  const avisar = useUiStore((s) => s.avisar);
  const conectado = useUiStore((s) => s.conectado);
  const reconexiones = useUiStore((s) => s.reconexiones);

  // Los numeros del Inicio y el contador del menu se vuelven a pedir con cada evento.
  useEffect(() => {
    let cancelado = false;
    consultas
      .resumen()
      .then((r) => !cancelado && setResumen(r))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [version, reconexiones]);

  const alLlegarEvento = useCallback(
    (datos) => {
      const evento = datos.pedidosEnVivo;
      const { icono, texto } = textoDeEvento(evento);

      setActividad((vieja) => [{ id: Date.now() + Math.random(), icono, texto, hora: new Date() }, ...vieja].slice(0, 30));
      setVersion((v) => v + 1);

      if (evento.tipo === "NUEVO") {
        avisar(texto, "info", icono);
        pitido();
      }
      if (evento.tipo === "PAGADO") {
        avisar(texto, "bueno", icono);
        pitido();
      }
    },
    [avisar]
  );
  useSuscripcion(consultas.PEDIDOS_EN_VIVO, alLlegarEvento);

  function cambiarSonido() {
    guardarSonido(!sonido);
    setSonido(!sonido);
  }

  const contexto = { usuario, esAdmin, version, actividad, resumen, ir: setSeccion };

  return (
    <BackofficeContext.Provider value={contexto}>
      <div className="bo">
        <aside className="bo-lateral">
          <div className="bo-marca">
            <span className="bo-marca__logo">🍬</span>
            <div>
              <strong>Dulce Vicio</strong>
              <small>Backoffice</small>
            </div>
          </div>

          <nav className="bo-menu" aria-label="Secciones">
            {visibles.map((s) => (
              <button
                key={s.id}
                className={"bo-menu__item" + (seccion === s.id ? " bo-menu__item--activo" : "")}
                onClick={() => setSeccion(s.id)}
                aria-current={seccion === s.id ? "page" : undefined}
              >
                <span aria-hidden="true">{s.icono}</span>
                {s.nombre}
                {s.id === "recogida" && resumen?.porRecoger > 0 && (
                  <span className="bo-menu__contador">{resumen.porRecoger}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="bo-lateral__pie">
            <div className={"bo-vivo" + (conectado ? " bo-vivo--on" : "")} title="Conexion en tiempo real (GraphQL Subscription)">
              <span className="bo-vivo__punto" />
              {conectado ? "En vivo" : "Reconectando..."}
            </div>
            <button className="bo-lateral__enlace" onClick={cambiarSonido}>
              {sonido ? "🔔 Sonido activado" : "🔕 Sonido apagado"}
            </button>
            <button className="bo-lateral__enlace" onClick={onVolverTienda}>
              ← Ver la tienda
            </button>
          </div>
        </aside>

        <div className="bo-contenido">
          <header className="bo-cabecera">
            <div>
              <h1>{visibles.find((s) => s.id === seccion)?.nombre}</h1>
            </div>
            <div className="bo-cabecera__usuario">
              <span className="bo-rol">{esAdmin ? "Administrador" : "Trabajador"}</span>
              <span>{usuario.nombre}</span>
              <button className="bo-boton bo-boton--chico" onClick={onSalir}>
                Salir
              </button>
            </div>
          </header>

          <main className="bo-principal">
            {seccion === "inicio" && <Inicio />}
            {seccion === "recogida" && <Recogida />}
            {seccion === "pedidos" && <Pedidos />}
            {seccion === "productos" && esAdmin && <Productos />}
            {seccion === "categorias" && esAdmin && <Categorias />}
            {seccion === "estadisticas" && esAdmin && <DashboardView embebido />}
            {seccion === "equipo" && esAdmin && <Equipo />}
          </main>
        </div>
      </div>
      <Avisos />
    </BackofficeContext.Provider>
  );
}
