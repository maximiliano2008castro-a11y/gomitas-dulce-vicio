// Piezas de interfaz reutilizables del backoffice.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { API, urlImagen } from "../api/client";
import { useUiStore } from "../store/useUiStore";

// ---------------- Modal ----------------
export function Modal({ titulo, onCerrar, children, ancho = 560, pie = null }) {
  useEffect(() => {
    function alTeclear(e) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  return createPortal(
    <div className="bo-modal-fondo" onMouseDown={onCerrar}>
      <div
        className="bo-modal"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        style={{ maxWidth: ancho }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="bo-modal__cabecera">
          <h3>{titulo}</h3>
          <button className="bo-icono-boton" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="bo-modal__cuerpo">{children}</div>
        {pie && <footer className="bo-modal__pie">{pie}</footer>}
      </div>
    </div>,
    document.body
  );
}

// ---------------- Confirmacion (reemplaza al confirm() feo del navegador) ----------------
export function ConfirmarDialogo({ titulo, texto, textoBoton = "Confirmar", peligro = false, ocupado, onConfirmar, onCancelar }) {
  return (
    <Modal
      titulo={titulo}
      onCerrar={onCancelar}
      ancho={440}
      pie={
        <>
          <button className="bo-boton" onClick={onCancelar} disabled={ocupado}>
            Volver
          </button>
          <button
            className={"bo-boton " + (peligro ? "bo-boton--peligro" : "bo-boton--primario")}
            onClick={onConfirmar}
            disabled={ocupado}
            autoFocus
          >
            {ocupado ? "Un momento..." : textoBoton}
          </button>
        </>
      }
    >
      <div className="bo-texto-confirmar">{texto}</div>
    </Modal>
  );
}

// ---------------- Avisos (toasts) ----------------
export function Avisos() {
  const toasts = useUiStore((s) => s.toasts);
  const quitar = useUiStore((s) => s.quitarAviso);

  return createPortal(
    <div className="bo-avisos" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`bo-aviso bo-aviso--${t.tipo}`} onClick={() => quitar(t.id)}>
          {t.icono && <span className="bo-aviso__icono">{t.icono}</span>}
          <span>{t.texto}</span>
        </div>
      ))}
    </div>,
    document.body
  );
}

// ---------------- Interruptor (switch) ----------------
export function Interruptor({ activo, onCambio, etiqueta, deshabilitado }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      className={"bo-switch" + (activo ? " bo-switch--on" : "")}
      onClick={() => onCambio(!activo)}
    >
      <span className="bo-switch__bolita" />
    </button>
  );
}

// ---------------- Estados vacios / error ----------------
export function Vacio({ icono = "🍬", titulo, texto, children }) {
  return (
    <div className="bo-vacio">
      <div className="bo-vacio__icono">{icono}</div>
      <h4>{titulo}</h4>
      {texto && <p>{texto}</p>}
      {children}
    </div>
  );
}

export function Cargando({ texto = "Cargando..." }) {
  return <p className="bo-cargando">{texto}</p>;
}

// ---------------- Tiempo relativo ("hace 5 min") ----------------
function aFecha(iso) {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
}

export function hace(iso) {
  const minutos = Math.max(0, Math.round((Date.now() - aFecha(iso).getTime()) / 60000));
  if (minutos < 1) return "ahora mismo";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} d`;
}

export function minutosEsperando(iso) {
  return Math.round((Date.now() - aFecha(iso).getTime()) / 60000);
}

// Vuelve a dibujar el componente cada minuto para que "hace X min" no se quede viejo.
export function useReloj() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
}

// ---------------- Subir imagen ----------------
const TIPOS_OK = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_MB = 5;

export function ImagenInput({ valor, onCambio, texto = "Arrastra una foto aqui o haz clic" }) {
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [error, setError] = useState(null);
  const [usarUrl, setUsarUrl] = useState(false);
  const inputRef = useRef(null);

  async function subir(archivo) {
    setError(null);
    if (!archivo) return;
    if (!TIPOS_OK.includes(archivo.type)) {
      setError("Solo se aceptan imagenes JPG, PNG, WEBP o GIF.");
      return;
    }
    if (archivo.size > MAX_MB * 1024 * 1024) {
      setError(`La imagen pesa mas de ${MAX_MB} MB.`);
      return;
    }
    setSubiendo(true);
    try {
      const { url } = await API.subirImagen(archivo);
      onCambio(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendo(false);
    }
  }

  function alSoltar(e) {
    e.preventDefault();
    setArrastrando(false);
    subir(e.dataTransfer.files[0]);
  }

  return (
    <div className="bo-imagen">
      <div
        className={"bo-imagen__zona" + (arrastrando ? " bo-imagen__zona--arrastrando" : "")}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={alSoltar}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      >
        {valor ? (
          <img src={urlImagen(valor)} alt="Vista previa" />
        ) : (
          <div className="bo-imagen__vacia">
            <span aria-hidden="true">🖼️</span>
            <strong>{texto}</strong>
            <small>JPG, PNG, WEBP o GIF · maximo {MAX_MB} MB</small>
          </div>
        )}
        {subiendo && <div className="bo-imagen__subiendo">Subiendo...</div>}
        {valor && !subiendo && <span className="bo-imagen__cambiar">Cambiar foto</span>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={TIPOS_OK.join(",")}
        hidden
        onChange={(e) => {
          subir(e.target.files[0]);
          e.target.value = ""; // permite volver a elegir el mismo archivo
        }}
      />

      {error && <p className="bo-error">{error}</p>}

      <button type="button" className="bo-enlace" onClick={() => setUsarUrl(!usarUrl)}>
        {usarUrl ? "Ocultar" : "O usar una direccion de internet (URL)"}
      </button>
      {usarUrl && (
        <input
          className="bo-input"
          placeholder="https://..."
          value={valor && !valor.startsWith("/uploads/") ? valor : ""}
          onChange={(e) => onCambio(e.target.value)}
        />
      )}
    </div>
  );
}
