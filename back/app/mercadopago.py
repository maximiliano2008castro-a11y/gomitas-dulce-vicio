# Integracion con Mercado Pago (Checkout Pro) usando su API REST directamente con httpx.
#
# Flujo:
#   1. crear_preferencia(): se manda a MP el pedido (items, comprador, a donde regresar)
#      y MP responde un link (init_point) donde el cliente paga.
#   2. El cliente paga en la pagina de MP con tarjeta de credito/debito o genera su ficha
#      OXXO; al terminar MP lo regresa a FRONTEND_URL/?pago=retorno&pedido=ID&payment_id=...
#   3. El backend NUNCA confia en lo que diga la URL de regreso: consulta el pago en la
#      API de MP (obtener_pago / buscar_pagos) y con eso actualiza el estado.
#   4. Si hay URL publica (MP_NOTIFICATION_URL), MP tambien avisa por webhook cuando el
#      pago cambia (por ejemplo, cuando pagan la ficha OXXO dias despues).
#
# Sin MP_ACCESS_TOKEN el modulo trabaja en modo "simulado" y no llama a nadie.
import hashlib
import hmac

import httpx
from fastapi import HTTPException

from .config import get_settings
from .models import EstadoPago, MetodoPago, Pago, Pedido

API_URL = "https://api.mercadopago.com"

# Tipos de pago que maneja Checkout Pro en Mexico. Para cada metodo de la tienda se
# excluyen los que no corresponden, asi MP solo muestra las opciones elegidas.
TIPOS_MP = ["credit_card", "debit_card", "ticket", "atm", "bank_transfer", "digital_currency", "prepaid_card"]
TIPOS_PERMITIDOS = {
    MetodoPago.tarjeta_credito: {"credit_card"},
    MetodoPago.tarjeta_debito: {"debit_card"},
    MetodoPago.oxxo: {"ticket"},          # OXXO y otras tiendas de conveniencia
    MetodoPago.link_pago: set(TIPOS_MP),  # el link acepta cualquier metodo
}

# status de MP -> estado del pago en la tienda
ESTADOS_MP = {
    "approved": EstadoPago.aprobado,
    "authorized": EstadoPago.pendiente,
    "pending": EstadoPago.pendiente,
    "in_process": EstadoPago.pendiente,
    "in_mediation": EstadoPago.pendiente,
    "rejected": EstadoPago.rechazado,
    "cancelled": EstadoPago.cancelado,
    "refunded": EstadoPago.reembolsado,
    "charged_back": EstadoPago.reembolsado,
}


def modo() -> str:
    return "mercadopago" if get_settings().mp_access_token else "simulado"


def _headers() -> dict:
    return {"Authorization": f"Bearer {get_settings().mp_access_token}"}


def _request(method: str, path: str, **kwargs) -> dict:
    try:
        r = httpx.request(method, f"{API_URL}{path}", headers=_headers(), timeout=15, **kwargs)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="No se pudo conectar con Mercado Pago")
    if r.status_code >= 400:
        try:
            mensaje = r.json().get("message", r.text)
        except ValueError:
            mensaje = r.text
        raise HTTPException(status_code=502, detail=f"Mercado Pago respondio: {mensaje}")
    return r.json()


def crear_preferencia(pedido: Pedido, pago: Pago) -> tuple[str, str]:
    """Crea la preferencia de Checkout Pro y regresa (preference_id, url_para_pagar)."""
    settings = get_settings()
    regreso = f"{settings.frontend_url.rstrip('/')}/?pago=retorno&pedido={pedido.id}"
    excluidos = [{"id": t} for t in TIPOS_MP if t not in TIPOS_PERMITIDOS[pago.metodo]]

    preferencia = {
        "items": [
            {
                "id": str(d.producto_id),
                "title": d.producto.nombre,
                "quantity": d.cantidad,
                "unit_price": round(d.precio_unitario, 2),
                "currency_id": "MXN",
            }
            for d in pedido.items
        ],
        "payer": {"name": pedido.cliente.nombre, "email": pedido.cliente.email},
        "external_reference": str(pedido.id),
        "statement_descriptor": "GOMITAS",
        "back_urls": {"success": regreso, "pending": regreso, "failure": regreso},
        "payment_methods": {
            "excluded_payment_types": excluidos,
            # Meses sin intereses solo tiene sentido con credito.
            "installments": 12 if pago.metodo == MetodoPago.tarjeta_credito else 1,
        },
    }
    # MP solo acepta auto_return con URLs publicas; en localhost el comprador
    # regresa con el boton "Volver al sitio".
    if regreso.startswith("https://"):
        preferencia["auto_return"] = "approved"
    if settings.mp_notification_url:
        preferencia["notification_url"] = settings.mp_notification_url

    data = _request("POST", "/checkout/preferences", json=preferencia)
    # Con credenciales de prueba (TEST-...) se usa el checkout sandbox.
    url = data["init_point"]
    if settings.mp_access_token.startswith("TEST-") and data.get("sandbox_init_point"):
        url = data["sandbox_init_point"]
    return data["id"], url


def obtener_pago(payment_id: str) -> dict:
    return _request("GET", f"/v1/payments/{payment_id}")


def buscar_pagos(pedido_id: int) -> list[dict]:
    """Pagos de MP asociados a un pedido (por external_reference), del mas nuevo al mas viejo."""
    data = _request(
        "GET", "/v1/payments/search",
        params={"external_reference": str(pedido_id), "sort": "date_created", "criteria": "desc"},
    )
    return data.get("results", [])


def elegir_pago(pagos: list[dict]) -> dict | None:
    """Si hubo varios intentos (uno rechazado y luego uno aprobado), manda el aprobado."""
    aprobados = [p for p in pagos if p.get("status") == "approved"]
    return (aprobados or pagos or [None])[0]


def firma_valida(x_signature: str | None, x_request_id: str | None, data_id: str) -> bool:
    """Valida el header x-signature de un webhook (HMAC-SHA256 con MP_WEBHOOK_SECRET).

    Formato del header: "ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8eda45a0282ff693eac24131a5e839"
    Plantilla firmada:  "id:{data.id};request-id:{x-request-id};ts:{ts};"
    """
    secreto = get_settings().mp_webhook_secret
    if not secreto:
        return True  # sin secreto configurado no se valida (solo desarrollo)
    if not x_signature:
        return False
    partes = dict(p.strip().split("=", 1) for p in x_signature.split(",") if "=" in p)
    ts, v1 = partes.get("ts"), partes.get("v1")
    if not ts or not v1:
        return False
    manifest = f"id:{data_id.lower()};"
    if x_request_id:
        manifest += f"request-id:{x_request_id};"
    manifest += f"ts:{ts};"
    esperado = hmac.new(secreto.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperado, v1)
