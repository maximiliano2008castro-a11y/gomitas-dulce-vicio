# Esquema GraphQL del Backoffice: Queries (leer), Mutations (cambiar) y Subscriptions (en vivo).
#
# Las reglas de negocio (cobrar al recoger, regresar stock, validar el codigo de recogida...)
# NO se repiten aqui: se llaman las mismas funciones de servicios_pago.py que usa el REST.
from collections.abc import AsyncGenerator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

import strawberry
from fastapi import HTTPException
from graphql import GraphQLError
from sqlalchemy import and_, func, or_
from sqlmodel import Session, select
from starlette.concurrency import run_in_threadpool
from strawberry.types import Info

from ..config import get_settings
from ..database import engine
from ..eventos import bus, publicar_pedido, publicar_productos
from ..models import (
    Categoria, Cliente, DetallePedido, EstadoPago, EstadoPedido, MetodoPago, Pago, Pedido, Producto,
)
from ..security import hash_password
from ..servicios_pago import aplicar_estado, cancelar_pedido, entregar_pedido
from .permisos import ContextoGQL, EsAdmin, EsPersonal, EsUsuario
from .tipos import (
    CategoriaInput, CategoriaType, ClienteType, PedidoEvento, PedidoType, ProductoEvento,
    ProductoInput, ProductoType, ResumenType, TrabajadorInput,
    a_categoria, a_cliente, a_pedido, a_producto,
)

STOCK_BAJO = 5  # a partir de aqui el backoffice marca "stock bajo"


@contextmanager
def errores_de_negocio():
    """Las reglas de negocio lanzan HTTPException (pensadas para REST). En GraphQL se
    convierten en un error de GraphQL con el mismo mensaje."""
    try:
        yield
    except HTTPException as e:
        raise GraphQLError(str(e.detail)) from None


def pedido_o_error(session: Session, pedido_id: int) -> Pedido:
    pedido = session.get(Pedido, pedido_id)
    if not pedido:
        raise GraphQLError("Pedido no encontrado")
    return pedido


def limpiar(texto: str, campo: str, maximo: int) -> str:
    texto = texto.strip()
    if not texto:
        raise GraphQLError(f"{campo} no puede ir vacio")
    if len(texto) > maximo:
        raise GraphQLError(f"{campo} no puede pasar de {maximo} caracteres")
    return texto


def validar_producto(session: Session, datos: ProductoInput) -> dict:
    if datos.precio < 0:
        raise GraphQLError("El precio no puede ser negativo")
    if datos.stock < 0:
        raise GraphQLError("El stock no puede ser negativo")
    if not session.get(Categoria, datos.categoria_id):
        raise GraphQLError("La categoria no existe")
    nombre = limpiar(datos.nombre, "El nombre", 120)
    # Si no se sube imagen se pone una de relleno para que la tienda nunca se vea rota.
    imagen = datos.imagen.strip() or f"https://placehold.co/400x300/d6336c/ffffff?text={nombre.replace(' ', '+')}"
    return {
        "nombre": nombre,
        "descripcion": limpiar(datos.descripcion, "La descripcion", 255),
        "precio": round(datos.precio, 2),
        "stock": datos.stock,
        "imagen": imagen[:500],
        "categoria_id": datos.categoria_id,
        "activo": datos.activo,
    }


# ------------------------------------------------------------
# Queries
# ------------------------------------------------------------
@strawberry.type
class Query:
    @strawberry.field(permission_classes=[EsAdmin])
    def productos(self, busqueda: Optional[str] = None, categoria_id: Optional[int] = None) -> list[ProductoType]:
        """Todos los productos, tambien los ocultos (la tienda solo muestra los activos)."""
        with Session(engine) as session:
            query = select(Producto).order_by(Producto.nombre)
            if categoria_id:
                query = query.where(Producto.categoria_id == categoria_id)
            if busqueda and busqueda.strip():
                query = query.where(Producto.nombre.ilike(f"%{busqueda.strip()}%"))
            return [a_producto(p) for p in session.exec(query).all()]

    @strawberry.field(permission_classes=[EsAdmin])
    def categorias(self) -> list[CategoriaType]:
        with Session(engine) as session:
            return [a_categoria(c) for c in session.exec(select(Categoria).order_by(Categoria.nombre)).all()]

    @strawberry.field(permission_classes=[EsPersonal])
    def pedidos(
        self,
        estado: Optional[str] = None,
        metodo: Optional[str] = None,
        buscar: Optional[str] = None,
        solo_por_recoger: bool = False,
        limite: int = 100,
    ) -> list[PedidoType]:
        with Session(engine) as session:
            query = select(Pedido).join(Pago, isouter=True).join(Cliente)
            if estado:
                query = query.where(Pedido.estado == estado)
            if metodo:
                query = query.where(Pago.metodo == metodo)
            if solo_por_recoger:
                query = query.where(
                    or_(
                        Pedido.estado == EstadoPedido.pagado,
                        and_(Pedido.estado == EstadoPedido.pendiente_pago, Pago.metodo == MetodoPago.pickup),
                    )
                )
            if buscar and buscar.strip():
                b = buscar.strip()
                condiciones = [Pedido.codigo_recogida == b.upper(), Cliente.nombre.ilike(f"%{b}%")]
                if b.lstrip("#").isdigit():
                    condiciones.append(Pedido.id == int(b.lstrip("#")))
                query = query.where(or_(*condiciones))
            # La fila de "por recoger" es una fila de espera: el mas viejo primero.
            orden = Pedido.fecha.asc() if solo_por_recoger else Pedido.fecha.desc()
            query = query.order_by(orden).limit(max(1, min(limite, 300)))
            return [a_pedido(p) for p in session.exec(query).all()]

    @strawberry.field(permission_classes=[EsPersonal])
    def pedido_por_codigo(self, codigo: str) -> Optional[PedidoType]:
        """El trabajador teclea el codigo que le dicta el cliente."""
        with Session(engine) as session:
            pedido = session.exec(
                select(Pedido).where(Pedido.codigo_recogida == codigo.strip().upper())
            ).first()
            return a_pedido(pedido) if pedido else None

    @strawberry.field(permission_classes=[EsUsuario])
    def mis_pedidos(self, info: Info[ContextoGQL, None]) -> list[PedidoType]:
        with Session(engine) as session:
            pedidos = session.exec(
                select(Pedido).where(Pedido.cliente_id == info.context.usuario.id).order_by(Pedido.fecha.desc())
            ).all()
            return [a_pedido(p) for p in pedidos]

    @strawberry.field(permission_classes=[EsPersonal])
    def resumen(self, info: Info[ContextoGQL, None]) -> ResumenType:
        zona = timezone(timedelta(hours=get_settings().utc_offset_horas))
        inicio_hoy = datetime.now(zona).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
        with Session(engine) as session:
            por_recoger = session.exec(
                select(func.count(Pedido.id)).join(Pago).where(
                    or_(
                        Pedido.estado == EstadoPedido.pagado,
                        and_(Pedido.estado == EstadoPedido.pendiente_pago, Pago.metodo == MetodoPago.pickup),
                    )
                )
            ).one()
            pendientes = session.exec(
                select(func.count(Pedido.id)).join(Pago).where(
                    Pedido.estado == EstadoPedido.pendiente_pago, Pago.metodo != MetodoPago.pickup
                )
            ).one()
            pedidos_hoy = session.exec(select(func.count(Pedido.id)).where(Pedido.fecha >= inicio_hoy)).one()
            entregados_hoy = session.exec(
                select(func.count(Pedido.id)).where(Pedido.fecha_entrega >= inicio_hoy)
            ).one()
            ingresos = session.exec(
                select(func.coalesce(func.sum(Pago.monto), 0)).join(Pedido).where(
                    Pago.estado == EstadoPago.aprobado, Pedido.fecha >= inicio_hoy
                )
            ).one()
            activos = session.exec(select(func.count(Producto.id)).where(Producto.activo == True)).one()  # noqa: E712
            bajo = session.exec(
                select(func.count(Producto.id)).where(
                    Producto.activo == True, Producto.stock > 0, Producto.stock <= STOCK_BAJO  # noqa: E712
                )
            ).one()
            agotados = session.exec(
                select(func.count(Producto.id)).where(Producto.activo == True, Producto.stock == 0)  # noqa: E712
            ).one()
        return ResumenType(
            por_recoger=por_recoger, pendientes_de_pago=pendientes, pedidos_hoy=pedidos_hoy,
            entregados_hoy=entregados_hoy,
            ingresos_hoy=round(float(ingresos), 2) if info.context.usuario.es_admin else None,
            productos_activos=activos, productos_stock_bajo=bajo, productos_agotados=agotados,
        )

    @strawberry.field(permission_classes=[EsAdmin])
    def equipo(self) -> list[ClienteType]:
        """Administradores y trabajadores (los clientes de la tienda no aparecen)."""
        with Session(engine) as session:
            personal = session.exec(
                select(Cliente).where(or_(Cliente.es_admin == True, Cliente.es_trabajador == True))  # noqa: E712
                .order_by(Cliente.nombre)
            ).all()
            return [a_cliente(c) for c in personal]


# ------------------------------------------------------------
# Mutations
# ------------------------------------------------------------
@strawberry.type
class Mutation:
    # ----- Productos -----
    @strawberry.mutation(permission_classes=[EsAdmin])
    def crear_producto(self, datos: ProductoInput) -> ProductoType:
        with Session(engine) as session:
            producto = Producto(**validar_producto(session, datos))
            session.add(producto)
            session.commit()
            session.refresh(producto)
            resultado = a_producto(producto)
        publicar_productos([resultado.id], "CREADO")
        return resultado

    @strawberry.mutation(permission_classes=[EsAdmin])
    def actualizar_producto(self, id: int, datos: ProductoInput) -> ProductoType:
        with Session(engine) as session:
            producto = session.get(Producto, id)
            if not producto:
                raise GraphQLError("Producto no encontrado")
            producto.sqlmodel_update(validar_producto(session, datos))
            session.add(producto)
            session.commit()
            session.refresh(producto)
            resultado = a_producto(producto)
        publicar_productos([id])
        return resultado

    @strawberry.mutation(permission_classes=[EsAdmin])
    def ajustar_stock(self, id: int, stock: int) -> ProductoType:
        if stock < 0:
            raise GraphQLError("El stock no puede ser negativo")
        with Session(engine) as session:
            producto = session.get(Producto, id)
            if not producto:
                raise GraphQLError("Producto no encontrado")
            producto.stock = stock
            session.add(producto)
            session.commit()
            session.refresh(producto)
            resultado = a_producto(producto)
        publicar_productos([id])
        return resultado

    @strawberry.mutation(permission_classes=[EsAdmin])
    def cambiar_activo(self, id: int, activo: bool) -> ProductoType:
        """Mostrar u ocultar un producto en la tienda sin borrarlo."""
        with Session(engine) as session:
            producto = session.get(Producto, id)
            if not producto:
                raise GraphQLError("Producto no encontrado")
            producto.activo = activo
            session.add(producto)
            session.commit()
            session.refresh(producto)
            resultado = a_producto(producto)
        publicar_productos([id])
        return resultado

    @strawberry.mutation(permission_classes=[EsAdmin])
    def eliminar_producto(self, id: int) -> bool:
        with Session(engine) as session:
            producto = session.get(Producto, id)
            if not producto:
                raise GraphQLError("Producto no encontrado")
            en_pedidos = session.exec(select(DetallePedido).where(DetallePedido.producto_id == id)).first()
            if en_pedidos:
                raise GraphQLError("Ya aparece en pedidos, no se puede borrar. Ocultalo de la tienda en su lugar.")
            session.delete(producto)
            session.commit()
        publicar_productos([id], "ELIMINADO")
        return True

    # ----- Categorias -----
    @strawberry.mutation(permission_classes=[EsAdmin])
    def crear_categoria(self, datos: CategoriaInput) -> CategoriaType:
        with Session(engine) as session:
            nombre = limpiar(datos.nombre, "El nombre", 80)
            categoria = Categoria(
                nombre=nombre,
                descripcion=limpiar(datos.descripcion, "La descripcion", 255),
                imagen=datos.imagen.strip() or f"https://placehold.co/400x300/d6336c/ffffff?text={nombre.replace(' ', '+')}",
            )
            session.add(categoria)
            session.commit()
            session.refresh(categoria)
            return a_categoria(categoria)

    @strawberry.mutation(permission_classes=[EsAdmin])
    def actualizar_categoria(self, id: int, datos: CategoriaInput) -> CategoriaType:
        with Session(engine) as session:
            categoria = session.get(Categoria, id)
            if not categoria:
                raise GraphQLError("Categoria no encontrada")
            categoria.nombre = limpiar(datos.nombre, "El nombre", 80)
            categoria.descripcion = limpiar(datos.descripcion, "La descripcion", 255)
            if datos.imagen.strip():
                categoria.imagen = datos.imagen.strip()
            session.add(categoria)
            session.commit()
            session.refresh(categoria)
            return a_categoria(categoria)

    @strawberry.mutation(permission_classes=[EsAdmin])
    def eliminar_categoria(self, id: int) -> bool:
        with Session(engine) as session:
            categoria = session.get(Categoria, id)
            if not categoria:
                raise GraphQLError("Categoria no encontrada")
            if categoria.productos:
                raise GraphQLError("La categoria todavia tiene productos: muevelos o borralos primero")
            session.delete(categoria)
            session.commit()
        return True

    # ----- Pedidos -----
    @strawberry.mutation(permission_classes=[EsPersonal])
    def confirmar_recogida(
        self, info: Info[ContextoGQL, None], pedido_id: int, codigo: Optional[str] = None
    ) -> PedidoType:
        """El trabajador confirma que el cliente ya recogio su pedido."""
        with Session(engine) as session:
            pedido = pedido_o_error(session, pedido_id)
            quien = session.get(Cliente, info.context.usuario.id)
            with errores_de_negocio():
                entregar_pedido(session, pedido, quien, codigo)
            session.commit()
            session.refresh(pedido)
            resultado = a_pedido(pedido)
            publicar_pedido(pedido)
        return resultado

    @strawberry.mutation(permission_classes=[EsPersonal])
    def cancelar_pedido(self, pedido_id: int) -> PedidoType:
        with Session(engine) as session:
            pedido = pedido_o_error(session, pedido_id)
            with errores_de_negocio():
                cancelar_pedido(session, pedido)
            session.commit()
            session.refresh(pedido)
            resultado = a_pedido(pedido)
            publicar_pedido(pedido)
        return resultado

    @strawberry.mutation(permission_classes=[EsAdmin])
    def marcar_pagado(self, pedido_id: int) -> PedidoType:
        """El admin confirma a mano un pago (ej. cliente pago en efectivo y MP aun no avisa)."""
        with Session(engine) as session:
            pedido = pedido_o_error(session, pedido_id)
            pedido.pago.detalle = "Confirmado por el admin"
            with errores_de_negocio():
                aplicar_estado(session, pedido.pago, EstadoPago.aprobado)
            session.commit()
            session.refresh(pedido)
            resultado = a_pedido(pedido)
            publicar_pedido(pedido)
        return resultado

    # ----- Equipo -----
    @strawberry.mutation(permission_classes=[EsAdmin])
    def crear_trabajador(self, datos: TrabajadorInput) -> ClienteType:
        email = datos.email.strip().lower()
        if "@" not in email or "." not in email.split("@")[-1]:
            raise GraphQLError("Escribe un email valido")
        if len(datos.password) < 8:
            raise GraphQLError("La contraseña debe tener al menos 8 caracteres")
        with Session(engine) as session:
            if session.exec(select(Cliente).where(Cliente.email == email)).first():
                raise GraphQLError("Ese email ya esta registrado")
            trabajador = Cliente(
                nombre=limpiar(datos.nombre, "El nombre", 120), email=email,
                hashed_password=hash_password(datos.password), es_trabajador=True,
            )
            session.add(trabajador)
            session.commit()
            session.refresh(trabajador)
            return a_cliente(trabajador)

    @strawberry.mutation(permission_classes=[EsAdmin])
    def cambiar_estado_usuario(self, info: Info[ContextoGQL, None], id: int, deshabilitado: bool) -> ClienteType:
        if id == info.context.usuario.id:
            raise GraphQLError("No puedes deshabilitar tu propia cuenta")
        with Session(engine) as session:
            usuario = session.get(Cliente, id)
            if not usuario or not (usuario.es_admin or usuario.es_trabajador):
                raise GraphQLError("Usuario no encontrado")
            usuario.disabled = deshabilitado
            session.add(usuario)
            session.commit()
            session.refresh(usuario)
            return a_cliente(usuario)


# ------------------------------------------------------------
# Subscriptions (WebSocket): el servidor "empuja" los cambios al navegador.
# ------------------------------------------------------------
def cargar_evento_pedido(evento: dict) -> Optional[PedidoEvento]:
    with Session(engine) as session:
        pedido = session.get(Pedido, evento["pedido_id"])
        return PedidoEvento(tipo=evento["tipo"], pedido=a_pedido(pedido)) if pedido else None


def cargar_evento_producto(evento: dict) -> ProductoEvento:
    with Session(engine) as session:
        producto = session.get(Producto, evento["producto_id"])
        return ProductoEvento(
            tipo=evento["tipo"], producto_id=evento["producto_id"],
            producto=a_producto(producto) if producto else None,
        )


@strawberry.type
class Subscription:
    @strawberry.subscription(permission_classes=[EsPersonal])
    async def pedidos_en_vivo(self) -> AsyncGenerator[PedidoEvento, None]:
        """Cada pedido nuevo, pago aprobado, recogida o cancelacion, al instante."""
        async for evento in bus.escuchar():
            if evento["canal"] == "pedido":
                resultado = await run_in_threadpool(cargar_evento_pedido, evento)
                if resultado:
                    yield resultado

    @strawberry.subscription(permission_classes=[EsAdmin])
    async def inventario_en_vivo(self) -> AsyncGenerator[ProductoEvento, None]:
        """Cambios de stock o de datos de un producto (alguien compra, otro admin edita...)."""
        async for evento in bus.escuchar():
            if evento["canal"] == "producto":
                yield await run_in_threadpool(cargar_evento_producto, evento)

    @strawberry.subscription(permission_classes=[EsUsuario])
    async def mis_pedidos_en_vivo(self, info: Info[ContextoGQL, None]) -> AsyncGenerator[PedidoEvento, None]:
        """Para el cliente: su pedido cambia de estado (pago aprobado, listo, entregado...)."""
        mi_id = info.context.usuario.id
        async for evento in bus.escuchar():
            if evento["canal"] == "pedido" and evento.get("cliente_id") == mi_id:
                resultado = await run_in_threadpool(cargar_evento_pedido, evento)
                if resultado:
                    yield resultado


schema = strawberry.Schema(query=Query, mutation=Mutation, subscription=Subscription)
