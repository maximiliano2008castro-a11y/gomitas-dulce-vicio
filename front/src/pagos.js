// Textos e iconos de los metodos y estados de pago (los ids son los del backend).
export const METODOS = [
  {
    id: "tarjeta_credito",
    nombre: "Tarjeta de credito",
    icono: "💳",
    descripcion: "Visa, Mastercard o American Express. Hasta 12 meses.",
  },
  {
    id: "tarjeta_debito",
    nombre: "Tarjeta de debito",
    icono: "🏦",
    descripcion: "Paga directo desde tu cuenta bancaria.",
  },
  {
    id: "oxxo",
    nombre: "Efectivo en tienda",
    icono: "🏪",
    descripcion: "Genera una ficha y paga en OXXO u otra tienda de conveniencia.",
  },
  {
    id: "link_pago",
    nombre: "Link de pago",
    icono: "🔗",
    descripcion: "Recibe un link de Mercado Pago para pagar desde cualquier dispositivo o compartirlo.",
  },
  {
    id: "pickup",
    nombre: "Pagar al recoger",
    icono: "🛍️",
    descripcion: "Aparta tu pedido y paga en la tienda cuando pases por el.",
  },
];

export const METODO = Object.fromEntries(METODOS.map((m) => [m.id, m]));

// Colores de estado (good / warning / critical...) siempre acompañados de icono + texto.
export const ESTADOS_PAGO = {
  aprobado: { nombre: "Aprobado", icono: "✓", tono: "good" },
  pendiente: { nombre: "Pendiente", icono: "◷", tono: "warning" },
  rechazado: { nombre: "Rechazado", icono: "✕", tono: "critical" },
  cancelado: { nombre: "Cancelado", icono: "⊘", tono: "neutral" },
  reembolsado: { nombre: "Reembolsado", icono: "↺", tono: "serious" },
};

export const ESTADOS_PEDIDO = {
  pendiente_pago: { nombre: "Pendiente de pago", icono: "◷", tono: "warning" },
  pagado: { nombre: "Pagado", icono: "✓", tono: "good" },
  entregado: { nombre: "Entregado", icono: "📦", tono: "good" },
  cancelado: { nombre: "Cancelado", icono: "⊘", tono: "neutral" },
};

// payment_method_id de Mercado Pago -> nombre para mostrar
export const MEDIOS = {
  visa: "Visa",
  master: "Mastercard",
  amex: "American Express",
  debvisa: "Visa Debito",
  debmaster: "Mastercard Debito",
  oxxo: "OXXO",
  paycash: "Tiendas (PayCash)",
  account_money: "Saldo Mercado Pago",
};

export const dinero = (n) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export const fecha = (iso) =>
  new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z").toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
