// Tema: Fragment (<>) para agrupar sin nodo extra.
import { urlImagen } from "../api/client";

export default function ProductCard({ producto, onVerDetalle }) {
  const sinStock = producto.stock === 0;

  return (
    <button
      className="card"
      onClick={() => onVerDetalle(producto)}
      disabled={sinStock}
    >
      <img src={urlImagen(producto.imagen)} alt={producto.nombre} loading="lazy" />
      <>
        <h4>{producto.nombre}</h4>
        <p className="card__precio">${producto.precio.toFixed(2)}</p>
        {sinStock ? (
          <span className="card__stock card__stock--agotado">Agotado</span>
        ) : (
          <span className="card__stock">{producto.stock} disponibles</span>
        )}
      </>
    </button>
  );
}
