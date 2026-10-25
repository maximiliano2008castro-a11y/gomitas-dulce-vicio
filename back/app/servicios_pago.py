# Reglas de negocio de los pagos, compartidas por los routers de pedidos, pagos y el webhook.
import secrets
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

from . import mercadopago as mp
from .models import Cliente, EstadoPago, EstadoPedido, MetodoPago, Pago, Pedido

# Sin 0/O ni 1/I/L para que no se confundan al dictar el codigo en el mostrador.
ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def ahora() -> datetime:
    return datetime.now(timezone.utc)


def iniciar_cobro(pedido: Pedido, pago: Pago) -> None:
    """Prepara como se va a cobrar: link de MP, pasarela simulada o pago en tienda."""
    pago.url_pago = None
    pago.mp_preference_id = None
    if pago.metodo == MetodoPago.pickup:
        pago.proveedor = "tienda"
        pago.detalle = "Se paga al recoger en tienda"
    elif mp.modo() == "simulado":
        pago.proveedor = "simulado"
        pago.detalle = "Pasarela simulada (sin credenciales de Mercado Pago)"
    else:
        pago.proveedor = "mercadopago"
        try:
            pago.mp_preference_id, pago.url_pago = mp.crear_preferencia(pedido, pago)
            pago.detalle = None
        except HTTPException as e:
            # El pedido ya existe; el cliente puede reintentar desde "Mis pedidos".
            pago.detalle = f"No se genero el link de pago: {e.detail}"[:120]
    pago.actualizado = ahora()


def devolver_stock(session: Session, pedido: Pedido) -> None:
    for detalle in pedido.items:
        detalle.producto.stock += detalle.cantidad
        session.add(detalle.producto)


def cancelar_pedido(session: Session, pedido: Pedido, estado_pago=EstadoPago.cancelado) -> None:
    if pedido.estado == EstadoPedido.cancelado:
        return
    if pedido.estado in (EstadoPedido.pagado, EstadoPedido.entregado) and estado_pago != EstadoPago.reembolsado:
        raise HTTPException(status_code=409, detail="El pedido ya esta pagado; no se puede cancelar")
    if estado_pago != EstadoPago.reembolsado:
        devolver_stock(session, pedido)
    pedido.estado = EstadoPedido.cancelado
    if pedido.pago:
        pedido.pago.estado = estado_pago
        pedido.pago.actualizado = ahora()
    session.add(pedido)


def aplicar_estado(session: Session, pago: Pago, estado: EstadoPago) -> None:
    """Cambia el estado del pago y deja el pedido en el estado que corresponde."""
    pedido = pago.pedido
    if estado in (EstadoPago.cancelado, EstadoPago.reembolsado):
        cancelar_pedido(session, pedido, estado)
        return
    if pedido.estado == EstadoPedido.cancelado:
        raise HTTPException(status_code=409, detail="El pedido esta cancelado")

    pago.estado = estado
    pago.actualizado = ahora()
    if estado == EstadoPago.aprobado:
        if pedido.estado != EstadoPedido.entregado:
            pedido.estado = EstadoPedido.pagado
    elif pedido.estado == EstadoPedido.pagado:
        pedido.estado = EstadoPedido.pendiente_pago
    session.add(pago)
    session.add(pedido)


def aplicar_pago_mp(session: Session, pago: Pago, datos: dict) -> None:
    """Copia lo que reporta la API de Mercado Pago sobre un pago."""
    if str(datos.get("external_reference")) != str(pago.pedido_id):
        raise HTTPException(status_code=400, detail="Ese pago de Mercado Pago es de otro pedido")
    # Si el cliente pago menos de lo que vale el pedido, no se aprueba.
    if datos.get("status") == "approved" and float(datos.get("transaction_amount", 0)) + 0.01 < pago.monto:
        raise HTTPException(status_code=400, detail="El monto pagado no coincide con el pedido")

    pago.mp_payment_id = str(datos["id"])
    pago.mp_tipo = datos.get("payment_type_id")
    pago.mp_medio = datos.get("payment_method_id")
    pago.detalle = (datos.get("status_detail") or "")[:120] or None
    pago.url_ficha = (datos.get("transaction_details") or {}).get("external_resource_url") or pago.url_ficha
    estado = mp.ESTADOS_MP.get(datos.get("status"), EstadoPago.pendiente)
    if pago.pedido.estado == EstadoPedido.cancelado:
        # Ej. pagaron la ficha OXXO despues de cancelar: se registra para reembolsar.
        if estado == EstadoPago.aprobado:
            pago.estado = EstadoPago.aprobado
            pago.detalle = "Pagado despues de cancelar: requiere reembolso"
            pago.actualizado = ahora()
            session.add(pago)
        return
    aplicar_estado(session, pago, estado)


def generar_codigo_recogida(session: Session) -> str:
    """Codigo de 6 caracteres que el cliente muestra para recoger. Se revisa que no exista."""
    while True:
        codigo = "".join(secrets.choice(ALFABETO_CODIGO) for _ in range(6))
        if not session.exec(select(Pedido).where(Pedido.codigo_recogida == codigo)).first():
            return codigo


def entregar_pedido(session: Session, pedido: Pedido, quien: Cliente, codigo: str | None = None) -> None:
    """El mostrador confirma que el cliente ya recogio su pedido.

    - Pedido pagado (Mercado Pago aprobado): solo se marca como entregado.
    - Pedido "pagar al recoger" sin cobrar: se cobra en el mostrador y se entrega.
    - Cualquier otro pedido sin pagar (ficha OXXO pendiente, tarjeta rechazada...): no se entrega.
    Si el trabajador captura el codigo que dicta el cliente, debe coincidir con el del pedido."""
    if pedido.estado == EstadoPedido.cancelado:
        raise HTTPException(status_code=409, detail="El pedido esta cancelado")
    if pedido.estado == EstadoPedido.entregado:
        raise HTTPException(status_code=409, detail="Este pedido ya fue entregado")
    if codigo and codigo.strip().upper() != (pedido.codigo_recogida or ""):
        raise HTTPException(status_code=400, detail="El codigo de recogida no coincide con este pedido")

    if pedido.pago.estado != EstadoPago.aprobado:
        if pedido.pago.metodo != MetodoPago.pickup:
            raise HTTPException(
                status_code=409,
                detail="El pedido aun no esta pagado en Mercado Pago; no se puede entregar",
            )
        pedido.pago.detalle = "Pagado al recoger en tienda"
        aplicar_estado(session, pedido.pago, EstadoPago.aprobado)

    pedido.estado = EstadoPedido.entregado
    pedido.fecha_entrega = ahora()
    pedido.entregado_por = quien.nombre
    session.add(pedido)
