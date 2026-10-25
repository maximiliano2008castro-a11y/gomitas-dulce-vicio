from collections import Counter

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from ..database import SessionDep
from ..eventos import publicar_pedido
from ..models import (
    DetallePedido,
    EntregarPedido,
    EstadoPago,
    EstadoPedido,
    MetodoPago,
    Pago,
    Pedido,
    PedidoCreate,
    PedidoPublic,
    Producto,
)
from ..security import UsuarioConPedidos, UsuarioTrabajador
from ..servicios_pago import cancelar_pedido, entregar_pedido, generar_codigo_recogida, iniciar_cobro

router = APIRouter(prefix="/pedidos", tags=["pedidos"])


def pedido_visible(session, pedido_id: int, cliente) -> Pedido:
    pedido = session.get(Pedido, pedido_id)
    # 404 tambien si es de otro cliente, para no revelar que el pedido existe.
    # El personal (admin o trabajador) puede ver cualquier pedido.
    es_personal = cliente.es_admin or cliente.es_trabajador
    if not pedido or (pedido.cliente_id != cliente.id and not es_personal):
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return pedido


@router.post("", response_model=PedidoPublic, status_code=status.HTTP_201_CREATED)
def crear_pedido(datos: PedidoCreate, session: SessionDep, cliente: UsuarioConPedidos):
    # Si el mismo producto viene dos veces, se suman las cantidades antes de validar stock.
    cantidades = Counter()
    for item in datos.items:
        cantidades[item.producto_id] += item.cantidad

    detalles = []
    total = 0.0
    for producto_id, cantidad in cantidades.items():
        producto = session.get(Producto, producto_id)
        if not producto or not producto.activo:
            raise HTTPException(status_code=400, detail=f"Producto {producto_id} no esta disponible")
        if producto.stock < cantidad:
            raise HTTPException(
                status_code=400, detail=f"Stock insuficiente para {producto.nombre}"
            )
        # El stock se aparta al crear el pedido; si se cancela, se devuelve.
        producto.stock -= cantidad
        session.add(producto)
        detalles.append(
            DetallePedido(producto_id=producto_id, cantidad=cantidad, precio_unitario=producto.precio)
        )
        total += cantidad * producto.precio

    pedido = Pedido(
        total=total, cliente_id=cliente.id, items=detalles,
        codigo_recogida=generar_codigo_recogida(session),
    )
    pedido.pago = Pago(metodo=datos.metodo_pago, monto=total, proveedor="")
    session.add(pedido)
    # Un solo commit: si algo de arriba fallo, no se descuenta stock a medias.
    session.commit()
    session.refresh(pedido)

    # Con el pedido ya guardado (MP necesita su id) se genera el cobro.
    iniciar_cobro(pedido, pedido.pago)
    session.add(pedido.pago)
    session.commit()
    session.refresh(pedido)
    publicar_pedido(pedido, "NUEVO")  # el backoffice lo ve aparecer en vivo
    return pedido


@router.get("/mios", response_model=list[PedidoPublic])
def mis_pedidos(session: SessionDep, cliente: UsuarioConPedidos):
    return session.exec(
        select(Pedido).where(Pedido.cliente_id == cliente.id).order_by(Pedido.fecha.desc())
    ).all()


@router.get("", response_model=list[PedidoPublic])
def listar_pedidos(
    session: SessionDep,
    _personal: UsuarioTrabajador,
    estado: EstadoPedido | None = None,
    metodo: MetodoPago | None = None,
    estado_pago: EstadoPago | None = None,
    limite: int = 200,
):
    query = select(Pedido).join(Pago, isouter=True).order_by(Pedido.fecha.desc()).limit(limite)
    if estado:
        query = query.where(Pedido.estado == estado)
    if metodo:
        query = query.where(Pago.metodo == metodo)
    if estado_pago:
        query = query.where(Pago.estado == estado_pago)
    return session.exec(query).all()


@router.get("/{pedido_id}", response_model=PedidoPublic)
def leer_pedido(pedido_id: int, session: SessionDep, cliente: UsuarioConPedidos):
    return pedido_visible(session, pedido_id, cliente)


@router.post("/{pedido_id}/cancelar", response_model=PedidoPublic)
def cancelar(pedido_id: int, session: SessionDep, cliente: UsuarioConPedidos):
    """El cliente (o un admin) cancela un pedido que aun no se paga; el stock regresa."""
    pedido = pedido_visible(session, pedido_id, cliente)
    cancelar_pedido(session, pedido)
    session.commit()
    session.refresh(pedido)
    publicar_pedido(pedido)
    return pedido


@router.post("/{pedido_id}/entregar", response_model=PedidoPublic)
def entregar(
    pedido_id: int, session: SessionDep, personal: UsuarioTrabajador, datos: EntregarPedido | None = None
):
    """El mostrador confirma la recogida. Si es "pagar al recoger", ahi mismo se cobra."""
    pedido = pedido_visible(session, pedido_id, personal)
    entregar_pedido(session, pedido, personal, datos.codigo if datos else None)
    session.commit()
    session.refresh(pedido)
    publicar_pedido(pedido)
    return pedido
