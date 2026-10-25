from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Request

from .. import mercadopago as mp
from ..database import SessionDep
from ..eventos import publicar_pedido
from ..models import (
    ActualizarPagoAdmin,
    CambiarMetodo,
    EstadoPago,
    EstadoPedido,
    MetodoPago,
    Pedido,
    PedidoPublic,
    ResultadoSimulado,
    VerificarPago,
)
from ..security import UsuarioAdmin, UsuarioConPedidos
from ..servicios_pago import aplicar_estado, aplicar_pago_mp, iniciar_cobro
from .pedidos import pedido_visible

router = APIRouter(prefix="/pagos", tags=["pagos"])

# Lo que reportaria MP para cada metodo, para que la pasarela simulada deje datos realistas.
SIMULADO = {
    MetodoPago.tarjeta_credito: ("credit_card", "visa"),
    MetodoPago.tarjeta_debito: ("debit_card", "debvisa"),
    MetodoPago.oxxo: ("ticket", "oxxo"),
    MetodoPago.link_pago: ("credit_card", "master"),
}


@router.get("/config")
def configuracion():
    """Publico: le dice al frontend si los cobros van a Mercado Pago o a la pasarela simulada."""
    return {"modo": mp.modo(), "metodos": [m.value for m in MetodoPago]}


@router.post("/{pedido_id}/reintentar", response_model=PedidoPublic)
def reintentar(pedido_id: int, datos: CambiarMetodo, session: SessionDep, cliente: UsuarioConPedidos):
    """Genera un nuevo cobro (opcionalmente con otro metodo) para un pedido sin pagar."""
    pedido = pedido_visible(session, pedido_id, cliente)
    if pedido.estado != EstadoPedido.pendiente_pago or pedido.pago.estado == EstadoPago.aprobado:
        raise HTTPException(status_code=409, detail="Este pedido ya no admite pagos")
    pedido.pago.metodo = datos.metodo_pago
    pedido.pago.estado = EstadoPago.pendiente
    pedido.pago.url_ficha = None
    iniciar_cobro(pedido, pedido.pago)
    session.add(pedido.pago)
    session.commit()
    session.refresh(pedido)
    publicar_pedido(pedido)
    return pedido


@router.post("/{pedido_id}/verificar", response_model=PedidoPublic)
def verificar(pedido_id: int, datos: VerificarPago, session: SessionDep, cliente: UsuarioConPedidos):
    """Consulta a Mercado Pago como va el pago. Se usa al regresar de MP y con el boton
    "Actualizar estado" (en localhost MP no puede mandar el webhook)."""
    pedido = pedido_visible(session, pedido_id, cliente)
    pago = pedido.pago
    if pago.proveedor != "mercadopago" or mp.modo() != "mercadopago":
        return pedido

    datos_mp = mp.obtener_pago(datos.payment_id) if datos.payment_id else mp.elegir_pago(mp.buscar_pagos(pedido.id))
    if datos_mp:
        aplicar_pago_mp(session, pago, datos_mp)
        session.commit()
        session.refresh(pedido)
        publicar_pedido(pedido)
    return pedido


@router.post("/{pedido_id}/simular", response_model=PedidoPublic)
def simular(pedido_id: int, datos: ResultadoSimulado, session: SessionDep, cliente: UsuarioConPedidos):
    """Solo sin credenciales de MP: la pasarela simulada del frontend decide el resultado."""
    pedido = pedido_visible(session, pedido_id, cliente)
    pago = pedido.pago
    if pago.proveedor != "simulado":
        raise HTTPException(status_code=409, detail="Este pago no usa la pasarela simulada")
    if pedido.estado != EstadoPedido.pendiente_pago:
        raise HTTPException(status_code=409, detail="Este pedido ya no admite pagos")
    if datos.resultado not in (EstadoPago.aprobado, EstadoPago.rechazado, EstadoPago.pendiente):
        raise HTTPException(status_code=422, detail="Resultado no valido")

    pago.mp_tipo, pago.mp_medio = SIMULADO[pago.metodo]
    pago.mp_payment_id = f"SIM-{uuid4().hex[:10]}"
    pago.detalle = {
        EstadoPago.aprobado: "accredited",
        EstadoPago.rechazado: "cc_rejected_insufficient_amount",
        EstadoPago.pendiente: "pending_waiting_payment",
    }[datos.resultado]
    if pago.metodo == MetodoPago.oxxo and datos.resultado == EstadoPago.pendiente:
        pago.url_ficha = None  # en modo real aqui viene la ficha OXXO de MP
    aplicar_estado(session, pago, datos.resultado)
    session.commit()
    session.refresh(pedido)
    publicar_pedido(pedido)
    return pedido


@router.patch("/{pedido_id}", response_model=PedidoPublic)
def actualizar_pago(pedido_id: int, datos: ActualizarPagoAdmin, session: SessionDep, admin: UsuarioAdmin):
    """El admin cambia el estado a mano (ej. confirmar un pago en efectivo o reembolsar)."""
    pedido = pedido_visible(session, pedido_id, admin)
    if datos.detalle:
        pedido.pago.detalle = datos.detalle
    aplicar_estado(session, pedido.pago, datos.estado)
    session.commit()
    session.refresh(pedido)
    publicar_pedido(pedido)
    return pedido


@router.post("/webhook", include_in_schema=True)
async def webhook(
    request: Request,
    session: SessionDep,
    x_signature: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
):
    """Notificaciones de Mercado Pago. Publico, pero valida la firma y vuelve a consultar
    el pago en la API de MP: nunca se confia en el cuerpo de la notificacion."""
    params = request.query_params
    try:
        cuerpo = await request.json()
    except ValueError:
        cuerpo = {}
    tipo = params.get("type") or params.get("topic") or cuerpo.get("type")
    data_id = params.get("data.id") or params.get("id") or str((cuerpo.get("data") or {}).get("id", ""))

    if tipo != "payment" or not data_id:
        return {"ok": True, "ignorado": True}
    if not mp.firma_valida(x_signature, x_request_id, data_id):
        raise HTTPException(status_code=401, detail="Firma invalida")
    if mp.modo() != "mercadopago":
        return {"ok": True, "ignorado": True}

    datos_mp = mp.obtener_pago(data_id)
    referencia = datos_mp.get("external_reference")
    pedido = session.get(Pedido, int(referencia)) if str(referencia).isdigit() else None
    if not pedido or not pedido.pago:
        return {"ok": True, "ignorado": True}
    try:
        aplicar_pago_mp(session, pedido.pago, datos_mp)
        session.commit()
        session.refresh(pedido)
        publicar_pedido(pedido)  # el trabajador ve en vivo que Mercado Pago aprobo el pago
    except HTTPException as e:
        # Se responde 200 igual; si no, MP reintenta la misma notificacion muchas veces.
        session.rollback()
        return {"ok": False, "detalle": e.detail}
    return {"ok": True}
