// Tema: Fetching con hook personalizado + listas.
// Historial del cliente (GET /pedidos/mios) con el estado de pago de cada pedido.
import { useState } from "react";
import { API } from "../api/client";
import { useApi } from "../hooks/useApi";
import { useSuscripcion } from "../hooks/useSuscripcion";
import { MIS_PEDIDOS_EN_VIVO } from "../backoffice/consultas";
import EstadoBadge from "../components/EstadoBadge";
import { dinero, fecha, METODO } from "../pagos";

// El codigo solo sirve si el pedido esta pagado o es "pagar al recoger" y aun no se entrega.
function listoParaRecoger(p) {
  if (p.estado === "pagado") return true;
  return p.estado === "pendiente_pago" && p.pago?.metodo === "pickup";
}

export default function MisPedidosView({ onAbrirPedido, onVolver }) {
  // Cada cambio de uno de mis pedidos (pago aprobado, entregado...) llega en vivo y recarga la lista.
  const [version, setVersion] = useState(0);
  const { data: pedidos, loading, error } = useApi(API.misPedidos, [version]);
  useSuscripcion(MIS_PEDIDOS_EN_VIVO, () => setVersion((v) => v + 1));

  return (
    <main className="main">
      <button className="boton boton--enlace" onClick={onVolver}>
        ← Seguir comprando
      </button>
      <h2>Mis pedidos</h2>

      {loading && <p>Cargando...</p>}
      {error && <p className="error">{error}</p>}
      {pedidos?.length === 0 && <p>Aun no tienes pedidos.</p>}

      <ul className="pedidos">
        {pedidos?.map((p) => (
          <li key={p.id} className="pedidos__item">
            <div>
              <strong>Pedido #{p.id}</strong>
              <span className="texto-tenue">{fecha(p.fecha)}</span>
              <span className="texto-tenue">
                {p.items.reduce((n, i) => n + i.cantidad, 0)} productos ·{" "}
                {METODO[p.pago?.metodo]?.icono} {METODO[p.pago?.metodo]?.nombre}
              </span>
              {p.codigo_recogida && listoParaRecoger(p) && (
                <span className="pedidos__codigo">
                  Codigo para recoger: <strong>{p.codigo_recogida}</strong>
                </span>
              )}
            </div>
            <div className="pedidos__estado">
              <strong>{dinero(p.total)}</strong>
              <EstadoBadge estado={p.estado} tipo="pedido" />
            </div>
            <button
              className={"boton" + (p.estado === "pendiente_pago" ? " boton--primario" : "")}
              onClick={() => onAbrirPedido(p.id)}
            >
              {p.estado === "pendiente_pago" ? "Pagar" : "Ver"}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
