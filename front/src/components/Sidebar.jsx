// Tema: Listas y keys + Fragment.
export default function Sidebar({ categorias, categoriaActivaId, onSeleccionar }) {
  return (
    <aside className="sidebar">
      <h3 className="sidebar__titulo">Categorias</h3>
      <ul className="sidebar__lista">
        {categorias.map((categoria) => (
          <li key={categoria.id}>
            <button
              className={
                "sidebar__item" +
                (categoria.id === categoriaActivaId ? " sidebar__item--activo" : "")
              }
              onClick={() => onSeleccionar(categoria.id)}
            >
              {categoria.nombre}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
