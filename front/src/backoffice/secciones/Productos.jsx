// Administracion de productos: crear, editar (nombre, descripcion, precio, foto, categoria),
// ajustar stock, ocultar de la tienda y eliminar. El inventario se actualiza en vivo
// con la subscription inventarioEnVivo (si alguien compra, el stock baja solo).
import { useCallback, useEffect, useState } from "react";
import * as consultas from "../consultas";
import { useBackoffice } from "../contexto";
import { Cargando, ConfirmarDialogo, ImagenInput, Interruptor, Modal, Vacio } from "../ui";
import { urlImagen } from "../../api/client";
import { useSuscripcion } from "../../hooks/useSuscripcion";
import { useUiStore } from "../../store/useUiStore";
import { dinero } from "../../pagos";

const VACIO = { nombre: "", descripcion: "", precio: "", stock: "", imagen: "", categoriaId: "", activo: true };

export default function Productos() {
  const { version } = useBackoffice();
  const reconexiones = useUiStore((s) => s.reconexiones);
  const avisar = useUiStore((s) => s.avisar);

  const [lista, setLista] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [soloBajos, setSoloBajos] = useState(false);
  const [destellos, setDestellos] = useState([]);

  const [formulario, setFormulario] = useState(null); // null | { id?, ...campos }
  const [porBorrar, setPorBorrar] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [productos, cats] = await Promise.all([consultas.productos(), consultas.categorias()]);
      setLista(productos);
      setCategorias(cats);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, reconexiones]);

  // Un pedido cambia el stock; se recarga para mantenerlo al dia aunque no llegue el evento de inventario.
  useEffect(() => {
    if (version > 0) cargar();
  }, [version, cargar]);

  // ----- En vivo: cambios de inventario -----
  const alCambiarInventario = useCallback((datos) => {
    const evento = datos.inventarioEnVivo;
    setLista((actual) => {
      if (!actual) return actual;
      if (evento.tipo === "ELIMINADO" || !evento.producto) return actual.filter((p) => p.id !== evento.productoId);
      const existe = actual.some((p) => p.id === evento.productoId);
      if (existe) return actual.map((p) => (p.id === evento.productoId ? evento.producto : p));
      return [...actual, evento.producto].sort((a, b) => a.nombre.localeCompare(b.nombre));
    });
    // Se resalta la fila unos segundos para que se note que cambio.
    setDestellos((v) => [...v, evento.productoId]);
    setTimeout(() => setDestellos((v) => v.filter((id) => id !== evento.productoId)), 1800);
  }, []);
  useSuscripcion(consultas.INVENTARIO_EN_VIVO, alCambiarInventario);

  // ----- Filtros (en el navegador) -----
  const visibles = (lista || []).filter((p) => {
    if (busqueda && !p.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false;
    if (categoriaId && p.categoriaId !== Number(categoriaId)) return false;
    if (soloBajos && p.stock > 5) return false;
    return true;
  });

  // ----- Acciones -----
  async function cambiarStock(producto, nuevoStock) {
    if (nuevoStock < 0 || Number.isNaN(nuevoStock)) return;
    try {
      await consultas.ajustarStock(producto.id, nuevoStock);
    } catch (err) {
      avisar(err.message, "malo", "⚠️");
      cargar();
    }
  }

  async function cambiarVisible(producto, activo) {
    try {
      await consultas.cambiarActivo(producto.id, activo);
      avisar(activo ? `${producto.nombre} ya se ve en la tienda` : `${producto.nombre} oculto de la tienda`, "info", activo ? "👁️" : "🙈");
    } catch (err) {
      avisar(err.message, "malo", "⚠️");
    }
  }

  async function borrar() {
    setOcupado(true);
    try {
      await consultas.eliminarProducto(porBorrar.id);
      avisar(`${porBorrar.nombre} eliminado`, "info", "🗑️");
      setPorBorrar(null);
    } catch (err) {
      avisar(err.message, "malo", "⚠️");
      setPorBorrar(null);
    } finally {
      setOcupado(false);
    }
  }

  function abrirNuevo() {
    setFormulario({ ...VACIO, categoriaId: categorias[0]?.id ?? "" });
  }

  function abrirEditar(p) {
    setFormulario({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: String(p.precio),
      stock: String(p.stock),
      imagen: p.imagen,
      categoriaId: p.categoriaId,
      activo: p.activo,
    });
  }

  return (
    <div>
      <div className="bo-barra">
        <div className="bo-barra__izquierda">
          <input
            className="bo-input"
            type="search"
            placeholder="Buscar producto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar producto"
          />
          <select className="bo-input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} aria-label="Categoria">
            <option value="">Todas las categorias</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <label className="bo-check">
            <input type="checkbox" checked={soloBajos} onChange={(e) => setSoloBajos(e.target.checked)} />
            Stock bajo
          </label>
        </div>
        <button className="bo-boton bo-boton--primario" onClick={abrirNuevo} disabled={categorias.length === 0}>
          + Nuevo producto
        </button>
      </div>

      {error && <p className="bo-error">{error}</p>}
      {!lista && <Cargando />}
      {lista && visibles.length === 0 && (
        <Vacio icono="🍬" titulo="No hay productos con esos filtros">
          <button className="bo-boton bo-boton--primario" onClick={abrirNuevo}>
            + Agregar el primero
          </button>
        </Vacio>
      )}

      {visibles.length > 0 && (
        <div className="bo-tarjeta bo-tabla-caja">
          <div className="bo-productos">
            <div className="bo-productos__cabecera">
              <span>Producto</span>
              <span>Precio</span>
              <span>Stock</span>
              <span>En tienda</span>
              <span />
            </div>
            {visibles.map((p) => (
              <div
                key={p.id}
                className={
                  "bo-productos__fila" +
                  (destellos.includes(p.id) ? " bo-productos__fila--destello" : "") +
                  (p.activo ? "" : " bo-productos__fila--oculto")
                }
              >
                <div className="bo-producto-celda">
                  <img src={urlImagen(p.imagen)} alt="" />
                  <div>
                    <strong>{p.nombre}</strong>
                    <small className="bo-tenue">{p.categoriaNombre}</small>
                    <small className="bo-producto-celda__desc">{p.descripcion}</small>
                  </div>
                </div>
                <div className="bo-precio">{dinero(p.precio)}</div>
                <div className="bo-stock-control">
                  <button className="bo-icono-boton" onClick={() => cambiarStock(p, p.stock - 1)} disabled={p.stock === 0} aria-label="Quitar uno">
                    −
                  </button>
                  <input
                    type="number"
                    min="0"
                    key={p.stock}
                    defaultValue={p.stock}
                    className={"bo-stock-input" + (p.stock === 0 ? " bo-stock-input--cero" : p.stock <= 5 ? " bo-stock-input--bajo" : "")}
                    aria-label={`Stock de ${p.nombre}`}
                    onBlur={(e) => Number(e.target.value) !== p.stock && cambiarStock(p, Number(e.target.value))}
                    onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                  />
                  <button className="bo-icono-boton" onClick={() => cambiarStock(p, p.stock + 1)} aria-label="Agregar uno">
                    +
                  </button>
                </div>
                <div>
                  <Interruptor activo={p.activo} etiqueta={`Mostrar ${p.nombre} en la tienda`} onCambio={(v) => cambiarVisible(p, v)} />
                </div>
                <div className="bo-acciones">
                  <button className="bo-boton bo-boton--chico" onClick={() => abrirEditar(p)}>
                    Editar
                  </button>
                  <button className="bo-icono-boton bo-icono-boton--peligro" onClick={() => setPorBorrar(p)} aria-label={`Eliminar ${p.nombre}`} title="Eliminar">
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {formulario && (
        <FormularioProducto
          inicial={formulario}
          categorias={categorias}
          onCerrar={() => setFormulario(null)}
          onGuardado={(producto, esNuevo) => {
            setFormulario(null);
            avisar(esNuevo ? `${producto.nombre} agregado a la tienda` : `${producto.nombre} actualizado`, "bueno", "✅");
            cargar();
          }}
        />
      )}

      {porBorrar && (
        <ConfirmarDialogo
          titulo="Eliminar producto"
          textoBoton="Eliminar"
          peligro
          ocupado={ocupado}
          onCancelar={() => setPorBorrar(null)}
          onConfirmar={borrar}
          texto={
            <>
              <p>
                ¿Eliminar <strong>{porBorrar.nombre}</strong> para siempre?
              </p>
              <p className="bo-tenue">Si ya se vendio alguna vez no se puede borrar; en ese caso ocultalo de la tienda con el interruptor.</p>
            </>
          }
        />
      )}
    </div>
  );
}

// ---------------- Formulario crear / editar ----------------
function FormularioProducto({ inicial, categorias, onCerrar, onGuardado }) {
  const [datos, setDatos] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const esNuevo = !inicial.id;

  function cambiar(campo, valor) {
    setDatos((viejo) => ({ ...viejo, [campo]: valor }));
  }

  async function guardar(e) {
    e.preventDefault();
    setError(null);

    // Validaciones sencillas antes de molestar al servidor.
    const precio = Number(datos.precio);
    const stock = Number(datos.stock);
    if (!datos.nombre.trim()) return setError("Ponle un nombre al producto.");
    if (!datos.descripcion.trim()) return setError("Escribe una descripcion corta.");
    if (datos.precio === "" || Number.isNaN(precio) || precio < 0) return setError("El precio no es valido.");
    if (datos.stock === "" || !Number.isInteger(stock) || stock < 0) return setError("El stock debe ser un numero entero (0 o mas).");

    const enviar = {
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion.trim(),
      precio,
      stock,
      imagen: datos.imagen,
      categoriaId: Number(datos.categoriaId),
      activo: datos.activo,
    };

    setGuardando(true);
    try {
      const guardado = esNuevo ? await consultas.crearProducto(enviar) : await consultas.actualizarProducto(inicial.id, enviar);
      onGuardado(guardado, esNuevo);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const categoria = categorias.find((c) => c.id === Number(datos.categoriaId));

  return (
    <Modal
      titulo={esNuevo ? "Nuevo producto" : `Editar ${inicial.nombre}`}
      onCerrar={onCerrar}
      ancho={860}
      pie={
        <>
          <button type="button" className="bo-boton" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" form="form-producto" className="bo-boton bo-boton--primario" disabled={guardando}>
            {guardando ? "Guardando..." : esNuevo ? "Crear producto" : "Guardar cambios"}
          </button>
        </>
      }
    >
      <form id="form-producto" className="bo-form-producto" onSubmit={guardar} noValidate>
        <div className="bo-form-producto__campos">
          <label className="bo-campo">
            <span>Nombre</span>
            <input className="bo-input" value={datos.nombre} maxLength={120} onChange={(e) => cambiar("nombre", e.target.value)} placeholder="Ej. Gusanitos acidos" autoFocus />
          </label>

          <label className="bo-campo">
            <span>
              Descripcion <small className="bo-tenue">{datos.descripcion.length}/255</small>
            </span>
            <textarea
              className="bo-input"
              rows={3}
              maxLength={255}
              value={datos.descripcion}
              onChange={(e) => cambiar("descripcion", e.target.value)}
              placeholder="Lo que el cliente ve al abrir el producto"
            />
          </label>

          <div className="bo-campo-fila">
            <label className="bo-campo">
              <span>Precio (MXN)</span>
              <input className="bo-input" type="number" min="0" step="0.5" value={datos.precio} onChange={(e) => cambiar("precio", e.target.value)} placeholder="0.00" />
            </label>
            <label className="bo-campo">
              <span>Stock (piezas)</span>
              <input className="bo-input" type="number" min="0" step="1" value={datos.stock} onChange={(e) => cambiar("stock", e.target.value)} placeholder="0" />
            </label>
          </div>

          <label className="bo-campo">
            <span>Categoria</span>
            <select className="bo-input" value={datos.categoriaId} onChange={(e) => cambiar("categoriaId", e.target.value)}>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>

          <div className="bo-campo bo-campo--switch">
            <span>
              Mostrar en la tienda
              <small className="bo-tenue">Apagado = oculto para los clientes</small>
            </span>
            <Interruptor activo={datos.activo} etiqueta="Mostrar en la tienda" onCambio={(v) => cambiar("activo", v)} />
          </div>

          {error && <p className="bo-error">{error}</p>}
        </div>

        <div className="bo-form-producto__lado">
          <div className="bo-campo">
            <span>Foto</span>
            <ImagenInput valor={datos.imagen} onCambio={(url) => cambiar("imagen", url)} />
          </div>

          <div className="bo-campo">
            <span>Asi se vera en la tienda</span>
            <div className="card bo-vista-previa">
              <img src={datos.imagen ? urlImagen(datos.imagen) : "https://placehold.co/400x300/e5e0ec/898781?text=Sin+foto"} alt="" />
              <h4>{datos.nombre || "Nombre del producto"}</h4>
              <p className="card__precio">{dinero(Number(datos.precio) || 0)}</p>
              <span className="card__stock">{Number(datos.stock) || 0} disponibles</span>
              {categoria && <small className="bo-tenue">{categoria.nombre}</small>}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
