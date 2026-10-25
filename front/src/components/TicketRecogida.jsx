// Ticket con el codigo que el cliente muestra en el mostrador para recoger su pedido.
import "./TicketRecogida.css";

export default function TicketRecogida({ pedido }) {
  if (!pedido.codigo_recogida || pedido.estado === "cancelado") return null;

  const entregado = pedido.estado === "entregado";
  const pagado = pedido.pago.estado === "aprobado";
  const esPickup = pedido.pago.metodo === "pickup";

  // Si todavia hay que pagar con Mercado Pago, el ticket aun no sirve.
  if (!pagado && !esPickup) return null;

  return (
    <div className={"ticket" + (entregado ? " ticket--usado" : "")}>
      <div className="ticket__arriba">
        <span className="ticket__etiqueta">{entregado ? "Pedido entregado" : "Tu codigo de recogida"}</span>
        <div className="ticket__codigo" aria-label={`Codigo ${pedido.codigo_recogida}`}>
          {pedido.codigo_recogida.split("").map((letra, i) => (
            <span key={i}>{letra}</span>
          ))}
        </div>
      </div>
      <div className="ticket__abajo">
        {entregado ? (
          <p>¡Gracias por tu compra! Ya recogiste este pedido.</p>
        ) : (
          <>
            <p>
              <strong>Muestra este codigo en el mostrador</strong> para recoger tu pedido.
            </p>
            <p className="ticket__estado">
              {pagado ? "✓ Pagado: solo pasa por el." : "🛍️ Pagas al recoger en la tienda."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
