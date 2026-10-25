// Tema: Estilizacion - misma seccion usando className (CSS normal) y,
// en una tarjeta, style={} inline como forma alterna del mismo resultado.
const ventajas = [
  { titulo: "Ingredientes reales", texto: "Sabores naturales, sin rellenos raros." },
  { titulo: "Entrega rapida", texto: "Tu pedido en menos de 24 horas." },
  { titulo: "Stock en vivo", texto: "El catalogo se lee directo del backend." },
];

export default function ContextSection() {
  return (
    <section className="context">
      {ventajas.map((ventaja, index) => (
        <div
          key={ventaja.titulo}
          className="context__card"
          style={index === 2 ? { borderColor: "#22c55e" } : undefined}
        >
          <h4>{ventaja.titulo}</h4>
          <p>{ventaja.texto}</p>
        </div>
      ))}
    </section>
  );
}
