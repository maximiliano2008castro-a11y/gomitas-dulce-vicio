// Tema: Portales - createPortal para escapar overflow/z-index del layout.
// Tema: Hooks - useState local para la cantidad + useEffect para el listener de Esc.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { urlImagen } from "../api/client";

export default function ProductModal({ producto, onCerrar, onAgregar }) {
  const [cantidad, setCantidad] = useState(1);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCerrar]);

  if (!producto) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onCerrar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal__cerrar" onClick={onCerrar} aria-label="Cerrar">
          ✕
        </button>

        <img src={urlImagen(producto.imagen)} alt={producto.nombre} />
        <h2>{producto.nombre}</h2>
        <p>{producto.descripcion}</p>
        <p className="card__precio">${producto.precio.toFixed(2)}</p>
        <p className="card__stock">{producto.stock} disponibles</p>

        <div className="modal__cantidad">
          <label htmlFor="cantidad">Cantidad</label>
          <input
            id="cantidad"
            type="number"
            min="1"
            max={producto.stock}
            value={cantidad}
            onChange={(e) => {
              const valor = Number(e.target.value);
              setCantidad(Math.max(1, Math.min(valor, producto.stock)));
            }}
          />
        </div>

        <button
          className="boton boton--primario"
          onClick={() => {
            onAgregar(producto, cantidad);
            onCerrar();
          }}
        >
          Agregar al carrito
        </button>
      </div>
    </div>,
    document.body
  );
}
