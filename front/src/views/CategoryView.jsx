// Tema: Fetching dependiente de props + Skeletons mientras carga.
import { useState } from "react";
import ProductCard from "../components/ProductCard";
import ProductModal from "../components/ProductModal";
import { ProductGridSkeleton } from "../components/Skeleton";
import { useApi } from "../hooks/useApi";
import { API } from "../api/client";

export default function CategoryView({ categoriaId, onAgregarCarrito, onVolver }) {
  const { data: categoria, loading, error } = useApi(
    () => API.categoria(categoriaId),
    [categoriaId]
  );
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);

  return (
    <main className="main">
      <button className="boton boton--enlace" onClick={onVolver}>
        ← Volver a categorias
      </button>

      {loading && <ProductGridSkeleton />}
      {error && <p className="error">Error al cargar productos: {error}</p>}

      {categoria && (
        <>
          <h2>{categoria.nombre}</h2>
          <p>{categoria.descripcion}</p>

          <div className="grid">
            {categoria.productos.map((producto) => (
              <ProductCard
                key={producto.id}
                producto={producto}
                onVerDetalle={setProductoSeleccionado}
              />
            ))}
          </div>
        </>
      )}

      <ProductModal
        producto={productoSeleccionado}
        onCerrar={() => setProductoSeleccionado(null)}
        onAgregar={onAgregarCarrito}
      />
    </main>
  );
}
