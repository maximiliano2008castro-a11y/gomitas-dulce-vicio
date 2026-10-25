// Tema: Eventos HTML (onSubmit) + Hooks (useState) + Fetching (POST protegido con OAuth2).
// El cliente ya no se captura aqui: el backend lo saca del token. Despues de crear el
// pedido, App lleva a la vista de pago correspondiente al metodo elegido.
import { useState } from "react";
import { API } from "../api/client";
import { useAuthStore } from "../store/useAuthStore";
import MetodoSelector from "../components/MetodoSelector";
import { dinero } from "../pagos";

export default function CheckoutView({ cart, onVolver, onPedidoCreado }) {
  const usuario = useAuthStore((s) => s.usuario);
  const [metodo, setMetodo] = useState("tarjeta_credito");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    try {
      const pedido = await API.crearPedido(
        cart.items.map((item) => ({ producto_id: item.id, cantidad: item.cantidad })),
        metodo
      );
      cart.vaciarCarrito();
      onPedidoCreado(pedido.id);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <main className="main">
      <button className="boton boton--enlace" onClick={onVolver}>
        ← Volver al carrito
      </button>

      <h2>Checkout</h2>

      <form className="form form--ancho" onSubmit={handleSubmit}>
        <p>
          Pedido a nombre de <strong>{usuario?.nombre}</strong> ({usuario?.email})
        </p>

        <MetodoSelector valor={metodo} onCambiar={setMetodo} />

        <p className="cart-total">
          <span>Total a pagar: {dinero(cart.total())}</span>
        </p>

        {error && <p className="error">{error}</p>}

        <button
          className="boton boton--primario"
          type="submit"
          disabled={enviando || cart.items.length === 0}
        >
          {enviando
            ? "Registrando pedido..."
            : metodo === "pickup"
              ? "Apartar pedido"
              : "Continuar al pago"}
        </button>
      </form>
    </main>
  );
}
