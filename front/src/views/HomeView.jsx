// Tema: Fetching (loading/error/data) + Componentes dinamicos.
import Hero from "../components/Hero";
import ContextSection from "../components/ContextSection";
import CategoryCard from "../components/CategoryCard";
import { useApi } from "../hooks/useApi";
import { API } from "../api/client";

export default function HomeView({ onSeleccionarCategoria }) {
  const { data: categorias, loading, error } = useApi(API.categorias);

  return (
    <main className="main">
      <Hero />
      <ContextSection />

      <section>
        <h2>Nuestras categorias</h2>

        {loading && <p>Cargando categorias...</p>}
        {error && <p className="error">Error al cargar categorias: {error}</p>}

        {categorias && (
          <div className="grid grid--categorias">
            {categorias.map((categoria) => (
              <CategoryCard
                key={categoria.id}
                categoria={categoria}
                onSeleccionar={onSeleccionarCategoria}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
