import { urlImagen } from "../api/client";

export default function CategoryCard({ categoria, onSeleccionar }) {
  return (
    <button className="category-card" onClick={() => onSeleccionar(categoria.id)}>
      <img src={urlImagen(categoria.imagen)} alt={categoria.nombre} loading="lazy" />
      <h3>{categoria.nombre}</h3>
      <p>{categoria.descripcion}</p>
    </button>
  );
}
