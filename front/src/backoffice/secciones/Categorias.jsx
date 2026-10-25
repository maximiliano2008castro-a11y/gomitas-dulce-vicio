// Administracion de categorias (nombre, descripcion y foto).
import { useCallback, useEffect, useState } from "react";
import * as consultas from "../consultas";
import { Cargando, ConfirmarDialogo, ImagenInput, Modal, Vacio } from "../ui";
import { urlImagen } from "../../api/client";
import { useUiStore } from "../../store/useUiStore";

export default function Categorias() {
  const avisar = useUiStore((s) => s.avisar);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState(null);
  const [formulario, setFormulario] = useState(null);
  const [porBorrar, setPorBorrar] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista(await consultas.categorias());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function borrar() {
    setOcupado(true);
    try {
      await consultas.eliminarCategoria(porBorrar.id);
      avisar(`Categoria ${porBorrar.nombre} eliminada`, "info", "🗑️");
      cargar();
    } catch (err) {
      avisar(err.message, "malo", "⚠️");
    } finally {
      setPorBorrar(null);
      setOcupado(false);
    }
  }

  return (
    <div>
      <div className="bo-barra">
        <p className="bo-tenue">Las categorias agrupan los productos en el menu de la tienda.</p>
        <button className="bo-boton bo-boton--primario" onClick={() => setFormulario({ nombre: "", descripcion: "", imagen: "" })}>
          + Nueva categoria
        </button>
      </div>

      {error && <p className="bo-error">{error}</p>}
      {!lista && <Cargando />}
      {lista?.length === 0 && <Vacio icono="🗂️" titulo="Aun no hay categorias" />}

      <div className="bo-categorias">
        {lista?.map((c) => (
          <article key={c.id} className="bo-tarjeta bo-categoria">
            <img src={urlImagen(c.imagen)} alt="" />
            <div className="bo-categoria__cuerpo">
              <h3>{c.nombre}</h3>
              <p className="bo-tenue">{c.descripcion}</p>
              <span className="bo-chip">{c.totalProductos} productos</span>
            </div>
            <div className="bo-acciones">
              <button className="bo-boton bo-boton--chico" onClick={() => setFormulario({ ...c })}>
                Editar
              </button>
              <button className="bo-icono-boton bo-icono-boton--peligro" onClick={() => setPorBorrar(c)} aria-label={`Eliminar ${c.nombre}`}>
                🗑️
              </button>
            </div>
          </article>
        ))}
      </div>

      {formulario && (
        <FormularioCategoria
          inicial={formulario}
          onCerrar={() => setFormulario(null)}
          onGuardado={(c, esNueva) => {
            setFormulario(null);
            avisar(esNueva ? `Categoria ${c.nombre} creada` : `Categoria ${c.nombre} actualizada`, "bueno", "✅");
            cargar();
          }}
        />
      )}

      {porBorrar && (
        <ConfirmarDialogo
          titulo="Eliminar categoria"
          textoBoton="Eliminar"
          peligro
          ocupado={ocupado}
          onCancelar={() => setPorBorrar(null)}
          onConfirmar={borrar}
          texto={
            <p>
              ¿Eliminar la categoria <strong>{porBorrar.nombre}</strong>? Solo se puede si no tiene productos.
            </p>
          }
        />
      )}
    </div>
  );
}

function FormularioCategoria({ inicial, onCerrar, onGuardado }) {
  const [datos, setDatos] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const esNueva = !inicial.id;

  async function guardar(e) {
    e.preventDefault();
    if (!datos.nombre.trim() || !datos.descripcion.trim()) {
      setError("Escribe el nombre y una descripcion.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const enviar = { nombre: datos.nombre, descripcion: datos.descripcion, imagen: datos.imagen || "" };
      const resultado = esNueva ? await consultas.crearCategoria(enviar) : await consultas.actualizarCategoria(inicial.id, enviar);
      onGuardado(resultado, esNueva);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo={esNueva ? "Nueva categoria" : `Editar ${inicial.nombre}`}
      onCerrar={onCerrar}
      ancho={520}
      pie={
        <>
          <button type="button" className="bo-boton" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form="form-categoria" className="bo-boton bo-boton--primario" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </>
      }
    >
      <form id="form-categoria" className="bo-form-simple" onSubmit={guardar} noValidate>
        <label className="bo-campo">
          <span>Nombre</span>
          <input className="bo-input" value={datos.nombre} maxLength={80} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} autoFocus />
        </label>
        <label className="bo-campo">
          <span>Descripcion</span>
          <input className="bo-input" value={datos.descripcion} maxLength={255} onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })} />
        </label>
        <div className="bo-campo">
          <span>Foto</span>
          <ImagenInput valor={datos.imagen} onCambio={(url) => setDatos({ ...datos, imagen: url })} />
        </div>
        {error && <p className="bo-error">{error}</p>}
      </form>
    </Modal>
  );
}
