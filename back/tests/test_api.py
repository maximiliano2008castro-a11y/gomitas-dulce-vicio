# Pruebas de punta a punta del flujo: catalogo publico, OAuth2 y permisos.
# Correr con:  pytest   (la BD temporal se configura en conftest.py)
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

s = get_settings()


def token(client, email, password):
    r = client.post("/auth/token", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_flujo_completo():
    with TestClient(app) as c:
        # Catalogo publico
        cats = c.get("/categorias").json()
        assert len(cats) == 4
        cat = c.get("/categorias/1").json()
        assert len(cat["productos"]) == 2

        # Sin token no se puede pedir
        assert c.post("/pedidos", json={"items": [{"producto_id": 1, "cantidad": 1}]}).status_code == 401

        # Login incorrecto
        r = c.post("/auth/token", data={"username": s.seed_cliente_email, "password": "mala"})
        assert r.status_code == 401

        # Registro + login de un cliente nuevo
        r = c.post("/auth/registro", json={"nombre": "Ana", "email": "ana@test.com", "password": "secreta123"})
        assert r.status_code == 201 and "hashed_password" not in r.json()
        assert c.post("/auth/registro", json={"nombre": "Ana", "email": "ana@test.com", "password": "secreta123"}).status_code == 409
        ana = token(c, "ana@test.com", "secreta123")
        assert c.get("/auth/me", headers=ana).json()["email"] == "ana@test.com"

        # Pedido: descuenta stock y calcula subtotales
        stock_antes = c.get("/productos/1").json()["stock"]
        r = c.post("/pedidos", headers=ana, json={"items": [{"producto_id": 1, "cantidad": 2}, {"producto_id": 3, "cantidad": 1}], "metodo_pago": "pickup"})
        assert r.status_code == 201, r.text
        pedido = r.json()
        assert pedido["total"] == 95 and pedido["cliente"]["email"] == "ana@test.com"
        assert pedido["items"][0]["subtotal"] == 70
        assert pedido["estado"] == "pendiente_pago" and pedido["pago"]["metodo"] == "pickup"
        assert c.get("/productos/1").json()["stock"] == stock_antes - 2

        # Stock insuficiente (producto 6 tiene 0) no descuenta nada
        r = c.post("/pedidos", headers=ana, json={"items": [{"producto_id": 1, "cantidad": 1}, {"producto_id": 6, "cantidad": 1}], "metodo_pago": "oxxo"})
        assert r.status_code == 400
        assert c.get("/productos/1").json()["stock"] == stock_antes - 2

        assert len(c.get("/pedidos/mios", headers=ana).json()) == 1

        # Otro cliente no ve el pedido de Ana
        otro = token(c, s.seed_cliente_email, s.seed_cliente_password)
        assert c.get(f"/pedidos/{pedido['id']}", headers=otro).status_code == 404

        # Un cliente normal no puede administrar
        nuevo = {"nombre": "X", "descripcion": "x", "precio": 10, "stock": 5, "imagen": "x", "categoria_id": 1}
        assert c.post("/productos", headers=ana, json=nuevo).status_code == 403
        assert c.get("/pedidos", headers=ana).status_code == 403
        # Aunque pida el scope admin al hacer login, no se le otorga
        r = c.post("/auth/token", data={"username": "ana@test.com", "password": "secreta123", "scope": "admin pedidos"})
        hack = {"Authorization": f"Bearer {r.json()['access_token']}"}
        assert c.post("/productos", headers=hack, json=nuevo).status_code == 403

        # Admin: CRUD de productos y ve todos los pedidos
        admin = token(c, s.seed_admin_email, s.seed_admin_password)
        r = c.post("/productos", headers=admin, json=nuevo)
        assert r.status_code == 201
        pid = r.json()["id"]
        assert c.patch(f"/productos/{pid}", headers=admin, json={"precio": 12}).json()["precio"] == 12
        assert c.delete(f"/productos/{pid}", headers=admin).status_code == 204
        assert c.delete("/productos/1", headers=admin).status_code == 409  # ya esta en un pedido
        assert len(c.get("/pedidos", headers=admin).json()) == 1
        assert c.get(f"/pedidos/{pedido['id']}", headers=admin).status_code == 200

        # Token alterado
        assert c.get("/auth/me", headers={"Authorization": "Bearer abc.def.ghi"}).status_code == 401
