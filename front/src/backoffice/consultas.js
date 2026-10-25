// Todas las queries / mutations / subscriptions GraphQL del backoffice en un solo lugar.
import { gql } from "../api/graphql";

const PEDIDO = `
  id fecha estado total codigoRecogida fechaEntrega entregadoPor listoParaRecoger
  cliente { id nombre email }
  items { id cantidad precioUnitario subtotal productoId productoNombre productoImagen }
  pago { id metodo estado monto proveedor mpPaymentId mpTipo mpMedio detalle }
`;
const PRODUCTO = "id nombre descripcion precio stock imagen activo categoriaId categoriaNombre";
const CATEGORIA = "id nombre descripcion imagen totalProductos";
const USUARIO = "id nombre email esAdmin esTrabajador disabled";

// ----- Subscriptions (texto, las abre useSuscripcion) -----
export const PEDIDOS_EN_VIVO = `subscription { pedidosEnVivo { tipo pedido { ${PEDIDO} } } }`;
export const INVENTARIO_EN_VIVO = `subscription { inventarioEnVivo { tipo productoId producto { ${PRODUCTO} } } }`;
export const MIS_PEDIDOS_EN_VIVO = `subscription { misPedidosEnVivo { tipo pedido { id estado codigoRecogida } } }`;

// ----- Queries -----
export const resumen = () =>
  gql(`{ resumen { porRecoger pendientesDePago pedidosHoy entregadosHoy ingresosHoy
                   productosActivos productosStockBajo productosAgotados } }`).then((d) => d.resumen);

export const pedidos = (filtros = {}) =>
  gql(
    `query($estado: String, $metodo: String, $buscar: String, $soloPorRecoger: Boolean, $limite: Int) {
       pedidos(estado: $estado, metodo: $metodo, buscar: $buscar, soloPorRecoger: $soloPorRecoger, limite: $limite) { ${PEDIDO} }
     }`,
    filtros
  ).then((d) => d.pedidos);

export const pedidoPorCodigo = (codigo) =>
  gql(`query($codigo: String!) { pedidoPorCodigo(codigo: $codigo) { ${PEDIDO} } }`, { codigo }).then(
    (d) => d.pedidoPorCodigo
  );

export const productos = (variables = {}) =>
  gql(
    `query($busqueda: String, $categoriaId: Int) { productos(busqueda: $busqueda, categoriaId: $categoriaId) { ${PRODUCTO} } }`,
    variables
  ).then((d) => d.productos);

export const categorias = () =>
  gql(`{ categorias { ${CATEGORIA} } }`).then((d) => d.categorias);

export const equipo = () => gql(`{ equipo { ${USUARIO} } }`).then((d) => d.equipo);

// ----- Mutations -----
export const confirmarRecogida = (pedidoId, codigo = null) =>
  gql(
    `mutation($pedidoId: Int!, $codigo: String) { confirmarRecogida(pedidoId: $pedidoId, codigo: $codigo) { ${PEDIDO} } }`,
    { pedidoId, codigo }
  ).then((d) => d.confirmarRecogida);

export const cancelarPedido = (pedidoId) =>
  gql(`mutation($pedidoId: Int!) { cancelarPedido(pedidoId: $pedidoId) { ${PEDIDO} } }`, { pedidoId }).then(
    (d) => d.cancelarPedido
  );

export const marcarPagado = (pedidoId) =>
  gql(`mutation($pedidoId: Int!) { marcarPagado(pedidoId: $pedidoId) { ${PEDIDO} } }`, { pedidoId }).then(
    (d) => d.marcarPagado
  );

export const crearProducto = (datos) =>
  gql(`mutation($datos: ProductoInput!) { crearProducto(datos: $datos) { ${PRODUCTO} } }`, { datos }).then(
    (d) => d.crearProducto
  );

export const actualizarProducto = (id, datos) =>
  gql(
    `mutation($id: Int!, $datos: ProductoInput!) { actualizarProducto(id: $id, datos: $datos) { ${PRODUCTO} } }`,
    { id, datos }
  ).then((d) => d.actualizarProducto);

export const ajustarStock = (id, stock) =>
  gql(`mutation($id: Int!, $stock: Int!) { ajustarStock(id: $id, stock: $stock) { ${PRODUCTO} } }`, {
    id,
    stock,
  }).then((d) => d.ajustarStock);

export const cambiarActivo = (id, activo) =>
  gql(`mutation($id: Int!, $activo: Boolean!) { cambiarActivo(id: $id, activo: $activo) { ${PRODUCTO} } }`, {
    id,
    activo,
  }).then((d) => d.cambiarActivo);

export const eliminarProducto = (id) =>
  gql(`mutation($id: Int!) { eliminarProducto(id: $id) }`, { id });

export const crearCategoria = (datos) =>
  gql(`mutation($datos: CategoriaInput!) { crearCategoria(datos: $datos) { ${CATEGORIA} } }`, { datos }).then(
    (d) => d.crearCategoria
  );

export const actualizarCategoria = (id, datos) =>
  gql(
    `mutation($id: Int!, $datos: CategoriaInput!) { actualizarCategoria(id: $id, datos: $datos) { ${CATEGORIA} } }`,
    { id, datos }
  ).then((d) => d.actualizarCategoria);

export const eliminarCategoria = (id) =>
  gql(`mutation($id: Int!) { eliminarCategoria(id: $id) }`, { id });

export const crearTrabajador = (datos) =>
  gql(`mutation($datos: TrabajadorInput!) { crearTrabajador(datos: $datos) { ${USUARIO} } }`, { datos }).then(
    (d) => d.crearTrabajador
  );

export const cambiarEstadoUsuario = (id, deshabilitado) =>
  gql(
    `mutation($id: Int!, $deshabilitado: Boolean!) { cambiarEstadoUsuario(id: $id, deshabilitado: $deshabilitado) { ${USUARIO} } }`,
    { id, deshabilitado }
  ).then((d) => d.cambiarEstadoUsuario);
