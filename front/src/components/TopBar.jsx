// Tema: Padre -> hijos (props) + Eventos custom (onIrInicio, onAbrirCarrito, ...).
export default function TopBar({ totalItems, usuario, onIrInicio, onAbrirCarrito, onIniciarSesion, onCerrarSesion, onMisPedidos, onBackoffice }) {
  return (
    <header className="topbar">
      <button className="topbar__logo" onClick={onIrInicio}>
        🍬 Gomitas Dulce Vicio
      </button>

      <div className="topbar__acciones">
        {usuario ? (
          <>
            <span className="topbar__usuario">Hola, {usuario.nombre}</span>
            {(usuario.es_admin || usuario.es_trabajador) && (
              <button className="topbar__boton topbar__boton--destacado" onClick={onBackoffice}>
                🛠️ Backoffice
              </button>
            )}
            <button className="topbar__boton" onClick={onMisPedidos}>
              Mis pedidos
            </button>
            <button className="topbar__boton" onClick={onCerrarSesion}>
              Salir
            </button>
          </>
        ) : (
          <button className="topbar__boton" onClick={onIniciarSesion}>
            Iniciar sesion
          </button>
        )}

        <button className="topbar__cart" onClick={onAbrirCarrito}>
          🛒 Carrito
          {totalItems > 0 && <span className="topbar__badge">{totalItems}</span>}
        </button>
      </div>
    </header>
  );
}
