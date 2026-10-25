# Tipos del esquema GraphQL. Son "espejos" de los modelos de la BD (models.py) con solo
# lo que necesita el backoffice. Las funciones a_*() convierten un modelo SQLModel en su tipo.
from datetime import datetime, timezone
from typing import Optional

import strawberry

from ..models import Categoria, Cliente, Pedido, Producto


def con_zona(fecha: Optional[datetime]) -> Optional[datetime]:
    # SQLite devuelve las fechas sin zona horaria (son UTC); se la ponemos para que
    # el navegador las convierta bien a la hora local.
    if fecha is not None and fecha.tzinfo is None:
        return fecha.replace(tzinfo=timezone.utc)
    return fecha


@strawberry.type
class CategoriaType:
    id: int
    nombre: str
    descripcion: str
    imagen: str
    total_productos: int


@strawberry.type
class ProductoType:
    id: int
    nombre: str
    descripcion: str
    precio: float
    stock: int
    imagen: str
    activo: bool
    categoria_id: int
    categoria_nombre: str


@strawberry.type
class ClienteType:
    id: int
    nombre: str
    email: str
    es_admin: bool
    es_trabajador: bool
    disabled: bool


@strawberry.type
class PagoType:
    id: int
    metodo: str
    estado: str
    monto: float
    proveedor: str
    mp_payment_id: Optional[str]
    mp_tipo: Optional[str]
    mp_medio: Optional[str]
    detalle: Optional[str]
    actualizado: datetime


@strawberry.type
class DetalleType:
    id: int
    cantidad: int
    precio_unitario: float
    subtotal: float
    producto_id: int
    producto_nombre: str
    producto_imagen: str


@strawberry.type
class PedidoType:
    id: int
    fecha: datetime
    estado: str
    total: float
    codigo_recogida: Optional[str]
    fecha_entrega: Optional[datetime]
    entregado_por: Optional[str]
    # True cuando el cliente ya puede pasar: pagado en Mercado Pago, o "pagar al recoger".
    listo_para_recoger: bool
    cliente: ClienteType
    items: list[DetalleType]
    pago: Optional[PagoType]


@strawberry.type
class PedidoEvento:
    # NUEVO | PAGADO | ENTREGADO | CANCELADO | ACTUALIZADO
    tipo: str
    pedido: PedidoType


@strawberry.type
class ProductoEvento:
    # ACTUALIZADO | CREADO | ELIMINADO
    tipo: str
    producto_id: int
    producto: Optional[ProductoType]


@strawberry.type
class ResumenType:
    por_recoger: int
    pendientes_de_pago: int
    pedidos_hoy: int
    entregados_hoy: int
    # Solo el admin ve el dinero; para el trabajador es null.
    ingresos_hoy: Optional[float]
    productos_activos: int
    productos_stock_bajo: int
    productos_agotados: int


@strawberry.input
class ProductoInput:
    nombre: str
    descripcion: str
    precio: float
    stock: int
    imagen: str
    categoria_id: int
    activo: bool = True


@strawberry.input
class CategoriaInput:
    nombre: str
    descripcion: str
    imagen: str


@strawberry.input
class TrabajadorInput:
    nombre: str
    email: str
    password: str


# ------------------------------------------------------------
# Conversion modelo -> tipo
# ------------------------------------------------------------
def a_producto(p: Producto) -> ProductoType:
    return ProductoType(
        id=p.id, nombre=p.nombre, descripcion=p.descripcion, precio=p.precio, stock=p.stock,
        imagen=p.imagen, activo=p.activo, categoria_id=p.categoria_id,
        categoria_nombre=p.categoria.nombre if p.categoria else "",
    )


def a_categoria(c: Categoria) -> CategoriaType:
    return CategoriaType(
        id=c.id, nombre=c.nombre, descripcion=c.descripcion, imagen=c.imagen,
        total_productos=len(c.productos),
    )


def a_cliente(c: Cliente) -> ClienteType:
    return ClienteType(
        id=c.id, nombre=c.nombre, email=c.email, es_admin=c.es_admin,
        es_trabajador=c.es_trabajador, disabled=c.disabled,
    )


def a_pedido(p: Pedido) -> PedidoType:
    pago = p.pago
    pagado_o_pickup = p.estado == "pagado" or (
        p.estado == "pendiente_pago" and pago is not None and pago.metodo == "pickup"
    )
    return PedidoType(
        id=p.id, fecha=con_zona(p.fecha), estado=p.estado, total=p.total,
        codigo_recogida=p.codigo_recogida, fecha_entrega=con_zona(p.fecha_entrega),
        entregado_por=p.entregado_por, listo_para_recoger=pagado_o_pickup,
        cliente=a_cliente(p.cliente),
        items=[
            DetalleType(
                id=d.id, cantidad=d.cantidad, precio_unitario=d.precio_unitario,
                subtotal=d.cantidad * d.precio_unitario, producto_id=d.producto_id,
                producto_nombre=d.producto.nombre, producto_imagen=d.producto.imagen,
            )
            for d in p.items
        ],
        pago=PagoType(
            id=pago.id, metodo=pago.metodo.value if hasattr(pago.metodo, "value") else pago.metodo,
            estado=pago.estado.value if hasattr(pago.estado, "value") else pago.estado,
            monto=pago.monto, proveedor=pago.proveedor, mp_payment_id=pago.mp_payment_id,
            mp_tipo=pago.mp_tipo, mp_medio=pago.mp_medio, detalle=pago.detalle,
            actualizado=con_zona(pago.actualizado),
        ) if pago else None,
    )
