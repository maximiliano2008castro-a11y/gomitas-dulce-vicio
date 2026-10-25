// Lista de todos los pedidos con filtros, en vivo. Al abrir uno se ve el detalle y,
// segun el rol, se puede confirmar la recogida, marcar pagado o cancelar.
import { useCallback, useEffect, useState } from "react";
import * as consultas from "../consultas";
import { useBackoffice } from "../contexto";
import { Cargando, ConfirmarDialogo, Modal, Vacio, hace } from "../ui";
import { EstadoCobro, instruccionDeRecogida, MiniaturasItems } from "./comunes";
import EstadoBadge from "../../components/EstadoBadge";
import { useUiStore } from "../../store/useUiStore";
import { dinero, fecha, METODO, METODOS } from "../../pagos";

const FILTROS_ESTADO = [
  { id: "", nombre: "Todos" },
  { id: "por_recoger", nombre: "Por recoger" },
  { id: "pendiente_pago", nombre: "Sin pagar" },
  { id: "pagado", nombre: "Pagados" },
  { id: "entregado", nombre: "Entregados" },
  { id: "cancelado", nombre: "Cancelados" },
];

export default function Pedidos() {
  const { esAdmin, version } = useBackoffice();
  const reconexiones = useUiStore((s) => s.reconexiones);
  const avisar = useUiStore((s) => s.avisar);

  const [estado, setEstado] = useState("");
  const [metodo, setMetodo] = useState("");
  const [buscar, setBuscar] = useState("");
  const [buscarAplicado, setBuscarAplicado] = useState("");
  const [lista, setLista] = useState(null);
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [accion, setAccion] = useState(null); // { tipo, pedido }
  const [ocupado, setOcupado] = useState(false);

  // La busqueda espera a que el usuario deje de escribir.
  useEffect(() => {
    const id = setTimeout(() => setBuscarAplicado(buscar), 300);
    return () => clearTimeout(id);
  }, [buscar]);

  const cargar = useCallback(async () => {
    try {
      const filtros = { limite: 150 };
      if (estado === "por_recoger") filtros.soloPorRecoger = true;
      else if (estado) filtros.estado = estado;
      if (metodo) filtros.metodo = metodo;
      if (buscarAplicado) filtros.buscar = buscarAplicado;
      setLista(await consultas.pedidos(filtros));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [estado, metodo, buscarAplicado]);

  useEffect(() => {
    cargar();
  }, [cargar, version, reconexiones]);

  // El pedido abierto se mantiene al dia si llega un cambio en vivo.
  useEffect(() => {
    if (abierto && lista) {
      const actualizado = lista.find((p) => p.id === abierto.id);
      if (actualizado && actualizado !== abierto) setAbierto(actualizado);
    }
  }, [lista, abierto]);

  async function ejecutarAccion() {
    setOcupado(true);
    try {
      const { tipo, pedido } = accion;
      if (tipo === "entregar") {
        await consultas.confirmarRecogida(pedido.id);
        avisar(`Pedido #${pedido.id} entregado`, "bueno", "✅");
      } else if (tipo === "pagar") {
        await consultas.marcarPagado(pedido.id);
        avisar(`Pedido #${pedido.id} marcado como pagado`, "bueno", "💳");
      } else if (tipo === "cancelar") {
        await consultas.cancelarPedido(pedido.id);
        avisar(`Pedido #${pedido.id} cancelado, el stock regreso al inventario`, "info", "⊘");
      }
      setAccion(null);
      cargar();
    } catch (err) {
      avisar(err.message, "malo", "⚠️");
      setAccion(null);
    } finally {
      setOcupado(false);
    }
  }

  const TEXTOS_ACCION = {
    entregar: { titulo: "Confirmar recogida", boton: "Si, ya lo recogio", peligro: false },
    pagar: { titulo: "Marcar como pagado", boton: "Marcar pagado", peligro: false },
    cancelar: { titulo: "Cancelar pedido", boton: "Cancelar pedido", peligro: true },
  };

  return (
    <div>
      <div className="bo-barra">
        <div className="bo-chips" role="group" aria-label="Estado del pedido">
          {FILTROS_ESTADO.map((f) => (
            <button
              key={f.id}
              className={"bo-chip-boton" + (estado === f.id ? " bo-chip-boton--activo" : "")}
              aria-pressed={estado === f.id}
              onClick={() => setEstado(f.id)}
            >
              {f.nombre}
            </button>
          ))}
        </div>
        <div className="bo-barra__derecha">
          <select className="bo-input" value={metodo} onChange={(e) => setMetodo(e.target.value)} aria-label="Metodo de pago">
            <option value="">Todos los metodos</option>
            {METODOS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
          <input
            className="bo-input"
            type="search"
            placeholder="Buscar: #folio, codigo o cliente"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            aria-label="Buscar pedido"
          />
        </div>
      </div>

      {error && <p className="bo-error">{error}</p>}
      {!lista && <Cargando />}
      {lista?.length === 0 && <Vacio icono="🧾" titulo="No hay pedidos con esos filtros" />}

      {lista?.length > 0 && (
        <div className="bo-tarjeta bo-tabla-caja">
          <table className="bo-tabla">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Metodo</th>
                <th className="num">Total</th>
                <th>Pago</th>
                <th>Estado</th>
                <th>Cuando</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} onClick={() => setAbierto(p)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setAbierto(p)}>
                  <td>
                    <strong>#{p.id}</strong> <span className="bo-codigo bo-codigo--chico">{p.codigoRecogida}</span>
                  </td>
                  <td>{p.cliente.nombre}</td>
                  <td>
                    {METODO[p.pago.metodo].icono} {METODO[p.pago.metodo].nombre}
                  </td>
                  <td className="num">{dinero(p.total)}</td>
                  <td>
                    <EstadoBadge estado={p.pago.estado} />
                  </td>
                  <td>
                    <EstadoBadge estado={p.estado} tipo="pedido" />
                  </td>
                  <td className="bo-tenue">{hace(p.fecha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abierto && (
        <Modal
          titulo={`Pedido #${abierto.id}`}
          onCerrar={() => setAbierto(null)}
          pie={
            // Sin acciones posibles (ej. pedido ya entregado) no se muestra la barra de botones.
            abierto.estado === "pendiente_pago" || instruccionDeRecogida(abierto).boton ? (
              <>
                {abierto.estado === "pendiente_pago" && (
                  <button className="bo-boton bo-boton--peligro-suave" onClick={() => setAccion({ tipo: "cancelar", pedido: abierto })}>
                    Cancelar pedido
                  </button>
                )}
                {esAdmin && abierto.estado === "pendiente_pago" && abierto.pago.metodo !== "pickup" && (
                  <button className="bo-boton" onClick={() => setAccion({ tipo: "pagar", pedido: abierto })}>
                    Marcar pagado
                  </button>
                )}
                {instruccionDeRecogida(abierto).boton && (
                  <button className="bo-boton bo-boton--bueno" onClick={() => setAccion({ tipo: "entregar", pedido: abierto })}>
                    {instruccionDeRecogida(abierto).boton}
                  </button>
                )}
              </>
            ) : null
          }
        >
          <div className="bo-detalle">
            <div className="bo-detalle__fila">
              <div>
                <small className="bo-tenue">Cliente</small>
                <strong>{abierto.cliente.nombre}</strong>
                <small className="bo-tenue">{abierto.cliente.email}</small>
              </div>
              <div>
                <small className="bo-tenue">Codigo de recogida</small>
                <span className="bo-codigo">{abierto.codigoRecogida}</span>
              </div>
            </div>
            <MiniaturasItems items={abierto.items} />
            <div className="bo-detalle__total">
              <span>Total</span>
              <strong>{dinero(abierto.total)}</strong>
            </div>
            <EstadoCobro pedido={abierto} />
            <p className="bo-tenue">
              Creado: {fecha(abierto.fecha)}
              {abierto.pago.mpPaymentId && <> · Folio de pago: {abierto.pago.mpPaymentId}</>}
              {abierto.fechaEntrega && (
                <>
                  <br />
                  Entregado: {fecha(abierto.fechaEntrega)} {abierto.entregadoPor && `por ${abierto.entregadoPor}`}
                </>
              )}
            </p>
            <p className={`bo-instruccion bo-instruccion--${instruccionDeRecogida(abierto).tipo}`}>
              {instruccionDeRecogida(abierto).texto}
            </p>
          </div>
        </Modal>
      )}

      {accion && (
        <ConfirmarDialogo
          titulo={TEXTOS_ACCION[accion.tipo].titulo}
          textoBoton={TEXTOS_ACCION[accion.tipo].boton}
          peligro={TEXTOS_ACCION[accion.tipo].peligro}
          ocupado={ocupado}
          onCancelar={() => setAccion(null)}
          onConfirmar={ejecutarAccion}
          texto={
            <p>
              Pedido <strong>#{accion.pedido.id}</strong> de {accion.pedido.cliente.nombre} por {dinero(accion.pedido.total)}.
            </p>
          }
        />
      )}
    </div>
  );
}
