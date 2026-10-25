// Etiqueta de estado: el color nunca va solo, siempre con icono + texto.
import { ESTADOS_PAGO, ESTADOS_PEDIDO } from "../pagos";

export default function EstadoBadge({ estado, tipo = "pago" }) {
  const info = (tipo === "pago" ? ESTADOS_PAGO : ESTADOS_PEDIDO)[estado] || {
    nombre: estado,
    icono: "•",
    tono: "neutral",
  };
  return (
    <span className={`badge badge--${info.tono}`}>
      <span aria-hidden="true">{info.icono}</span> {info.nombre}
    </span>
  );
}
