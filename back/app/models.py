# Tutorial FastAPI/SQLModel: "Multiple Models" + "Models with Relationships".
# Cada entidad tiene un modelo *tabla* (lo que vive en la BD) y modelos de
# entrada/salida (lo que entra y sale por la API). Asi el hashed_password,
# por ejemplo, nunca se devuelve en una respuesta.
# Mismas entidades que db.sql / reporte-p6.md.
from datetime import datetime, timezone
from enum import Enum

from pydantic import EmailStr, computed_field
from sqlmodel import Field, Relationship, SQLModel


# ------------------------------------------------------------
# Categoria
# ------------------------------------------------------------
class CategoriaBase(SQLModel):
    nombre: str = Field(max_length=80)
    descripcion: str = Field(max_length=255)
    imagen: str = Field(max_length=500)


class Categoria(CategoriaBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    productos: list["Producto"] = Relationship(back_populates="categoria")


class CategoriaPublic(CategoriaBase):
    id: int


# ------------------------------------------------------------
# Producto (N:1 con Categoria)
# ------------------------------------------------------------
class ProductoBase(SQLModel):
    nombre: str = Field(max_length=120)
    descripcion: str = Field(max_length=255)
    precio: float = Field(ge=0)
    stock: int = Field(default=0, ge=0)
    imagen: str = Field(max_length=500)
    categoria_id: int = Field(foreign_key="categoria.id", index=True)
    # False = oculto en la tienda (se conserva en la BD y en los pedidos viejos).
    activo: bool = True


class Producto(ProductoBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    categoria: Categoria = Relationship(back_populates="productos")


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(SQLModel):
    nombre: str | None = None
    descripcion: str | None = None
    precio: float | None = Field(default=None, ge=0)
    stock: int | None = Field(default=None, ge=0)
    imagen: str | None = None
    categoria_id: int | None = None
    activo: bool | None = None


class ProductoPublic(ProductoBase):
    id: int


class CategoriaConProductos(CategoriaPublic):
    productos: list[ProductoPublic] = []


# ------------------------------------------------------------
# Cliente (tambien es el usuario que inicia sesion)
# ------------------------------------------------------------
class ClienteBase(SQLModel):
    nombre: str = Field(max_length=120)
    email: EmailStr = Field(max_length=255, unique=True, index=True)


class Cliente(ClienteBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    hashed_password: str = Field(max_length=255)
    es_admin: bool = False
    # Trabajador de mostrador: ve pedidos y confirma recogidas, pero no administra.
    es_trabajador: bool = False
    disabled: bool = False
    pedidos: list["Pedido"] = Relationship(back_populates="cliente")


class ClienteCreate(ClienteBase):
    password: str = Field(min_length=8, max_length=128)


class ClientePublic(ClienteBase):
    id: int
    es_admin: bool
    es_trabajador: bool = False


# ------------------------------------------------------------
# Pedido (N:1 con Cliente) y DetallePedido (N:1 con Pedido y Producto)
# ------------------------------------------------------------
class DetallePedido(SQLModel, table=True):
    __tablename__ = "detalle_pedido"

    id: int | None = Field(default=None, primary_key=True)
    pedido_id: int = Field(foreign_key="pedido.id", index=True)
    producto_id: int = Field(foreign_key="producto.id", index=True)
    cantidad: int = Field(gt=0)
    precio_unitario: float = Field(ge=0)

    pedido: "Pedido" = Relationship(back_populates="items")
    producto: Producto = Relationship()


class EstadoPedido(str, Enum):
    pendiente_pago = "pendiente_pago"
    pagado = "pagado"
    entregado = "entregado"
    cancelado = "cancelado"


class Pedido(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    fecha: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    estado: str = Field(default=EstadoPedido.pendiente_pago, max_length=30)
    total: float = Field(ge=0)
    cliente_id: int = Field(foreign_key="cliente.id", index=True)
    # Codigo corto que el cliente muestra en el mostrador para recoger su pedido.
    codigo_recogida: str | None = Field(default=None, max_length=8, index=True)
    fecha_entrega: datetime | None = None
    entregado_por: str | None = Field(default=None, max_length=120)

    cliente: Cliente = Relationship(back_populates="pedidos")
    items: list[DetallePedido] = Relationship(
        back_populates="pedido", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    pago: "Pago" = Relationship(
        back_populates="pedido",
        sa_relationship_kwargs={"uselist": False, "cascade": "all, delete-orphan"},
    )


# ------------------------------------------------------------
# Pago (1:1 con Pedido)
# ------------------------------------------------------------
class MetodoPago(str, Enum):
    tarjeta_credito = "tarjeta_credito"
    tarjeta_debito = "tarjeta_debito"
    oxxo = "oxxo"            # efectivo en tienda de conveniencia (ficha de pago)
    link_pago = "link_pago"  # link de Mercado Pago para compartir; acepta cualquier metodo
    pickup = "pickup"        # se paga al recoger en la tienda (sin pasarela)


class EstadoPago(str, Enum):
    pendiente = "pendiente"
    aprobado = "aprobado"
    rechazado = "rechazado"
    cancelado = "cancelado"
    reembolsado = "reembolsado"


class Pago(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    pedido_id: int = Field(foreign_key="pedido.id", unique=True, index=True)
    metodo: MetodoPago = Field(index=True)
    estado: EstadoPago = Field(default=EstadoPago.pendiente, index=True)
    monto: float = Field(ge=0)
    # "mercadopago", "simulado" (sin credenciales) o "tienda" (pickup).
    proveedor: str = Field(max_length=20)
    mp_preference_id: str | None = Field(default=None, max_length=80)
    mp_payment_id: str | None = Field(default=None, max_length=40)
    # Lo que reporta MP: tipo (credit_card, ticket...) y medio (visa, oxxo...).
    mp_tipo: str | None = Field(default=None, max_length=30)
    mp_medio: str | None = Field(default=None, max_length=30)
    detalle: str | None = Field(default=None, max_length=120)
    url_pago: str | None = Field(default=None, max_length=500)
    url_ficha: str | None = Field(default=None, max_length=500)  # ficha OXXO
    creado: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    actualizado: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    pedido: Pedido = Relationship(back_populates="pago")


class PagoPublic(SQLModel):
    id: int
    metodo: MetodoPago
    estado: EstadoPago
    monto: float
    proveedor: str
    mp_payment_id: str | None
    mp_tipo: str | None
    mp_medio: str | None
    detalle: str | None
    url_pago: str | None
    url_ficha: str | None
    creado: datetime
    actualizado: datetime


class ItemPedidoInput(SQLModel):
    producto_id: int
    cantidad: int = Field(gt=0)


class PedidoCreate(SQLModel):
    # El cliente ya no se manda en el cuerpo: sale del token (usuario autenticado).
    items: list[ItemPedidoInput] = Field(min_length=1)
    metodo_pago: MetodoPago


class DetallePedidoPublic(SQLModel):
    id: int
    cantidad: int
    precio_unitario: float
    producto: ProductoPublic

    @computed_field
    @property
    def subtotal(self) -> float:
        return self.cantidad * self.precio_unitario


class PedidoPublic(SQLModel):
    id: int
    fecha: datetime
    estado: str
    total: float
    codigo_recogida: str | None = None
    fecha_entrega: datetime | None = None
    entregado_por: str | None = None
    cliente: ClientePublic
    items: list[DetallePedidoPublic]
    pago: PagoPublic | None = None


class CambiarMetodo(SQLModel):
    metodo_pago: MetodoPago


class ActualizarPagoAdmin(SQLModel):
    estado: EstadoPago
    detalle: str | None = Field(default=None, max_length=120)


class ResultadoSimulado(SQLModel):
    resultado: EstadoPago


class EntregarPedido(SQLModel):
    # Codigo de recogida que dicta el cliente (opcional: tambien se puede confirmar sin el).
    codigo: str | None = None


class VerificarPago(SQLModel):
    # El payment_id que Mercado Pago agrega a la URL de regreso (opcional).
    payment_id: str | None = None


# ------------------------------------------------------------
# OAuth2 / JWT
# ------------------------------------------------------------
class Token(SQLModel):
    access_token: str
    token_type: str


class TokenData(SQLModel):
    email: str | None = None
    scopes: list[str] = []
