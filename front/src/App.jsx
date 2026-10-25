// Maquina de estados del flujo: home -> categoria -> carrito -> (login) -> checkout -> pago.
// La navegacion es 100% por estado + eventos, sin usar rutas/URLs. La unica excepcion es
// el regreso desde Mercado Pago (?pago=retorno&pedido=ID), que se lee una vez al cargar.
import { useState } from "react";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import Footer from "./components/Footer";
import HomeView from "./views/HomeView";
import CategoryView from "./views/CategoryView";
import CartView from "./views/CartView";
import CheckoutView from "./views/CheckoutView";
import LoginView from "./views/LoginView";
import PagoView from "./views/PagoView";
import MisPedidosView from "./views/MisPedidosView";
import BackofficeView from "./backoffice/BackofficeView";
import { Avisos } from "./backoffice/ui";
import { useApi } from "./hooks/useApi";
import { API } from "./api/client";
import { useCartStore } from "./store/useCartStore";
import { useAuthStore } from "./store/useAuthStore";
import "./App.css";
import "./pagos.css";

const VISTAS = {
  HOME: "home",
  CATEGORIA: "categoria",
  CARRITO: "carrito",
  LOGIN: "login",
  CHECKOUT: "checkout",
  PAGO: "pago",
  MIS_PEDIDOS: "mis_pedidos",
  BACKOFFICE: "backoffice",
};

// Vistas que necesitan sesion: sin ella se muestra el login y despues se regresa.
const PROTEGIDAS = [VISTAS.CHECKOUT, VISTAS.PAGO, VISTAS.MIS_PEDIDOS, VISTAS.BACKOFFICE];

// Si venimos de Mercado Pago, MP agrega ?pago=retorno&pedido=ID&payment_id=...&status=...
function leerRetornoDePago() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("pago") !== "retorno" || !params.get("pedido")) return null;
  // Se limpia la URL para que un refresh no repita el retorno.
  window.history.replaceState(null, "", window.location.pathname);
  const paymentId = params.get("payment_id") || params.get("collection_id");
  return {
    pedidoId: Number(params.get("pedido")),
    paymentId: paymentId && paymentId !== "null" ? paymentId : null,
  };
}

// Se lee una sola vez al cargar la pagina (fuera del componente porque limpia la URL).
const retorno = leerRetornoDePago();

export default function App() {
  const [vista, setVista] = useState(retorno ? VISTAS.PAGO : VISTAS.HOME);
  const [categoriaId, setCategoriaId] = useState(null);
  const [pedidoId, setPedidoId] = useState(retorno?.pedidoId ?? null);
  // A donde regresar despues de iniciar sesion.
  const [destinoTrasLogin, setDestinoTrasLogin] = useState(VISTAS.HOME);

  const { data: categorias } = useApi(API.categorias);

  const agregarProducto = useCartStore((s) => s.agregarProducto);
  const cambiarCantidad = useCartStore((s) => s.cambiarCantidad);
  const quitarProducto = useCartStore((s) => s.quitarProducto);
  const vaciarCarrito = useCartStore((s) => s.vaciarCarrito);
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.total);
  const totalItems = useCartStore((s) => s.totalItems);

  const usuario = useAuthStore((s) => s.usuario);
  const cerrarSesion = useAuthStore((s) => s.cerrarSesion);

  const cart = { items, cambiarCantidad, quitarProducto, vaciarCarrito, total };

  // Vistas protegidas: sin sesion (o si el token vencio) se muestra el login y al
  // entrar se regresa a la vista que se queria. El backoffice ademas pide ser admin o trabajador.
  const protegida = PROTEGIDAS.includes(vista);
  let vistaActual = protegida && !usuario ? VISTAS.LOGIN : vista;
  const esPersonal = Boolean(usuario?.es_admin || usuario?.es_trabajador);
  if (vistaActual === VISTAS.BACKOFFICE && !esPersonal) vistaActual = VISTAS.HOME;
  const destino = protegida ? vista : destinoTrasLogin;

  function irInicio() {
    setVista(VISTAS.HOME);
    setCategoriaId(null);
  }

  function seleccionarCategoria(id) {
    setCategoriaId(id);
    setVista(VISTAS.CATEGORIA);
  }

  function abrirLogin(destino) {
    setDestinoTrasLogin(destino);
    setVista(VISTAS.LOGIN);
  }

  function irCheckout() {
    if (usuario) setVista(VISTAS.CHECKOUT);
    else abrirLogin(VISTAS.CHECKOUT);
  }

  function abrirPedido(id) {
    setPedidoId(id);
    setVista(VISTAS.PAGO);
  }

  function salir() {
    cerrarSesion();
    if (PROTEGIDAS.includes(vista) || vista === VISTAS.LOGIN) irInicio();
  }

  // El backoffice ocupa toda la pantalla, con su propio menu: no lleva barra, sidebar ni footer.
  if (vistaActual === VISTAS.BACKOFFICE) {
    return <BackofficeView usuario={usuario} onVolverTienda={irInicio} onSalir={salir} />;
  }

  const mostrarSidebar = [VISTAS.HOME, VISTAS.CATEGORIA].includes(vistaActual);

  return (
    <div className="app">
      <TopBar
        totalItems={totalItems()}
        usuario={usuario}
        onIrInicio={irInicio}
        onAbrirCarrito={() => setVista(VISTAS.CARRITO)}
        onIniciarSesion={() =>
          abrirLogin(vista === VISTAS.CATEGORIA ? VISTAS.CATEGORIA : VISTAS.HOME)
        }
        onCerrarSesion={salir}
        onMisPedidos={() => setVista(VISTAS.MIS_PEDIDOS)}
        onBackoffice={() => setVista(VISTAS.BACKOFFICE)}
      />

      <div className="layout">
        {mostrarSidebar && (
          <Sidebar
            categorias={categorias || []}
            categoriaActivaId={categoriaId}
            onSeleccionar={seleccionarCategoria}
          />
        )}

        {vistaActual === VISTAS.HOME && (
          <HomeView onSeleccionarCategoria={seleccionarCategoria} />
        )}

        {vistaActual === VISTAS.CATEGORIA && (
          <CategoryView
            categoriaId={categoriaId}
            onAgregarCarrito={agregarProducto}
            onVolver={irInicio}
          />
        )}

        {vistaActual === VISTAS.CARRITO && (
          <CartView
            cart={cart}
            onVolver={() => setVista(categoriaId ? VISTAS.CATEGORIA : VISTAS.HOME)}
            onIrCheckout={irCheckout}
          />
        )}

        {vistaActual === VISTAS.LOGIN && (
          <LoginView
            mensaje={
              destino === VISTAS.CHECKOUT
                ? "Inicia sesion o crea una cuenta para confirmar tu pedido."
                : PROTEGIDAS.includes(destino)
                  ? "Inicia sesion para continuar."
                  : null
            }
            onExito={(u) => setVista((u?.es_admin || u?.es_trabajador) && destino === VISTAS.HOME ? VISTAS.BACKOFFICE : destino)}
            onVolver={() =>
              setVista(
                destino === VISTAS.CHECKOUT
                  ? VISTAS.CARRITO
                  : PROTEGIDAS.includes(destino)
                    ? VISTAS.HOME
                    : destino
              )
            }
          />
        )}

        {vistaActual === VISTAS.CHECKOUT && (
          <CheckoutView
            cart={cart}
            onVolver={() => setVista(VISTAS.CARRITO)}
            onPedidoCreado={abrirPedido}
          />
        )}

        {vistaActual === VISTAS.PAGO && (
          <PagoView
            key={pedidoId}
            pedidoId={pedidoId}
            paymentIdRetorno={retorno?.pedidoId === pedidoId ? retorno.paymentId : null}
            onMisPedidos={() => setVista(VISTAS.MIS_PEDIDOS)}
            onSeguirComprando={irInicio}
          />
        )}

        {vistaActual === VISTAS.MIS_PEDIDOS && (
          <MisPedidosView onAbrirPedido={abrirPedido} onVolver={irInicio} />
        )}

      </div>

      <Footer />
      <Avisos />
    </div>
  );
}
