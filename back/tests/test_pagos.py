# Pruebas de metodos de pago, Mercado Pago (con la API simulada), webhook y dashboard.
# Correr con:  pytest
import hashlib
import hmac

from fastapi.testclient import TestClient

from app import mercadopago as mp
from app.config import get_settings
from app.main import app

s = get_settings()


def token(c, email, password):
    r = c.post("/auth/token", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def nuevo_pedido(c, headers, metodo, cantidad=1, producto_id=3):
    r = c.post("/pedidos", headers=headers, json={"items": [{"producto_id": producto_id, "cantidad": cantidad}], "metodo_pago": metodo})
    assert r.status_code == 201, r.text
    return r.json()


def test_pasarela_simulada_y_cancelacion():
    with TestClient(app) as c:
        cli = token(c, s.seed_cliente_email, s.seed_cliente_password)
        assert c.get("/pagos/config").json()["modo"] == "simulado"

        # Metodo invalido -> 422
        r = c.post("/pedidos", headers=cli, json={"items": [{"producto_id": 3, "cantidad": 1}], "metodo_pago": "bitcoin"})
        assert r.status_code == 422

        # Tarjeta de credito: primero rechazada, luego aprobada
        p = nuevo_pedido(c, cli, "tarjeta_credito")
        assert p["pago"]["proveedor"] == "simulado" and p["pago"]["estado"] == "pendiente"
        r = c.post(f"/pagos/{p['id']}/simular", headers=cli, json={"resultado": "rechazado"}).json()
        assert r["pago"]["estado"] == "rechazado" and r["estado"] == "pendiente_pago"
        r = c.post(f"/pagos/{p['id']}/simular", headers=cli, json={"resultado": "aprobado"}).json()
        assert r["pago"]["estado"] == "aprobado" and r["estado"] == "pagado"
        assert r["pago"]["mp_tipo"] == "credit_card"
        # Ya pagado: no se puede volver a pagar ni cancelar
        assert c.post(f"/pagos/{p['id']}/simular", headers=cli, json={"resultado": "rechazado"}).status_code == 409
        assert c.post(f"/pedidos/{p['id']}/cancelar", headers=cli).status_code == 409

        # Cancelar un pedido sin pagar devuelve el stock
        stock = c.get("/productos/3").json()["stock"]
        p = nuevo_pedido(c, cli, "oxxo", cantidad=3)
        assert c.get("/productos/3").json()["stock"] == stock - 3
        r = c.post(f"/pedidos/{p['id']}/cancelar", headers=cli).json()
        assert r["estado"] == "cancelado" and r["pago"]["estado"] == "cancelado"
        assert c.get("/productos/3").json()["stock"] == stock

        # Reintentar con otro metodo
        p = nuevo_pedido(c, cli, "tarjeta_debito")
        r = c.post(f"/pagos/{p['id']}/reintentar", headers=cli, json={"metodo_pago": "pickup"}).json()
        assert r["pago"]["metodo"] == "pickup" and r["pago"]["proveedor"] == "tienda"
        # Pickup no pasa por la pasarela
        assert c.post(f"/pagos/{p['id']}/simular", headers=cli, json={"resultado": "aprobado"}).status_code == 409

        # El admin entrega el pickup y en ese momento se cobra
        admin = token(c, s.seed_admin_email, s.seed_admin_password)
        assert c.post(f"/pedidos/{p['id']}/entregar", headers=cli).status_code == 403
        r = c.post(f"/pedidos/{p['id']}/entregar", headers=admin).json()
        assert r["estado"] == "entregado" and r["pago"]["estado"] == "aprobado"

        # Un pedido con tarjeta sin pagar no se puede entregar...
        p = nuevo_pedido(c, cli, "tarjeta_credito")
        assert c.post(f"/pedidos/{p['id']}/entregar", headers=admin).status_code == 409
        # ...pero el admin puede marcarlo pagado a mano
        r = c.patch(f"/pagos/{p['id']}", headers=admin, json={"estado": "aprobado", "detalle": "Transferencia"}).json()
        assert r["estado"] == "pagado"

        # Filtros del listado admin
        pickups = c.get("/pedidos?metodo=pickup", headers=admin).json()
        assert pickups and all(x["pago"]["metodo"] == "pickup" for x in pickups)

        # Dashboard
        assert c.get("/admin/estadisticas", headers=cli).status_code == 403
        est = c.get("/admin/estadisticas", headers=admin).json()
        credito = next(m for m in est["por_metodo"] if m["metodo"] == "tarjeta_credito")
        assert credito["aprobado"] >= 2
        assert est["resumen"]["pagos_aprobados"] >= 3
        assert est["por_estado_pedido"]["cancelado"] >= 1
        assert len(est["ventas_por_dia"]) == 30
        assert est["top_productos"][0]["producto"] == "Ositos Clasicos"
        assert c.get("/admin/estadisticas?dias=0", headers=admin).status_code == 200


def test_mercadopago_y_webhook(monkeypatch):
    # Se simula la API de Mercado Pago: no sale ninguna peticion a internet.
    monkeypatch.setattr(s, "mp_access_token", "TEST-123")
    monkeypatch.setattr(s, "mp_webhook_secret", "secreto")
    preferencias = []

    def falsa_preferencia(pedido, pago):
        preferencias.append(pago.metodo)
        return "pref-1", "https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-1"

    pagos_mp = {}
    monkeypatch.setattr(mp, "crear_preferencia", falsa_preferencia)
    monkeypatch.setattr(mp, "obtener_pago", lambda pid: pagos_mp[pid])
    monkeypatch.setattr(
        mp, "buscar_pagos",
        lambda pedido_id: [p for p in reversed(pagos_mp.values()) if p["external_reference"] == str(pedido_id)],
    )

    with TestClient(app) as c:
        cli = token(c, s.seed_cliente_email, s.seed_cliente_password)
        assert c.get("/pagos/config").json()["modo"] == "mercadopago"

        p = nuevo_pedido(c, cli, "oxxo", cantidad=2)
        assert p["pago"]["proveedor"] == "mercadopago" and p["pago"]["url_pago"].startswith("https://")
        assert preferencias[-1] == "oxxo"

        # El cliente genera su ficha OXXO: MP la deja "pending"
        pagos_mp["900"] = {
            "id": 900, "status": "pending", "status_detail": "pending_waiting_payment",
            "external_reference": str(p["id"]), "transaction_amount": p["total"],
            "payment_type_id": "ticket", "payment_method_id": "oxxo",
            "transaction_details": {"external_resource_url": "https://mp.com/ficha/900"},
        }
        r = c.post(f"/pagos/{p['id']}/verificar", headers=cli, json={"payment_id": "900"}).json()
        assert r["pago"]["estado"] == "pendiente" and r["pago"]["url_ficha"] == "https://mp.com/ficha/900"

        # Dias despues paga en OXXO y MP manda el webhook
        pagos_mp["900"] = {**pagos_mp["900"], "status": "approved", "status_detail": "accredited"}
        ts, req = "1700000000", "req-abc"
        firma = hmac.new(b"secreto", f"id:900;request-id:{req};ts:{ts};".encode(), hashlib.sha256).hexdigest()
        r = c.post("/pagos/webhook?type=payment&data.id=900", json={},
                   headers={"x-signature": f"ts={ts},v1=mala", "x-request-id": req})
        assert r.status_code == 401
        r = c.post("/pagos/webhook?type=payment&data.id=900", json={"type": "payment", "data": {"id": "900"}},
                   headers={"x-signature": f"ts={ts},v1={firma}", "x-request-id": req})
        assert r.status_code == 200 and r.json()["ok"]
        r = c.get(f"/pedidos/{p['id']}", headers=cli).json()
        assert r["estado"] == "pagado" and r["pago"]["mp_medio"] == "oxxo"

        # Un pago aprobado pero por menos dinero no se acepta
        p2 = nuevo_pedido(c, cli, "tarjeta_credito")
        pagos_mp["901"] = {"id": 901, "status": "approved", "external_reference": str(p2["id"]), "transaction_amount": 1,
                           "payment_type_id": "credit_card", "payment_method_id": "visa"}
        assert c.post(f"/pagos/{p2['id']}/verificar", headers=cli, json={"payment_id": "901"}).status_code == 400
        # Un pago de otro pedido tampoco
        assert c.post(f"/pagos/{p2['id']}/verificar", headers=cli, json={"payment_id": "900"}).status_code == 400

        # Sin payment_id busca por external_reference (intento rechazado + aprobado -> se queda el aprobado)
        del pagos_mp["901"]
        pagos_mp["902"] = {"id": 902, "status": "approved", "external_reference": str(p2["id"]), "transaction_amount": p2["total"],
                           "payment_type_id": "credit_card", "payment_method_id": "master"}
        pagos_mp["903"] = {**pagos_mp["902"], "id": 903, "status": "rejected", "payment_method_id": "visa"}
        r = c.post(f"/pagos/{p2['id']}/verificar", headers=cli, json={}).json()
        assert r["pago"]["estado"] == "aprobado" and r["pago"]["mp_payment_id"] == "902"

        # La pasarela simulada no se puede usar con MP real
        p3 = nuevo_pedido(c, cli, "tarjeta_debito")
        assert c.post(f"/pagos/{p3['id']}/simular", headers=cli, json={"resultado": "aprobado"}).status_code == 409
