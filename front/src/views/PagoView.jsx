// Tema: Fetching + renderizado condicional.
// Muestra el estado del pago de un pedido y lo que el cliente tiene que hacer segun el
// metodo: ir a Mercado Pago, ver su ficha OXXO, compartir el link, o recoger en tienda.
// Tambien es a donde se regresa desde Mercado Pago (?pago=retorno&pedido=ID&payment_id=...).
import { useEffect, useState } from "react";
import { API } from "../api/client";
import EstadoBadge from "../components/EstadoBadge";
import MetodoSelector from "../components/MetodoSelector";
import PasarelaSimulada from "../components/PasarelaSimulada";
import TicketRecogida from "../components/TicketRecogida";
import { MIS_PEDIDOS_EN_VIVO } from "../backoffice/consultas";
import { useSuscripcion } from "../hooks/useSuscripcion";
import { useUiStore } from "../store/useUiStore";
import { dinero, MEDIOS, METODO } from "../pagos";

export default function PagoView({ pedidoId, paymentIdRetorno, onMisPedidos, onSeguirComprando }) {
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [nuevoMetodo, setNuevoMetodo] = useState(null);
  const [copiado, setCopiado] = useState(false);

  // Ejecuta una accion contra la API y se queda con el pedido actualizado.
  async function accion(peticion) {
    setOcupado(true);
    setError(null);
    try {
      setPedido(await peticion());
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  useEffect(() => {
    // Al regresar de Mercado Pago se consulta el pago real (no se confia en la URL).
    accion(async () => {
      const p = await API.pedido(pedidoId);
      return p.pago?.proveedor === "mercadopago" && p.estado === "pendiente_pago"
        ? API.verificarPago(pedidoId, paymentIdRetorno)
        : p;
    });
  }, [pedidoId, paymentIdRetorno]);

  // En vivo (GraphQL Subscription): si Mercado Pago aprueba el pago o la tienda entrega el
  // pedido, esta pantalla se actualiza sola, sin recargar.
  const avisar = useUiStore((s) => s.avisar);
  useSuscripcion(MIS_PEDIDOS_EN_VIVO, (datos) => {
    const evento = datos.misPedidosEnVivo;
    if (evento.pedido.id !== pedidoId) return;
    API.pedido(pedidoId).then(setPedido).catch(() => {});
    if (evento.tipo === "PAGADO") avisar("¡Mercado Pago confirmo tu pago!", "bueno", "💳");
    if (evento.tipo === "ENTREGADO") avisar("Pedido entregado. ¡Que lo disfrutes!", "bueno", "🍬");
  });

  if (!pedido) {
    return (
      <main className="main">
        {error ? <p className="error">{error}</p> : <p>Cargando pedido...</p>}
        <button className="boton boton--enlace" onClick={onMisPedidos}>
          ← Mis pedidos
        </button>
      </main>
    );
  }

  const { pago } = pedido;
  const metodo = METODO[pago.metodo];
  const abierto = pedido.estado === "pendiente_pago" && pago.estado !== "aprobado";

  async function copiarLink() {
    await navigator.clipboard.writeText(pago.url_pago);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <main className="main">
      <button className="boton boton--enlace" onClick={onMisPedidos}>
        ← Mis pedidos
      </button>

      <div className="pago-encabezado">
        <div>
          <h2>Pedido #{pedido.id}</h2>
          <p>
            {metodo.icono} {metodo.nombre} · <strong>{dinero(pedido.total)}</strong>
          </p>
        </div>
        <div className="pago-encabezado__estados">
          <EstadoBadge estado={pedido.estado} tipo="pedido" />
          <EstadoBadge estado={pago.estado} />
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {/* ---------- Ya pagado ---------- */}
      {pago.estado === "aprobado" && (
        <div className="panel panel--good">
          <h3>¡Pago aprobado!</h3>
          <p>
            {pago.mp_medio ? `Pagaste con ${MEDIOS[pago.mp_medio] || pago.mp_medio}. ` : ""}
            {pedido.estado === "entregado" ? "Tu pedido ya fue entregado." : "Tu pedido esta listo: pasa por el con tu codigo."}
          </p>
          {pago.mp_payment_id && <p className="texto-tenue">Folio de pago: {pago.mp_payment_id}</p>}
        </div>
      )}

      {pedido.estado === "cancelado" && pago.estado !== "aprobado" && (
        <div className="panel">
          <h3>Pedido cancelado</h3>
          <p>Los productos regresaron al inventario.</p>
        </div>
      )}

      {/* ---------- Codigo para recoger (pagado, o "pagar al recoger") ---------- */}
      <TicketRecogida pedido={pedido} />

      {abierto && pago.metodo === "pickup" && (
        <div className="panel">
          <h3>🛍️ Tu pedido esta apartado</h3>
          <p>Pasa a recogerlo a la tienda y paga ahi en efectivo o con tarjeta.</p>
          <p className="texto-tenue">Lo guardamos 3 dias habiles.</p>
        </div>
      )}

      {/* ---------- Pasarela simulada (sin credenciales de MP) ---------- */}
      {abierto && pago.proveedor === "simulado" && (
        <PasarelaSimulada
          pedido={pedido}
          ocupado={ocupado}
          onResultado={(resultado) => accion(() => API.simularPago(pedido.id, resultado))}
        />
      )}

      {/* ---------- Mercado Pago ---------- */}
      {abierto && pago.proveedor === "mercadopago" && (
        <div className="panel">
          {pago.estado === "rechazado" && (
            <p className="error">
              Mercado Pago rechazo el pago ({pago.detalle}). Intenta con otra tarjeta o cambia de
              metodo.
            </p>
          )}

          {!pago.url_pago ? (
            <>
              <p className="error">{pago.detalle || "No se pudo generar el cobro."}</p>
              <button
                className="boton boton--primario"
                disabled={ocupado}
                onClick={() => accion(() => API.reintentarPago(pedido.id, pago.metodo))}
              >
                Reintentar
              </button>
            </>
          ) : pago.metodo === "oxxo" && pago.url_ficha ? (
            <>
              <h3>🏪 Tu ficha de pago esta lista</h3>
              <p>
                Imprimela o muestrala en OXXO y paga {dinero(pedido.total)} en efectivo. El pago se
                acredita en unos minutos despues de pagar.
              </p>
              <a className="boton boton--primario" href={pago.url_ficha} target="_blank" rel="noreferrer">
                Ver ficha de pago
              </a>
            </>
          ) : pago.metodo === "link_pago" ? (
            <>
              <h3>🔗 Tu link de pago</h3>
              <p>Abrelo para pagar o compartelo con quien vaya a pagar el pedido.</p>
              <div className="link-pago">
                <input readOnly value={pago.url_pago} onFocus={(e) => e.target.select()} />
                <button className="boton" onClick={copiarLink}>
                  {copiado ? "¡Copiado!" : "Copiar"}
                </button>
              </div>
              <a className="boton boton--primario" href={pago.url_pago} target="_blank" rel="noreferrer">
                Abrir link
              </a>
            </>
          ) : (
            <>
              <h3>Paga con Mercado Pago</h3>
              <p>
                Te llevaremos a Mercado Pago para pagar de forma segura
                {pago.metodo === "oxxo" ? " y generar tu ficha para OXXO" : " con tu tarjeta"}. Al
                terminar regresaras aqui.
              </p>
              <a className="boton boton--mp" href={pago.url_pago}>
                Pagar {dinero(pedido.total)} en Mercado Pago
              </a>
            </>
          )}

          <p className="texto-tenue panel__nota">
            ¿Ya pagaste y no se actualiza?{" "}
            <button
              className="boton boton--enlace boton--inline"
              disabled={ocupado}
              onClick={() => accion(() => API.verificarPago(pedido.id))}
            >
              {ocupado ? "Consultando..." : "Actualizar estado"}
            </button>
          </p>
        </div>
      )}

      {/* ---------- Cambiar metodo / cancelar ---------- */}
      {abierto && (
        <div className="pago-acciones">
          {cambiando ? (
            <div className="form form--ancho">
              <MetodoSelector valor={nuevoMetodo || pago.metodo} onCambiar={setNuevoMetodo} />
              <div className="fila">
                <button
                  className="boton boton--primario"
                  disabled={ocupado}
                  onClick={async () => {
                    await accion(() => API.reintentarPago(pedido.id, nuevoMetodo || pago.metodo));
                    setCambiando(false);
                  }}
                >
                  Usar este metodo
                </button>
                <button className="boton" onClick={() => setCambiando(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="fila">
              <button className="boton" onClick={() => setCambiando(true)}>
                Cambiar metodo de pago
              </button>
              <button
                className="boton boton--peligro-suave"
                disabled={ocupado}
                onClick={() => {
                  if (confirm("¿Cancelar el pedido? Los productos se liberan.")) {
                    accion(() => API.cancelarPedido(pedido.id));
                  }
                }}
              >
                Cancelar pedido
              </button>
            </div>
          )}
        </div>
      )}

      {!abierto && (
        <div className="fila">
          <button className="boton boton--primario" onClick={onSeguirComprando}>
            Seguir comprando
          </button>
          <button className="boton" onClick={onMisPedidos}>
            Ver mis pedidos
          </button>
        </div>
      )}
    </main>
  );
}
