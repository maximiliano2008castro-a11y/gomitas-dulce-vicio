# Estadisticas para el dashboard del administrador. Los conteos y sumas se hacen en SQL
# (GROUP BY) en vez de traer todos los pedidos a Python.
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query
from sqlmodel import func, select

from ..config import get_settings
from ..database import SessionDep
from ..models import Cliente, DetallePedido, EstadoPago, EstadoPedido, MetodoPago, Pago, Pedido, Producto
from ..security import UsuarioAdmin

router = APIRouter(prefix="/admin", tags=["admin"])

PAGADOS = (EstadoPedido.pagado, EstadoPedido.entregado)


@router.get("/estadisticas")
def estadisticas(
    session: SessionDep,
    _admin: UsuarioAdmin,
    dias: int = Query(default=30, ge=0, le=365, description="Ultimos N dias; 0 = todo el historial"),
):
    # Los "dias" son dias de la hora local de la tienda, no de UTC.
    zona = timezone(timedelta(hours=get_settings().utc_offset_horas))
    hoy = datetime.now(zona)
    desde = (
        (hoy - timedelta(days=dias - 1)).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
        if dias else None
    )

    def en_rango(query):
        return query.where(Pedido.fecha >= desde) if desde else query

    base = en_rango(select(Pedido).join(Pago))

    # ---- Por metodo de pago y estado del pago (tabla cruzada) ----
    filas = session.exec(
        en_rango(
            select(Pago.metodo, Pago.estado, func.count(Pago.id), func.coalesce(func.sum(Pago.monto), 0))
            .join(Pedido)
            .group_by(Pago.metodo, Pago.estado)
        )
    ).all()
    por_metodo = {
        m.value: {"metodo": m.value, "pedidos": 0, "monto_aprobado": 0.0, **{e.value: 0 for e in EstadoPago}}
        for m in MetodoPago
    }
    por_estado_pago = {e.value: 0 for e in EstadoPago}
    for metodo, estado, n, monto in filas:
        metodo, estado = MetodoPago(metodo).value, EstadoPago(estado).value
        por_metodo[metodo]["pedidos"] += n
        por_metodo[metodo][estado] += n
        por_estado_pago[estado] += n
        if estado == EstadoPago.aprobado:
            por_metodo[metodo]["monto_aprobado"] += float(monto)

    # ---- Por estado del pedido ----
    por_estado_pedido = {e.value: 0 for e in EstadoPedido}
    for estado, n in session.exec(
        en_rango(select(Pedido.estado, func.count(Pedido.id)).group_by(Pedido.estado))
    ).all():
        por_estado_pedido[estado] = n

    # ---- Por medio que reporto MP (visa, master, oxxo...) en pagos aprobados ----
    por_medio = [
        {"medio": medio, "tipo": tipo, "pagos": n}
        for medio, tipo, n in session.exec(
            en_rango(
                select(Pago.mp_medio, Pago.mp_tipo, func.count(Pago.id))
                .join(Pedido)
                .where(Pago.estado == EstadoPago.aprobado, Pago.mp_medio.is_not(None))
                .group_by(Pago.mp_medio, Pago.mp_tipo)
                .order_by(func.count(Pago.id).desc())
            )
        ).all()
    ]

    # ---- Ventas por dia (pedidos creados e ingresos aprobados) ----
    # Se agrupa en Python porque convertir a hora local en SQL cambia entre SQLite y MySQL.
    por_dia = defaultdict(lambda: [0, 0.0])
    for fecha, estado, monto in session.exec(
        en_rango(select(Pedido.fecha, Pago.estado, Pago.monto).join(Pago))
    ).all():
        if fecha.tzinfo is None:  # SQLite regresa las fechas sin zona (son UTC)
            fecha = fecha.replace(tzinfo=timezone.utc)
        dia = por_dia[fecha.astimezone(zona).date()]
        dia[0] += 1
        if estado == EstadoPago.aprobado:
            dia[1] += monto
    inicio = desde.astimezone(zona).date() if desde else min(por_dia, default=hoy.date())
    ventas_por_dia = []
    d = inicio
    while d <= hoy.date():
        n, ingresos = por_dia.get(d, (0, 0.0))
        ventas_por_dia.append({"fecha": d.isoformat(), "pedidos": n, "ingresos": round(ingresos, 2)})
        d += timedelta(days=1)

    # ---- Productos mas vendidos (solo pedidos pagados/entregados) ----
    top_productos = [
        {"producto": nombre, "cantidad": int(cant), "ingresos": round(float(ing), 2)}
        for nombre, cant, ing in session.exec(
            en_rango(
                select(
                    Producto.nombre,
                    func.sum(DetallePedido.cantidad),
                    func.sum(DetallePedido.cantidad * DetallePedido.precio_unitario),
                )
                .join(DetallePedido, DetallePedido.producto_id == Producto.id)
                .join(Pedido, Pedido.id == DetallePedido.pedido_id)
                .where(Pedido.estado.in_(PAGADOS))
                .group_by(Producto.nombre)
                .order_by(func.sum(DetallePedido.cantidad).desc())
                .limit(5)
            )
        ).all()
    ]

    # ---- Resumen ----
    total_pedidos = sum(por_estado_pedido.values())
    aprobados = por_estado_pago[EstadoPago.aprobado]
    rechazados = por_estado_pago[EstadoPago.rechazado]
    ingresos = round(sum(m["monto_aprobado"] for m in por_metodo.values()), 2)
    monto_pendiente = session.exec(
        base.with_only_columns(func.coalesce(func.sum(Pago.monto), 0)).where(Pago.estado == EstadoPago.pendiente)
    ).one()
    clientes = session.exec(
        base.with_only_columns(func.count(func.distinct(Pedido.cliente_id)))
    ).one()

    return {
        "dias": dias,
        "desde": desde.astimezone(zona).date().isoformat() if desde else None,
        "resumen": {
            "pedidos": total_pedidos,
            "pagos_aprobados": aprobados,
            "ingresos": ingresos,
            "ticket_promedio": round(ingresos / aprobados, 2) if aprobados else 0,
            # De los pagos que ya tienen resultado, cuantos se aprobaron.
            "tasa_aprobacion": round(aprobados / (aprobados + rechazados), 4) if aprobados + rechazados else None,
            "monto_pendiente": round(float(monto_pendiente), 2),
            "clientes": clientes,
            "clientes_registrados": session.exec(select(func.count(Cliente.id))).one(),
        },
        "por_metodo": list(por_metodo.values()),
        "por_estado_pago": por_estado_pago,
        "por_estado_pedido": por_estado_pedido,
        "por_medio": por_medio,
        "ventas_por_dia": ventas_por_dia,
        "top_productos": top_productos,
    }
