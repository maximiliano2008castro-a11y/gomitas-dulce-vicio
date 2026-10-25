// Estacion de recogida (mostrador). Aqui el trabajador confirma que el cliente ya recogio
// su pedido. Dos formas:
//   1) Escribir el codigo de 6 caracteres que le muestra el cliente.
//   2) Elegir el pedido de la fila "Por recoger" (se actualiza en vivo).
import { useCallback, useEffect, useRef, useState } from "react";
import * as consultas from "../consultas";
import { useBackoffice } from "../contexto";
import { ConfirmarDialogo, Cargando, hace, minutosEsperando, useReloj, Vacio } from "../ui";
import { EstadoCobro, instruccionDeRecogida, MiniaturasItems } from "./comunes";
import { useUiStore } from "../../store/useUiStore";
import { dinero, fecha } from "../../pagos";

export default function Recogida() {
  const { version } = useBackoffice();
  const reconexiones = useUiStore((s) => s.reconexiones);
  const avisar = useUiStore((s) => s.avisar);
  useReloj();

  const [cola, setCola] = useState(null);
  const [entregadosHoy, setEntregadosHoy] = useState([]);
  const [error, setError] = useState(null);
  const [nuevos, setNuevos] = useState([]);
  const yaVistos = useRef(null);

  const [codigo, setCodigo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [encontrado, setEncontrado] = useState(null);
  const [noExiste, setNoExiste] = useState(false);

  const [porConfirmar, setPorConfirmar] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const inputCodigo = useRef(null);

  // Fila de espera + entregados recientes. Se repite con cada evento en vivo.
  const cargar = useCallback(async () => {
    try {
      const [porRecoger, entregados] = await Promise.all([
        consultas.pedidos({ soloPorRecoger: true, limite: 100 }),
        consultas.pedidos({ estado: "entregado", limite: 8 }),
      ]);
      // Los pedidos que no estaban en la carga anterior se resaltan unos segundos.
      if (yaVistos.current) {
        const llegaron = porRecoger.filter((p) => !yaVistos.current.has(p.id)).map((p) => p.id);
        if (llegaron.length > 0) {
          setNuevos((viejos) => [...viejos, ...llegaron]);
          setTimeout(() => setNuevos((viejos) => viejos.filter((id) => !llegaron.includes(id))), 6000);
        }
      }
      yaVistos.current = new Set(porRecoger.map((p) => p.id));
      setCola(porRecoger);
      setEntregadosHoy(entregados);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, version, reconexiones]);

  useEffect(() => {
    inputCodigo.current?.focus();
  }, []);

  async function buscar(texto) {
    setBuscando(true);
    setNoExiste(false);
    setEncontrado(null);
    try {
      const pedido = await consultas.pedidoPorCodigo(texto);
      if (pedido) setEncontrado(pedido);
      else setNoExiste(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBuscando(false);
    }
  }

  function alEscribirCodigo(e) {
    const limpio = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    setCodigo(limpio);
    setNoExiste(false);
    if (limpio.length === 6) buscar(limpio);
    else setEncontrado(null);
  }

  async function confirmar() {
    setOcupado(true);
    try {
      // Si vino de buscar por codigo, se manda el codigo para que el servidor lo valide.
      const codigoAValidar = encontrado && encontrado.id === porConfirmar.id ? codigo : null;
      const pedido = await consultas.confirmarRecogida(porConfirmar.id, codigoAValidar);
      avisar(`Pedido #${pedido.id} entregado a ${pedido.cliente.nombre}`, "bueno", "✅");
      setPorConfirmar(null);
      setEncontrado(null);
      setCodigo("");
      inputCodigo.current?.focus();
      cargar();
    } catch (err) {
      avisar(err.message, "malo", "⚠️");
      setPorConfirmar(null);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="bo-recogida">
      {/* ---------- Buscar por codigo ---------- */}
      <section className="bo-tarjeta bo-buscador">
        <div className="bo-buscador__texto">
          <h2>¿El cliente ya llego?</h2>
          <p>Pidele su codigo de recogida (6 caracteres) y escribelo aqui.</p>
        </div>
        <input
          ref={inputCodigo}
          className="bo-codigo-input"
          value={codigo}
          onChange={alEscribirCodigo}
          placeholder="K7M2QX"
          aria-label="Codigo de recogida"
          autoComplete="off"
          spellCheck="false"
        />
      </section>

      {buscando && <Cargando texto="Buscando pedido..." />}
      {noExiste && (
        <p className="bo-aviso-inline bo-aviso-inline--malo">
          No hay ningun pedido con el codigo <strong>{codigo}</strong>. Revisa que este bien escrito.
        </p>
      )}
      {encontrado && <DetalleParaEntregar pedido={encontrado} onEntregar={() => setPorConfirmar(encontrado)} destacado />}

      {error && <p className="bo-error">{error}</p>}

      {/* ---------- Fila por recoger ---------- */}
      <section>
        <div className="bo-seccion-titulo">
          <h2>Por recoger</h2>
          {cola && <span className="bo-chip">{cola.length}</span>}
        </div>

        {!cola && <Cargando />}
        {cola?.length === 0 && (
          <Vacio icono="🎉" titulo="No hay pedidos esperando" texto="Cuando entre uno nuevo o se acredite un pago, aparece aqui solo." />
        )}

        <div className="bo-cola">
          {cola?.map((pedido) => (
            <DetalleParaEntregar
              key={pedido.id}
              pedido={pedido}
              nuevo={nuevos.includes(pedido.id)}
              urgente={minutosEsperando(pedido.fecha) > 45}
              onEntregar={() => setPorConfirmar(pedido)}
            />
          ))}
        </div>
      </section>

      {/* ---------- Entregados recientes ---------- */}
      {entregadosHoy.length > 0 && (
        <section>
          <div className="bo-seccion-titulo">
            <h2>Entregados recientemente</h2>
          </div>
          <ul className="bo-lista-simple">
            {entregadosHoy.map((p) => (
              <li key={p.id}>
                <span>
                  ✅ <strong>#{p.id}</strong> · {p.cliente.nombre}
                </span>
                <span className="bo-tenue">
                  {dinero(p.total)} · {p.fechaEntrega ? fecha(p.fechaEntrega) : ""} {p.entregadoPor ? `· ${p.entregadoPor}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {porConfirmar && (
        <ConfirmarDialogo
          titulo={`Entregar pedido #${porConfirmar.id}`}
          textoBoton={instruccionDeRecogida(porConfirmar).boton || "Confirmar"}
          ocupado={ocupado}
          onCancelar={() => setPorConfirmar(null)}
          onConfirmar={confirmar}
          texto={
            <>
              <p>
                ¿<strong>{porConfirmar.cliente.nombre}</strong> ya recogio sus{" "}
                {porConfirmar.items.reduce((n, i) => n + i.cantidad, 0)} productos?
              </p>
              <p className="bo-tenue">{instruccionDeRecogida(porConfirmar).texto}</p>
            </>
          }
        />
      )}
    </div>
  );
}

// Tarjeta de un pedido listo para entregar (la del buscador y las de la fila).
function DetalleParaEntregar({ pedido, onEntregar, destacado = false, nuevo = false, urgente = false }) {
  const instruccion = instruccionDeRecogida(pedido);
  const puedeEntregar = Boolean(instruccion.boton);

  return (
    <article
      className={
        "bo-pedido-recoger" +
        (destacado ? " bo-pedido-recoger--destacado" : "") +
        (nuevo ? " bo-pedido-recoger--nuevo" : "") +
        (urgente ? " bo-pedido-recoger--urgente" : "")
      }
    >
      <header>
        <div>
          <span className="bo-codigo">{pedido.codigoRecogida}</span>
          <h3>
            Pedido #{pedido.id} · {pedido.cliente.nombre}
          </h3>
          <small className="bo-tenue">
            {hace(pedido.fecha)}
            {urgente && " · esperando mucho"}
          </small>
        </div>
        <strong className="bo-total">{dinero(pedido.total)}</strong>
      </header>

      <MiniaturasItems items={pedido.items} />
      <EstadoCobro pedido={pedido} />

      <p className={`bo-instruccion bo-instruccion--${instruccion.tipo}`}>{instruccion.texto}</p>

      {puedeEntregar && (
        <button
          className={"bo-boton bo-boton--grande " + (instruccion.tipo === "cobrar" ? "bo-boton--aviso" : "bo-boton--bueno")}
          onClick={onEntregar}
        >
          {instruccion.tipo === "cobrar" ? "💵 " : "✅ "}
          {instruccion.boton}
        </button>
      )}
    </article>
  );
}
