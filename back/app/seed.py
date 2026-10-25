# Datos de prueba: los mismos de db.sql. Solo se insertan si la tabla esta vacia,
# asi que reiniciar el servidor no duplica nada.
import random
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from .config import get_settings
from .models import (
    Categoria, Cliente, DetallePedido, EstadoPago, EstadoPedido, MetodoPago, Pago, Pedido, Producto,
)
from .security import get_cliente_por_email, hash_password
from .servicios_pago import ALFABETO_CODIGO, generar_codigo_recogida

CATEGORIAS = [
    (1, "Acidas", "Gomitas con cobertura acida", "https://placehold.co/400x300/f97316/ffffff?text=Acidas"),
    (2, "Clasicas", "Los sabores de toda la vida", "https://placehold.co/400x300/eab308/ffffff?text=Clasicas"),
    (3, "Rellenas", "Gomitas con relleno liquido", "https://placehold.co/400x300/ec4899/ffffff?text=Rellenas"),
    (4, "Veganas", "Sin gelatina animal", "https://placehold.co/400x300/22c55e/ffffff?text=Veganas"),
]

PRODUCTOS = [
    ("Aros Acidos", "Aros de gomita con azucar acida", 35, 40, "https://placehold.co/400x300/f97316/ffffff?text=Aros+Acidos", 1),
    ("Botellitas Acidas", "Mini botellas de gomita sabor cola", 30, 25, "https://placehold.co/400x300/f97316/ffffff?text=Botellitas", 1),
    ("Ositos Clasicos", "Ositos de gomita surtidos", 25, 60, "https://placehold.co/400x300/eab308/ffffff?text=Ositos", 2),
    ("Aros de Frutas", "Aros de gomita sabor frutal", 28, 50, "https://placehold.co/400x300/eab308/ffffff?text=Aros+Frutas", 2),
    ("Fresas Rellenas", "Gomitas de fresa con relleno de chocolate", 45, 15, "https://placehold.co/400x300/ec4899/ffffff?text=Fresas", 3),
    ("Sandias Rellenas", "Gomitas de sandia con relleno acido", 45, 0, "https://placehold.co/400x300/ec4899/ffffff?text=Sandias", 3),
    ("Gomitas Veganas Mix", "Mezcla de sabores sin gelatina animal", 50, 20, "https://placehold.co/400x300/22c55e/ffffff?text=Veganas+Mix", 4),
]


def seed(session: Session):
    settings = get_settings()

    if not session.exec(select(Categoria)).first():
        for id_, nombre, descripcion, imagen in CATEGORIAS:
            session.add(Categoria(id=id_, nombre=nombre, descripcion=descripcion, imagen=imagen))
        for nombre, descripcion, precio, stock, imagen, categoria_id in PRODUCTOS:
            session.add(
                Producto(
                    nombre=nombre, descripcion=descripcion, precio=precio,
                    stock=stock, imagen=imagen, categoria_id=categoria_id,
                )
            )

    usuarios = [
        ("Administrador", settings.seed_admin_email, settings.seed_admin_password, True),
        ("Cliente de Prueba", settings.seed_cliente_email, settings.seed_cliente_password, False),
        ("Trabajador de Mostrador", settings.seed_trabajador_email, settings.seed_trabajador_password, False),
    ]
    for nombre, email, password, es_admin in usuarios:
        if not get_cliente_por_email(session, email):
            session.add(
                Cliente(
                    nombre=nombre, email=email,
                    hashed_password=hash_password(password), es_admin=es_admin,
                    es_trabajador=email == settings.seed_trabajador_email,
                )
            )

    session.commit()
    dar_codigo_a_pedidos_viejos(session)

    if settings.seed_pedidos_demo and not session.exec(select(Pedido)).first():
        seed_pedidos_demo(session)


def dar_codigo_a_pedidos_viejos(session: Session):
    """Pedidos hechos antes del backoffice no tenian codigo de recogida."""
    for pedido in session.exec(select(Pedido).where(Pedido.codigo_recogida == None)).all():  # noqa: E711
        pedido.codigo_recogida = generar_codigo_recogida(session)
        session.add(pedido)
        session.flush()
    session.commit()


# ------------------------------------------------------------
# Pedidos de ejemplo para el dashboard (ultimos 30 dias)
# ------------------------------------------------------------
# metodo: (peso, [(resultado, peso)], [(tipo MP, medio MP)])
DEMO = {
    MetodoPago.tarjeta_credito: (35, [("aprobado", 75), ("rechazado", 15), ("pendiente", 4), ("cancelado", 6)],
                                 [("credit_card", "visa"), ("credit_card", "master"), ("credit_card", "amex")]),
    MetodoPago.tarjeta_debito: (25, [("aprobado", 78), ("rechazado", 16), ("cancelado", 6)],
                                [("debit_card", "debvisa"), ("debit_card", "debmaster")]),
    MetodoPago.oxxo: (15, [("aprobado", 55), ("pendiente", 25), ("cancelado", 20)], [("ticket", "oxxo")]),
    MetodoPago.link_pago: (10, [("aprobado", 70), ("pendiente", 20), ("rechazado", 10)],
                           [("credit_card", "visa"), ("debit_card", "debvisa"), ("ticket", "oxxo")]),
    MetodoPago.pickup: (15, [("aprobado", 60), ("pendiente", 30), ("cancelado", 10)], [(None, None)]),
}

DETALLES_DEMO = {
    "aprobado": "accredited",
    "rechazado": "cc_rejected_insufficient_amount",
    "pendiente": "pending_waiting_payment",
    "cancelado": "expired",
}


def elegir(rng, opciones):
    valores, pesos = zip(*opciones)
    return rng.choices(valores, weights=pesos)[0]


def seed_pedidos_demo(session: Session, cantidad: int = 70):
    rng = random.Random(42)  # semilla fija: siempre los mismos datos
    clientes = []
    for i, nombre in enumerate(["Lucia Ramos", "Diego Torres", "Sofia Mendez", "Mateo Cruz", "Valeria Ortiz"], 1):
        email = f"demo{i}@gomitas.com"
        cliente = get_cliente_por_email(session, email)
        if not cliente:
            cliente = Cliente(nombre=nombre, email=email, hashed_password=hash_password(f"demo{i}pass123"))
            session.add(cliente)
        clientes.append(cliente)
    session.flush()

    productos = session.exec(select(Producto)).all()
    ahora = datetime.now(timezone.utc)
    metodos = [(m, d[0]) for m, d in DEMO.items()]

    for _ in range(cantidad):
        metodo = elegir(rng, metodos)
        _, resultados, medios = DEMO[metodo]
        resultado = elegir(rng, resultados)
        tipo, medio = rng.choice(medios)
        fecha = ahora - timedelta(days=rng.randint(0, 29), hours=rng.randint(0, 12), minutes=rng.randint(0, 59))

        items = [
            DetallePedido(producto_id=p.id, cantidad=rng.randint(1, 4), precio_unitario=p.precio)
            for p in rng.sample(productos, rng.randint(1, 3))
        ]
        total = sum(d.cantidad * d.precio_unitario for d in items)

        if resultado == "aprobado":
            estado_pedido = EstadoPedido.entregado if metodo == MetodoPago.pickup or rng.random() < 0.5 else EstadoPedido.pagado
        elif resultado == "cancelado":
            estado_pedido = EstadoPedido.cancelado
        else:
            estado_pedido = EstadoPedido.pendiente_pago

        # En una tienda real los pedidos viejos ya se recogieron o se abandonaron; asi la fila de
        # "por recoger" del backoffice solo trae pedidos de hoy y de ayer.
        if (ahora - fecha).days >= 2:
            if estado_pedido == EstadoPedido.pagado:
                estado_pedido = EstadoPedido.entregado
            elif metodo == MetodoPago.pickup and resultado == "pendiente":
                estado_pedido, resultado = EstadoPedido.cancelado, "cancelado"

        pagado_en_linea = metodo != MetodoPago.pickup and resultado != "pendiente" or metodo == MetodoPago.oxxo
        pedido = Pedido(
            fecha=fecha, estado=estado_pedido, total=total, cliente_id=rng.choice(clientes).id, items=items,
            codigo_recogida="".join(rng.choice(ALFABETO_CODIGO) for _ in range(6)),
        )
        if estado_pedido == EstadoPedido.entregado:
            pedido.fecha_entrega = min(fecha + timedelta(hours=rng.randint(1, 20)), ahora)
            pedido.entregado_por = "Trabajador de Mostrador"
        pedido.pago = Pago(
            metodo=metodo,
            estado=EstadoPago(resultado),
            monto=total,
            proveedor="tienda" if metodo == MetodoPago.pickup else "demo",
            mp_payment_id=f"DEMO-{rng.randrange(10**9):09d}" if pagado_en_linea else None,
            mp_tipo=tipo if pagado_en_linea else None,
            mp_medio=medio if pagado_en_linea else None,
            detalle="Pagado al recoger en tienda" if metodo == MetodoPago.pickup and resultado == "aprobado"
            else DETALLES_DEMO[resultado] if metodo != MetodoPago.pickup else None,
            creado=fecha,
            actualizado=fecha + timedelta(minutes=rng.randint(1, 600)),
        )
        session.add(pedido)

    session.commit()
