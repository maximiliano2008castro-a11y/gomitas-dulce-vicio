// Tabla de pedidos del admin con filtros y acciones (entregar, marcar pagado, cancelar).
import { useState } from "react";
import { API } from "../api/client";
import { useApi } from "../hooks/useApi";
import EstadoBadge from "./EstadoBadge";
import { dinero, ESTADOS_PAGO, ESTADOS_PEDIDO, fecha, MEDIOS, METODO, METODOS } from "../pagos";

export default function PedidosAdmin({ version, onCambio }) {
  const [filtros, setFiltros] = useState({ metodo: "", estado_pago: "", estado: "" });
  const { data: pedidos, loading, error } = useApi(
    () => API.pedidosAdmin({ ...filtros, limite: 100 }),
    [filtros.metodo, filtros.estado_pago, filtros.estado, version]
  );
  const [errorAccion, setErrorAccion] = useState(null);

  async function accion(peticion) {
    setErrorAccion(null);
    try {
      await peticion();
      onCambio();
    } catch (err) {
      setErrorAccion(err.message);
    }
  }

  const cambiarFiltro = (e) => setFiltros((f) => ({ ...f, [e.target.name]: e.target.value }));

  return (
    <>
      <div className="filtros">
        <select name="metodo" value={filtros.metodo} onChange={cambiarFiltro} aria-label="Metodo">
          <option value="">Todos los metodos</option>
          {METODOS.map((m) => (
            <option key={m.id} value={m.id}>{m.nombre}</option>
          ))}
        </select>
        <select name="estado_pago" value={filtros.estado_pago} onChange={cambiarFiltro} aria-label="Estado del pago">
          <option value="">Cualquier pago</option>
          {Object.entries(ESTADOS_PAGO).map(([id, e]) => (
            <option key={id} value={id}>Pago {e.nombre.toLowerCase()}</option>
          ))}
        </select>
        <select name="estado" value={filtros.estado} onChange={cambiarFiltro} aria-label="Estado del pedido">
          <option value="">Cualquier pedido</option>
          {Object.entries(ESTADOS_PEDIDO).map(([id, e]) => (
            <option key={id} value={id}>{e.nombre}</option>
          ))}
        </select>
        {loading && <span className="texto-tenue">Cargando...</span>}
      </div>

      {(error || errorAccion) && <p className="error">{error || errorAccion}</p>}

      <div className="tabla-scroll">
        <table className="tabla tabla--pedidos">
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Metodo</th>
              <th className="num">Total</th>
              <th>Pago</th>
              <th>Pedido</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pedidos?.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td className="nowrap">{fecha(p.fecha)}</td>
                <td>{p.cliente.nombre}</td>
                <td>
                  {METODO[p.pago.metodo].icono} {METODO[p.pago.metodo].nombre}
                  {p.pago.mp_medio && (
                    <small className="texto-tenue"> · {MEDIOS[p.pago.mp_medio] || p.pago.mp_medio}</small>
                  )}
                </td>
                <td className="num">{dinero(p.total)}</td>
                <td><EstadoBadge estado={p.pago.estado} /></td>
                <td><EstadoBadge estado={p.estado} tipo="pedido" /></td>
                <td className="acciones">
                  {p.estado === "pagado" && (
                    <button className="boton boton--chico" onClick={() => accion(() => API.entregarPedido(p.id))}>
                      Entregar
                    </button>
                  )}
                  {p.estado === "pendiente_pago" && p.pago.metodo === "pickup" && (
                    <button className="boton boton--chico" onClick={() => accion(() => API.entregarPedido(p.id))}>
                      Cobrar y entregar
                    </button>
                  )}
                  {p.estado === "pendiente_pago" && p.pago.metodo !== "pickup" && (
                    <button
                      className="boton boton--chico"
                      onClick={() => accion(() => API.actualizarPago(p.id, "aprobado", "Confirmado por el admin"))}
                    >
                      Marcar pagado
                    </button>
                  )}
                  {p.estado === "pendiente_pago" && (
                    <button
                      className="boton boton--chico boton--peligro-suave"
                      onClick={() => confirm(`¿Cancelar el pedido #${p.id}?`) && accion(() => API.cancelarPedido(p.id))}
                    >
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pedidos?.length === 0 && <p className="texto-tenue">No hay pedidos con esos filtros.</p>}
      </div>
    </>
  );
}
