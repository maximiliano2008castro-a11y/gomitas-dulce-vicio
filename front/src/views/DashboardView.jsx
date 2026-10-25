// Tema: Fetching con dependencias (useApi + deps) + composicion de componentes.
// Dashboard del administrador: estadisticas de pagos y pedidos (GET /admin/estadisticas).
import { useState } from "react";
import { API } from "../api/client";
import { useApi } from "../hooks/useApi";
import { BarrasApiladas, BarrasSimples, Columnas, StatTile } from "../components/Graficas";
import PedidosAdmin from "../components/PedidosAdmin";
import { dinero, ESTADOS_PAGO, ESTADOS_PEDIDO, MEDIOS, METODO } from "../pagos";

const RANGOS = [
  { dias: 7, nombre: "7 dias" },
  { dias: 30, nombre: "30 dias" },
  { dias: 90, nombre: "90 dias" },
  { dias: 0, nombre: "Todo" },
];

const SERIES_PAGO = Object.entries(ESTADOS_PAGO).map(([id, e]) => ({
  id,
  nombre: e.nombre,
  icono: e.icono,
  clase: `serie--${e.tono}`,
}));

const porcentaje = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : "0%");
const dineroCorto = (n) =>
  n >= 1000 ? `$${(n / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })}k` : `$${n}`;

export default function DashboardView({ onVolver, embebido = false }) {
  const [dias, setDias] = useState(30);
  // Cambiar esta llave hace que se vuelvan a pedir las estadisticas (tras una accion del admin).
  const [version, setVersion] = useState(0);
  const { data: e, loading, error } = useApi(() => API.estadisticas(dias), [dias, version]);

  return (
    <main className="main dashboard">
      {!embebido && (
        <button className="boton boton--enlace" onClick={onVolver}>
          ← Volver a la tienda
        </button>
      )}

      <div className="dashboard__encabezado">
        {embebido ? <p className="texto-tenue">Ventas y pagos de la tienda.</p> : <h2>Dashboard</h2>}
        <div className="segmentado" role="group" aria-label="Periodo">
          {RANGOS.map((r) => (
            <button
              key={r.dias}
              className={dias === r.dias ? "activo" : ""}
              aria-pressed={dias === r.dias}
              onClick={() => setDias(r.dias)}
            >
              {r.nombre}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && !e && <p>Cargando estadisticas...</p>}

      {e && (
        <div className={"dashboard__contenido" + (loading ? " cargando" : "")}>
          {/* ---------- Numeros principales ---------- */}
          <section className="stats">
            <StatTile
              heroe
              etiqueta="Ingresos cobrados"
              valor={dinero(e.resumen.ingresos)}
              nota={`${e.resumen.pagos_aprobados} pagos aprobados`}
            />
            <StatTile etiqueta="Pedidos" valor={e.resumen.pedidos} nota={`${e.resumen.clientes} clientes`} />
            <StatTile
              etiqueta="Tasa de aprobacion"
              valor={e.resumen.tasa_aprobacion == null ? "—" : `${Math.round(e.resumen.tasa_aprobacion * 100)}%`}
              nota="aprobados vs. rechazados"
            />
            <StatTile etiqueta="Ticket promedio" valor={dinero(e.resumen.ticket_promedio)} />
            <StatTile
              etiqueta="Por cobrar"
              valor={dinero(e.resumen.monto_pendiente)}
              nota={`${e.por_estado_pago.pendiente} pagos pendientes`}
            />
          </section>

          {/* ---------- Pagos por metodo ---------- */}
          <section className="tarjeta-panel tarjeta-panel--ancha">
            <h3>Pagos por metodo</h3>
            <p className="texto-tenue">Cuantos pedidos se pagaron con cada metodo y como terminaron.</p>
            <BarrasApiladas
              series={SERIES_PAGO}
              filas={e.por_metodo.map((m) => ({
                id: m.metodo,
                etiqueta: `${METODO[m.metodo].icono} ${METODO[m.metodo].nombre}`,
                total: m.pedidos,
                nota: `${dinero(m.monto_aprobado)} cobrados`,
                valores: m,
              }))}
              formatoTooltip={(f, s) => (
                <>
                  <strong>{f.etiqueta}</strong>
                  <span>
                    {s.icono} {s.nombre}: {f.valores[s.id]} ({porcentaje(f.valores[s.id], f.total)})
                  </span>
                </>
              )}
            />
            <details className="tabla-detalle">
              <summary>Ver como tabla</summary>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Metodo</th>
                    {SERIES_PAGO.map((s) => (
                      <th key={s.id} className="num">{s.nombre}</th>
                    ))}
                    <th className="num">Total</th>
                    <th className="num">Cobrado</th>
                  </tr>
                </thead>
                <tbody>
                  {e.por_metodo.map((m) => (
                    <tr key={m.metodo}>
                      <td>{METODO[m.metodo].nombre}</td>
                      {SERIES_PAGO.map((s) => (
                        <td key={s.id} className="num">{m[s.id]}</td>
                      ))}
                      <td className="num">{m.pedidos}</td>
                      <td className="num">{dinero(m.monto_aprobado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          {/* ---------- Estados ---------- */}
          <section className="tarjeta-panel">
            <h3>Estado de los pagos</h3>
            <ListaEstados conteos={e.por_estado_pago} catalogo={ESTADOS_PAGO} />
          </section>

          <section className="tarjeta-panel">
            <h3>Estado de los pedidos</h3>
            <ListaEstados conteos={e.por_estado_pedido} catalogo={ESTADOS_PEDIDO} />
          </section>

          {/* ---------- Ingresos por dia ---------- */}
          <section className="tarjeta-panel tarjeta-panel--ancha">
            <h3>Ingresos cobrados por dia</h3>
            <Columnas
              formato={dinero}
              formatoEje={dineroCorto}
              datos={e.ventas_por_dia.map((d) => {
                const f = new Date(d.fecha + "T12:00:00");
                return {
                  id: d.fecha,
                  etiqueta: f.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }),
                  etiquetaCorta: f.toLocaleDateString("es-MX", { day: "numeric", month: "short" }),
                  valor: d.ingresos,
                  extra: `${d.pedidos} pedidos creados`,
                };
              })}
            />
          </section>

          {/* ---------- Tarjetas / medios ---------- */}
          <section className="tarjeta-panel">
            <h3>Pagos aprobados por marca</h3>
            {e.por_medio.length === 0 ? (
              <p className="texto-tenue">Sin pagos en linea en este periodo.</p>
            ) : (
              <BarrasSimples
                formato={(v) => `${v} pagos`}
                datos={e.por_medio.map((m) => ({
                  id: m.medio,
                  etiqueta: MEDIOS[m.medio] || m.medio,
                  valor: m.pagos,
                }))}
              />
            )}
          </section>

          <section className="tarjeta-panel">
            <h3>Productos mas vendidos</h3>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Piezas</th>
                  <th className="num">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {e.top_productos.map((p) => (
                  <tr key={p.producto}>
                    <td>{p.producto}</td>
                    <td className="num">{p.cantidad}</td>
                    <td className="num">{dinero(p.ingresos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      <section className="tarjeta-panel tarjeta-panel--ancha">
        <h3>Pedidos</h3>
        <PedidosAdmin version={version} onCambio={() => setVersion((v) => v + 1)} />
      </section>
    </main>
  );
}

function ListaEstados({ conteos, catalogo }) {
  const total = Object.values(conteos).reduce((a, b) => a + b, 0);
  return (
    <ul className="estados">
      {Object.entries(catalogo).map(([id, info]) => (
        <li key={id}>
          <span className={`badge badge--${info.tono}`}>
            <span aria-hidden="true">{info.icono}</span> {info.nombre}
          </span>
          <span className="estados__barra">
            <span className={`serie--${info.tono}`} style={{ width: porcentaje(conteos[id], total) }} />
          </span>
          <strong>{conteos[id]}</strong>
          <span className="texto-tenue">{porcentaje(conteos[id], total)}</span>
        </li>
      ))}
    </ul>
  );
}
