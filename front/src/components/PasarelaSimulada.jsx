// Pasarela de pago de mentira, para cuando el backend no tiene MP_ACCESS_TOKEN.
// Imita lo que haria Mercado Pago con cada metodo y deja elegir el resultado.
// No pide datos de tarjeta: nunca se escriben numeros de tarjeta reales en un demo.
import { dinero } from "../pagos";

export default function PasarelaSimulada({ pedido, ocupado, onResultado }) {
  const { pago } = pedido;
  const fichaGenerada = pago.metodo === "oxxo" && pago.mp_payment_id;
  const linkDemo = `${window.location.origin}/?pago=retorno&pedido=${pedido.id}`;

  return (
    <div className="pasarela">
      <p className="pasarela__aviso">
        <strong>Modo demo:</strong> pasarela simulada, no se cobra nada. Para usar Mercado Pago real
        configura <code>MP_ACCESS_TOKEN</code> en <code>back/.env</code>.
      </p>

      {pago.estado === "rechazado" && (
        <p className="error">El pago fue rechazado (fondos insuficientes). Intenta de nuevo.</p>
      )}

      {(pago.metodo === "tarjeta_credito" || pago.metodo === "tarjeta_debito") && (
        <>
          <div className={"tarjeta" + (pago.metodo === "tarjeta_debito" ? " tarjeta--debito" : "")}>
            <span>{pago.metodo === "tarjeta_credito" ? "CREDITO" : "DEBITO"}</span>
            <span className="tarjeta__numero">•••• •••• •••• 3764</span>
            <span>TARJETA DE PRUEBA · 11/30</span>
          </div>
          <div className="fila">
            <button className="boton boton--primario" disabled={ocupado} onClick={() => onResultado("aprobado")}>
              Pagar {dinero(pedido.total)}
            </button>
            <button className="boton" disabled={ocupado} onClick={() => onResultado("rechazado")}>
              Simular tarjeta rechazada
            </button>
          </div>
        </>
      )}

      {pago.metodo === "oxxo" &&
        (fichaGenerada ? (
          <>
            <div className="ficha">
              <strong>OXXO · Ficha de pago</strong>
              <span>Referencia</span>
              <span className="ficha__referencia">
                {pago.mp_payment_id.replace("SIM-", "").toUpperCase().match(/.{1,4}/g).join(" ")}
              </span>
              <span>Monto a pagar: {dinero(pedido.total)}</span>
              <small>Vence en 3 dias. El pago se acredita minutos despues de pagar en caja.</small>
            </div>
            <button className="boton boton--primario" disabled={ocupado} onClick={() => onResultado("aprobado")}>
              Simular que ya pague en OXXO
            </button>
          </>
        ) : (
          <button className="boton boton--primario" disabled={ocupado} onClick={() => onResultado("pendiente")}>
            Generar ficha de pago
          </button>
        ))}

      {pago.metodo === "link_pago" && (
        <>
          <p>Link para pagar este pedido (en modo real es un link de Mercado Pago):</p>
          <div className="link-pago">
            <input readOnly value={linkDemo} onFocus={(e) => e.target.select()} />
            <button className="boton" onClick={() => navigator.clipboard.writeText(linkDemo)}>
              Copiar
            </button>
          </div>
          <div className="fila">
            <button className="boton boton--primario" disabled={ocupado} onClick={() => onResultado("aprobado")}>
              Simular que pagaron el link
            </button>
            <button className="boton" disabled={ocupado} onClick={() => onResultado("rechazado")}>
              Simular pago rechazado
            </button>
          </div>
        </>
      )}
    </div>
  );
}
