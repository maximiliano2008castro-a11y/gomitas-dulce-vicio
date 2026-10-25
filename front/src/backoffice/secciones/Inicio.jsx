// Pantalla de inicio: numeros del dia, actividad en vivo y productos por reponer.
import { useEffect, useState } from "react";
import * as consultas from "../consultas";
import { useBackoffice } from "../contexto";
import { Vacio } from "../ui";
import { urlImagen } from "../../api/client";
import { dinero } from "../../pagos";

function saludo() {
  const hora = new Date().getHours();
  if (hora < 12) return "Buenos dias";
  if (hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

function Numero({ icono, etiqueta, valor, nota, tono = "", onClick }) {
  const Etiqueta = onClick ? "button" : "div";
  return (
    <Etiqueta className={`bo-numero bo-numero--${tono}`} onClick={onClick}>
      <span className="bo-numero__icono" aria-hidden="true">{icono}</span>
      <span className="bo-numero__valor">{valor ?? "—"}</span>
      <span className="bo-numero__etiqueta">{etiqueta}</span>
      {nota && <small>{nota}</small>}
    </Etiqueta>
  );
}

export default function Inicio() {
  const { usuario, esAdmin, resumen, actividad, ir, version } = useBackoffice();
  const [porReponer, setPorReponer] = useState([]);

  // El admin ve que productos se estan acabando (se refresca con cada pedido nuevo).
  useEffect(() => {
    if (!esAdmin) return;
    let cancelado = false;
    consultas
      .productos()
      .then((lista) => {
        if (cancelado) return;
        const bajos = lista.filter((p) => p.activo && p.stock <= 5).sort((a, b) => a.stock - b.stock);
        setPorReponer(bajos.slice(0, 6));
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [esAdmin, version]);

  return (
    <div className="bo-inicio">
      <div className="bo-saludo">
        <h2>
          {saludo()}, {usuario.nombre.split(" ")[0]} 👋
        </h2>
        <p>Esto es lo que esta pasando en la tienda ahora mismo.</p>
      </div>

      <section className="bo-numeros">
        <Numero
          icono="🛍️"
          etiqueta="Por recoger"
          valor={resumen?.porRecoger}
          tono={resumen?.porRecoger > 0 ? "aviso" : ""}
          nota="Clientes por pasar"
          onClick={() => ir("recogida")}
        />
        <Numero
          icono="🛎️"
          etiqueta="Pedidos hoy"
          valor={resumen?.pedidosHoy}
          nota={`${resumen?.entregadosHoy ?? 0} entregados`}
          onClick={() => ir("pedidos")}
        />
        <Numero
          icono="⏳"
          etiqueta="Esperando pago"
          valor={resumen?.pendientesDePago}
          nota="Mercado Pago / OXXO"
        />
        {esAdmin && (
          <Numero
            icono="💰"
            etiqueta="Cobrado hoy"
            valor={resumen ? dinero(resumen.ingresosHoy ?? 0) : null}
            tono="bueno"
            nota="Pagos aprobados"
            onClick={() => ir("estadisticas")}
          />
        )}
        {esAdmin && (
          <Numero
            icono="📦"
            etiqueta="Por reponer"
            valor={resumen ? resumen.productosStockBajo + resumen.productosAgotados : null}
            tono={resumen && resumen.productosAgotados > 0 ? "malo" : ""}
            nota={`${resumen?.productosAgotados ?? 0} agotados`}
            onClick={() => ir("productos")}
          />
        )}
      </section>

      <div className="bo-dos-columnas">
        <section className="bo-tarjeta">
          <div className="bo-seccion-titulo">
            <h3>Actividad en vivo</h3>
            <span className="bo-chip bo-chip--vivo">● en vivo</span>
          </div>
          {actividad.length === 0 ? (
            <Vacio icono="📡" titulo="Todo tranquilo" texto="Cuando entre un pedido, se pague o se recoja, lo veras aqui al instante." />
          ) : (
            <ul className="bo-actividad">
              {actividad.map((a) => (
                <li key={a.id}>
                  <span className="bo-actividad__icono">{a.icono}</span>
                  <span>{a.texto}</span>
                  <small className="bo-tenue">{a.hora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</small>
                </li>
              ))}
            </ul>
          )}
        </section>

        {esAdmin ? (
          <section className="bo-tarjeta">
            <div className="bo-seccion-titulo">
              <h3>Por reponer</h3>
              <button className="bo-enlace" onClick={() => ir("productos")}>Ver productos →</button>
            </div>
            {porReponer.length === 0 ? (
              <Vacio icono="✅" titulo="Inventario sano" texto="Ningun producto tiene 5 piezas o menos." />
            ) : (
              <ul className="bo-lista-simple">
                {porReponer.map((p) => (
                  <li key={p.id}>
                    <span className="bo-mini-producto">
                      <img src={urlImagen(p.imagen)} alt="" />
                      {p.nombre}
                    </span>
                    <span className={"bo-stock " + (p.stock === 0 ? "bo-stock--cero" : "bo-stock--bajo")}>
                      {p.stock === 0 ? "Agotado" : `${p.stock} pzas`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="bo-tarjeta bo-guia">
            <h3>Como entregar un pedido</h3>
            <ol>
              <li>Pidele al cliente su <strong>codigo de recogida</strong> (6 caracteres).</li>
              <li>Escribelo en <button className="bo-enlace" onClick={() => ir("recogida")}>Recogida</button>.</li>
              <li>Si ya pago en Mercado Pago, solo entregalo. Si es <em>pagar al recoger</em>, cobra en caja.</li>
              <li>Pulsa <strong>Confirmar</strong>: el pedido queda como entregado.</li>
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
