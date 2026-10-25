# Pruebas del Backoffice: GraphQL (queries, mutations, permisos), subida de imagenes,
# confirmacion de recogida por el trabajador y Subscriptions por WebSocket.
import json

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

s = get_settings()
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64  # lo suficiente para que parezca un PNG


def login(c, email, password):
    r = c.post("/auth/token", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def gql(c, query, variables=None, headers=None):
    r = c.post("/graphql", json={"query": query, "variables": variables or {}}, headers=headers or {})
    assert r.status_code == 200, r.text
    return r.json()


def hacer_pedido(c, headers, items, metodo):
    r = c.post("/pedidos", headers=headers, json={"items": items, "metodo_pago": metodo})
    assert r.status_code == 201, r.text
    return r.json()


def test_permisos_graphql():
    with TestClient(app) as c:
        admin = login(c, s.seed_admin_email, s.seed_admin_password)
        trabajador = login(c, s.seed_trabajador_email, s.seed_trabajador_password)
        cliente = login(c, s.seed_cliente_email, s.seed_cliente_password)

        # Sin token: error, no datos.
        r = gql(c, "{ productos { id } }")
        assert r["data"] is None and "iniciar sesion" in r["errors"][0]["message"]

        # Un cliente normal no entra al backoffice.
        r = gql(c, "{ pedidos { id } }", headers=cliente)
        assert r["data"] is None and "permiso" in r["errors"][0]["message"]

        # El trabajador ve pedidos pero NO administra productos.
        assert "errors" not in gql(c, "{ pedidos { id } }", headers=trabajador)
        r = gql(c, "{ productos { id } }", headers=trabajador)
        assert r["data"] is None and "permiso" in r["errors"][0]["message"]
        r = gql(c, 'mutation { eliminarProducto(id: 1) }', headers=trabajador)
        assert r["data"] is None

        # El admin si.
        r = gql(c, "{ productos { id nombre activo } categorias { id totalProductos } }", headers=admin)
        assert len(r["data"]["productos"]) >= 7 and len(r["data"]["categorias"]) == 4

        # Token falso
        r = gql(c, "{ pedidos { id } }", headers={"Authorization": "Bearer basura"})
        assert r["data"] is None


def test_admin_crea_edita_oculta_y_elimina_producto_con_imagen():
    with TestClient(app) as c:
        admin = login(c, s.seed_admin_email, s.seed_admin_password)
        cliente = login(c, s.seed_cliente_email, s.seed_cliente_password)

        # --- Subida de imagen: solo admin, solo imagenes reales ---
        assert c.post("/imagenes", files={"archivo": ("a.png", PNG, "image/png")}).status_code == 401
        assert c.post("/imagenes", headers=cliente, files={"archivo": ("a.png", PNG, "image/png")}).status_code == 403
        falsa = c.post("/imagenes", headers=admin, files={"archivo": ("virus.png", b"<script>alert(1)</script>", "image/png")})
        assert falsa.status_code == 415  # el contenido no es una imagen aunque diga .png
        grande = c.post("/imagenes", headers=admin, files={"archivo": ("g.png", PNG + b"0" * (5 * 1024 * 1024), "image/png")})
        assert grande.status_code == 413
        r = c.post("/imagenes", headers=admin, files={"archivo": ("foto.png", PNG, "image/png")})
        assert r.status_code == 201
        url = r.json()["url"]
        assert url.startswith("/uploads/") and url.endswith(".png")
        assert c.get(url).content == PNG  # ya se sirve como archivo estatico

        # --- Crear producto con esa imagen ---
        crear = """mutation($d: ProductoInput!) { crearProducto(datos: $d) { id nombre descripcion precio stock imagen activo categoriaNombre } }"""
        datos = {"nombre": "Gusanitos Neon", "descripcion": "Gusanos acidos que brillan", "precio": 32.5,
                 "stock": 12, "imagen": url, "categoriaId": 1, "activo": True}
        r = gql(c, crear, {"d": datos}, admin)
        assert "errors" not in r, r
        nuevo = r["data"]["crearProducto"]
        assert nuevo["imagen"] == url and nuevo["categoriaNombre"] == "Acidas"
        pid = nuevo["id"]
        # Aparece en la tienda (REST publico)
        assert any(p["id"] == pid for p in c.get("/productos").json())

        # Validaciones
        assert "errors" in gql(c, crear, {"d": {**datos, "precio": -1}}, admin)
        assert "errors" in gql(c, crear, {"d": {**datos, "nombre": "   "}}, admin)
        assert "errors" in gql(c, crear, {"d": {**datos, "categoriaId": 999}}, admin)

        # --- Editar descripcion / precio ---
        editar = """mutation($id: Int!, $d: ProductoInput!) { actualizarProducto(id: $id, datos: $d) { descripcion precio } }"""
        r = gql(c, editar, {"id": pid, "d": {**datos, "descripcion": "Ahora con mas brillo", "precio": 40}}, admin)
        assert r["data"]["actualizarProducto"] == {"descripcion": "Ahora con mas brillo", "precio": 40.0}
        assert c.get(f"/productos/{pid}").json()["descripcion"] == "Ahora con mas brillo"

        # --- Ocultar: desaparece de la tienda pero no se borra ---
        r = gql(c, f"mutation {{ cambiarActivo(id: {pid}, activo: false) {{ activo }} }}", headers=admin)
        assert r["data"]["cambiarActivo"]["activo"] is False
        assert all(p["id"] != pid for p in c.get("/productos").json())
        assert c.get(f"/productos/{pid}").status_code == 404
        assert all(p["id"] != pid for p in c.get("/categorias/1").json()["productos"])
        # y no se puede comprar
        r = c.post("/pedidos", headers=cliente, json={"items": [{"producto_id": pid, "cantidad": 1}], "metodo_pago": "pickup"})
        assert r.status_code == 400
        # el admin lo sigue viendo
        assert any(p["id"] == pid for p in gql(c, "{ productos { id } }", headers=admin)["data"]["productos"])

        # --- Stock ---
        r = gql(c, f"mutation {{ ajustarStock(id: {pid}, stock: 99) {{ stock }} }}", headers=admin)
        assert r["data"]["ajustarStock"]["stock"] == 99
        assert "errors" in gql(c, f"mutation {{ ajustarStock(id: {pid}, stock: -3) {{ stock }} }}", headers=admin)

        # --- Eliminar: se puede si nunca se vendio; si ya esta en un pedido, no ---
        gql(c, f"mutation {{ cambiarActivo(id: {pid}, activo: true) {{ activo }} }}", headers=admin)
        hacer_pedido(c, cliente, [{"producto_id": pid, "cantidad": 1}], "pickup")
        r = gql(c, f"mutation {{ eliminarProducto(id: {pid}) }}", headers=admin)
        assert "ocultalo" in r["errors"][0]["message"].lower()
        r = gql(c, crear, {"d": {**datos, "nombre": "Temporal"}}, admin)
        temporal = r["data"]["crearProducto"]["id"]
        assert gql(c, f"mutation {{ eliminarProducto(id: {temporal}) }}", headers=admin)["data"]["eliminarProducto"] is True

        # Sin imagen se pone una de relleno
        r = gql(c, crear, {"d": {**datos, "nombre": "Sin foto", "imagen": ""}}, admin)
        assert r["data"]["crearProducto"]["imagen"].startswith("https://placehold.co")


def test_categorias_crud():
    with TestClient(app) as c:
        admin = login(c, s.seed_admin_email, s.seed_admin_password)
        r = gql(c, 'mutation { crearCategoria(datos: {nombre: "Picosas", descripcion: "Con chile", imagen: ""}) { id nombre totalProductos } }', headers=admin)
        cid = r["data"]["crearCategoria"]["id"]
        r = gql(c, f'mutation {{ actualizarCategoria(id: {cid}, datos: {{nombre: "Picositas", descripcion: "Con mas chile", imagen: ""}}) {{ nombre }} }}', headers=admin)
        assert r["data"]["actualizarCategoria"]["nombre"] == "Picositas"
        # una categoria con productos no se borra
        assert "errors" in gql(c, "mutation { eliminarCategoria(id: 1) }", headers=admin)
        assert gql(c, f"mutation {{ eliminarCategoria(id: {cid}) }}", headers=admin)["data"]["eliminarCategoria"] is True


def test_trabajador_confirma_recogida():
    with TestClient(app) as c:
        trabajador = login(c, s.seed_trabajador_email, s.seed_trabajador_password)
        cliente = login(c, s.seed_cliente_email, s.seed_cliente_password)

        # Pedido pagar-al-recoger: aparece en la fila, el trabajador lo cobra y entrega con su codigo.
        pedido = hacer_pedido(c, cliente, [{"producto_id": 3, "cantidad": 1}], "pickup")
        assert len(pedido["codigo_recogida"]) == 6

        cola = gql(c, "{ pedidos(soloPorRecoger: true) { id codigoRecogida listoParaRecoger } }", headers=trabajador)
        assert pedido["id"] in [p["id"] for p in cola["data"]["pedidos"]]
        por_codigo = gql(c, "query($c: String!) { pedidoPorCodigo(codigo: $c) { id } }", {"c": pedido["codigo_recogida"].lower()}, trabajador)
        assert por_codigo["data"]["pedidoPorCodigo"]["id"] == pedido["id"]

        confirmar = "mutation($id: Int!, $c: String) { confirmarRecogida(pedidoId: $id, codigo: $c) { estado entregadoPor fechaEntrega pago { estado } } }"
        r = gql(c, confirmar, {"id": pedido["id"], "c": "XXXXXX"}, trabajador)
        assert "no coincide" in r["errors"][0]["message"]
        r = gql(c, confirmar, {"id": pedido["id"], "c": pedido["codigo_recogida"]}, trabajador)
        res = r["data"]["confirmarRecogida"]
        assert res["estado"] == "entregado" and res["pago"]["estado"] == "aprobado"
        assert res["entregadoPor"] == "Trabajador de Mostrador" and res["fechaEntrega"]
        # ya no esta en la fila y no se puede entregar dos veces
        r = gql(c, confirmar, {"id": pedido["id"]}, trabajador)
        assert "ya fue entregado" in r["errors"][0]["message"]

        # Pedido con Mercado Pago (simulado): sin pagar NO se entrega...
        mp = hacer_pedido(c, cliente, [{"producto_id": 4, "cantidad": 1}], "tarjeta_credito")
        r = gql(c, confirmar, {"id": mp["id"]}, trabajador)
        assert "no esta pagado" in r["errors"][0]["message"]
        # ...y cuando MP aprueba el pago, ya aparece "listo para recoger" y se entrega.
        assert c.post(f"/pagos/{mp['id']}/simular", headers=cliente, json={"resultado": "aprobado"}).status_code == 200
        pedidos = gql(c, "{ pedidos(soloPorRecoger: true) { id listoParaRecoger estado } }", headers=trabajador)["data"]["pedidos"]
        assert any(p["id"] == mp["id"] and p["estado"] == "pagado" and p["listoParaRecoger"] for p in pedidos)
        r = gql(c, confirmar, {"id": mp["id"]}, trabajador)
        assert r["data"]["confirmarRecogida"]["estado"] == "entregado"

        # El trabajador tambien puede usar la ruta REST, y el cliente no.
        otro = hacer_pedido(c, cliente, [{"producto_id": 1, "cantidad": 1}], "pickup")
        assert c.post(f"/pedidos/{otro['id']}/entregar", headers=cliente).status_code == 403
        assert c.post(f"/pedidos/{otro['id']}/entregar", headers=trabajador).json()["estado"] == "entregado"

        # El trabajador no ve dinero del dia, el admin si.
        assert gql(c, "{ resumen { ingresosHoy porRecoger } }", headers=trabajador)["data"]["resumen"]["ingresosHoy"] is None
        admin = login(c, s.seed_admin_email, s.seed_admin_password)
        assert gql(c, "{ resumen { ingresosHoy } }", headers=admin)["data"]["resumen"]["ingresosHoy"] is not None


def test_equipo_y_cancelar():
    with TestClient(app) as c:
        admin = login(c, s.seed_admin_email, s.seed_admin_password)
        cliente = login(c, s.seed_cliente_email, s.seed_cliente_password)
        crear = 'mutation($d: TrabajadorInput!) { crearTrabajador(datos: $d) { id esTrabajador } }'
        r = gql(c, crear, {"d": {"nombre": "Luis", "email": "luis@gomitas.com", "password": "luis12345"}}, admin)
        luis_id = r["data"]["crearTrabajador"]["id"]
        assert "errors" in gql(c, crear, {"d": {"nombre": "Luis", "email": "luis@gomitas.com", "password": "luis12345"}}, admin)
        assert "errors" in gql(c, crear, {"d": {"nombre": "X", "email": "x@x.com", "password": "corta"}}, admin)
        luis = login(c, "luis@gomitas.com", "luis12345")
        assert "errors" not in gql(c, "{ pedidos { id } }", headers=luis)

        # Deshabilitar: ya no entra al backoffice
        gql(c, f"mutation {{ cambiarEstadoUsuario(id: {luis_id}, deshabilitado: true) {{ disabled }} }}", headers=admin)
        assert "errors" in gql(c, "{ pedidos { id } }", headers=luis)
        # el admin no se puede deshabilitar a si mismo
        yo = c.get("/auth/me", headers=admin).json()["id"]
        assert "errors" in gql(c, f"mutation {{ cambiarEstadoUsuario(id: {yo}, deshabilitado: true) {{ id }} }}", headers=admin)

        # Cancelar devuelve el stock
        antes = c.get("/productos/2").json()["stock"]
        pedido = hacer_pedido(c, cliente, [{"producto_id": 2, "cantidad": 3}], "oxxo")
        assert c.get("/productos/2").json()["stock"] == antes - 3
        r = gql(c, f"mutation {{ cancelarPedido(pedidoId: {pedido['id']}) {{ estado }} }}", headers=admin)
        assert r["data"]["cancelarPedido"]["estado"] == "cancelado"
        assert c.get("/productos/2").json()["stock"] == antes
        # marcarPagado: solo admin
        otro = hacer_pedido(c, cliente, [{"producto_id": 2, "cantidad": 1}], "oxxo")
        trabajador = login(c, s.seed_trabajador_email, s.seed_trabajador_password)
        assert "errors" in gql(c, f"mutation {{ marcarPagado(pedidoId: {otro['id']}) {{ estado }} }}", headers=trabajador)
        assert gql(c, f"mutation {{ marcarPagado(pedidoId: {otro['id']}) {{ estado }} }}", headers=admin)["data"]["marcarPagado"]["estado"] == "pagado"


def recibir(ws):
    """Lee mensajes del websocket hasta encontrar uno de datos (ignora ping/pong/ack)."""
    while True:
        mensaje = json.loads(ws.receive_text())
        if mensaje["type"] in ("next", "error", "complete"):
            return mensaje


def test_subscription_pedidos_en_vivo():
    with TestClient(app) as c:
        trabajador = login(c, s.seed_trabajador_email, s.seed_trabajador_password)
        cliente = login(c, s.seed_cliente_email, s.seed_cliente_password)
        token_t = trabajador["Authorization"]
        token_c = cliente["Authorization"]

        with c.websocket_connect("/graphql", subprotocols=["graphql-transport-ws"]) as ws, \
             c.websocket_connect("/graphql", subprotocols=["graphql-transport-ws"]) as ws_cliente:
            # Trabajador: se suscribe a TODOS los pedidos
            ws.send_text(json.dumps({"type": "connection_init", "payload": {"Authorization": token_t}}))
            assert json.loads(ws.receive_text())["type"] == "connection_ack"
            ws.send_text(json.dumps({"id": "1", "type": "subscribe", "payload": {
                "query": "subscription { pedidosEnVivo { tipo pedido { id estado codigoRecogida cliente { nombre } } } }"}}))
            # Cliente: solo a SUS pedidos
            ws_cliente.send_text(json.dumps({"type": "connection_init", "payload": {"Authorization": token_c}}))
            assert json.loads(ws_cliente.receive_text())["type"] == "connection_ack"
            ws_cliente.send_text(json.dumps({"id": "1", "type": "subscribe", "payload": {
                "query": "subscription { misPedidosEnVivo { tipo pedido { id estado } } }"}}))

            import time
            time.sleep(0.3)  # deja que las dos subscriptions se registren en el bus

            # 1) Entra un pedido nuevo (por REST, como lo haria la tienda)
            pedido = hacer_pedido(c, cliente, [{"producto_id": 3, "cantidad": 1}], "tarjeta_credito")
            msg = recibir(ws)
            assert msg["type"] == "next", msg
            ev = msg["payload"]["data"]["pedidosEnVivo"]
            assert ev["tipo"] == "NUEVO" and ev["pedido"]["id"] == pedido["id"]
            assert ev["pedido"]["codigoRecogida"] == pedido["codigo_recogida"]
            assert recibir(ws_cliente)["payload"]["data"]["misPedidosEnVivo"]["tipo"] == "NUEVO"

            # 2) Mercado Pago aprueba el pago -> el trabajador lo ve "pagado" sin recargar
            c.post(f"/pagos/{pedido['id']}/simular", headers=cliente, json={"resultado": "aprobado"})
            ev = recibir(ws)["payload"]["data"]["pedidosEnVivo"]
            assert ev["tipo"] == "PAGADO" and ev["pedido"]["estado"] == "pagado"
            assert recibir(ws_cliente)["payload"]["data"]["misPedidosEnVivo"]["pedido"]["estado"] == "pagado"

            # 3) El trabajador confirma la recogida -> ENTREGADO
            c.post(f"/pedidos/{pedido['id']}/entregar", headers=trabajador)
            ev = recibir(ws)["payload"]["data"]["pedidosEnVivo"]
            assert ev["tipo"] == "ENTREGADO"

        # Sin token la subscription se rechaza
        with c.websocket_connect("/graphql", subprotocols=["graphql-transport-ws"]) as ws:
            ws.send_text(json.dumps({"type": "connection_init", "payload": {}}))
            assert json.loads(ws.receive_text())["type"] == "connection_ack"
            ws.send_text(json.dumps({"id": "1", "type": "subscribe", "payload": {"query": "subscription { pedidosEnVivo { tipo } }"}}))
            msg = recibir(ws)
            assert msg["type"] in ("error", "next") and "iniciar sesion" in json.dumps(msg)


def test_subscription_inventario():
    with TestClient(app) as c:
        admin = login(c, s.seed_admin_email, s.seed_admin_password)
        cliente = login(c, s.seed_cliente_email, s.seed_cliente_password)
        with c.websocket_connect("/graphql", subprotocols=["graphql-transport-ws"]) as ws:
            ws.send_text(json.dumps({"type": "connection_init", "payload": {"Authorization": admin["Authorization"]}}))
            assert json.loads(ws.receive_text())["type"] == "connection_ack"
            ws.send_text(json.dumps({"id": "1", "type": "subscribe", "payload": {
                "query": "subscription { inventarioEnVivo { tipo productoId producto { stock nombre } } }"}}))
            import time
            time.sleep(0.3)
            antes = c.get("/productos/4").json()["stock"]
            hacer_pedido(c, cliente, [{"producto_id": 4, "cantidad": 2}], "pickup")
            ev = recibir(ws)["payload"]["data"]["inventarioEnVivo"]
            assert ev["productoId"] == 4 and ev["producto"]["stock"] == antes - 2
