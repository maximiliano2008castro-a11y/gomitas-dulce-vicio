// Tema: Skeletons - placeholder con la misma forma del contenido real.
export function ProductCardSkeleton() {
  return (
    <div className="card card--skeleton" aria-busy="true">
      <div className="skeleton skeleton--imagen" />
      <div className="skeleton skeleton--linea" />
      <div className="skeleton skeleton--linea skeleton--corta" />
    </div>
  );
}

export function ProductGridSkeleton({ cantidad = 4 }) {
  return (
    <div className="grid">
      {Array.from({ length: cantidad }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
