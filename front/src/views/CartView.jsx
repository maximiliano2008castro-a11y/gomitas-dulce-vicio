// Tema: Zustand (estado global del carrito) + eventos onChange/onClick.
import { urlImagen } from "../api/client";

export default function CartView({ cart, onVolver, onIrCheckout }) {
  const { items, cambiarCantidad, quitarProducto, total } = cart;

  return (
    <main className="main">
      <button className="boton boton--enlace" onClick={onVolver}>
        ← Seguir comprando
      </button>

      <h2>Tu carrito</h2>

      {items.length === 0 ? (
        <p>Tu carrito esta vacio.</p>
      ) : (
        <>
          <ul className="cart-list">
            {items.map((item) => (
              <li key={item.id} className="cart-list__item">
                <img src={urlImagen(item.imagen)} alt={item.nombre} />
                <div className="cart-list__info">
                  <h4>{item.nombre}</h4>
                  <p>${item.precio.toFixed(2)} c/u</p>
                </div>

                <input
                  type="number"
                  min="1"
                  value={item.cantidad}
                  onChange={(e) => cambiarCantidad(item.id, Number(e.target.value))}
                />

                <p className="cart-list__subtotal">
                  ${(item.precio * item.cantidad).toFixed(2)}
                </p>

                <button
                  className="boton boton--peligro"
                  onClick={() => quitarProducto(item.id)}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>

          <div className="cart-total">
            <span>Total: ${total().toFixed(2)}</span>
            <button className="boton boton--primario" onClick={onIrCheckout}>
              Ir a checkout
            </button>
          </div>
        </>
      )}
    </main>
  );
}
