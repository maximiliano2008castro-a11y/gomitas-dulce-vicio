// Pedacitos que comparten Recogida y Pedidos.
import { urlImagen } from "../../api/client";
import EstadoBadge from "../../components/EstadoBadge";
import { dinero, MEDIOS, METODO } from "../../pagos";

export function MiniaturasItems({ items }) {
  return (
    <ul className="bo-items">
      {items.map((i) => (
        <li key={i.id}>
          <img src={urlImagen(i.productoImagen)} alt="" />
          <span className="bo-items__nombre">{i.productoNombre}</span>
          <span className="bo-items__cant">× {i.cantidad}</span>
          <span className="bo-items__subtotal">{dinero(i.subtotal)}</span>
        </li>
      ))}
    </ul>
  );
}

// Como va el cobro, dicho en palabras para el mostrador.
export function EstadoCobro({ pedido }) {
  const pago = pedido.pago;
  const metodo = METODO[pago.metodo];
  const medio = pago.mpMedio ? MEDIOS[pago.mpMedio] || pago.mpMedio : null;

  return (
    <div className="bo-cobro">
      <span>
        {metodo.icono} {metodo.nombre}
        {medio && <small> · {medio}</small>}
      </span>
      <EstadoBadge estado={pago.estado} />
    </div>
  );
}

// Lo que tiene que hacer el trabajador con este pedido.
export function instruccionDeRecogida(pedido) {
  const pago = pedido.pago;
  if (pedido.estado === "entregado") return { tipo: "listo", texto: "Este pedido ya fue entregado." };
  if (pedido.estado === "cancelado") return { tipo: "mal", texto: "Este pedido esta cancelado: no se entrega." };
  if (pago.estado === "aprobado") {
    return { tipo: "bien", texto: "Pagado en linea con Mercado Pago. Solo entregalo.", boton: "Confirmar recogida" };
  }
  if (pago.metodo === "pickup") {
    return {
      tipo: "cobrar",
      texto: `Pago al recoger: cobra ${dinero(pedido.total)} en caja y entregalo.`,
      boton: `Cobrar ${dinero(pedido.total)} y entregar`,
    };
  }
  return {
    tipo: "mal",
    texto: "Todavia no se acredita el pago en Mercado Pago: no lo entregues aun.",
  };
}
