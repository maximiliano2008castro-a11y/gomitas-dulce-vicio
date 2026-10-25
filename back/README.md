# Backend — Gomitas E-commerce (FastAPI + OAuth2 + Mercado Pago + Backoffice GraphQL)

Migracion del backend GraphQL (Node + Apollo) a **FastAPI**, siguiendo el tutorial
oficial (https://fastapi.tiangolo.com/tutorial/):

| Capitulo del tutorial | Donde se aplica |
| --- | --- |
| Bigger Applications – Multiple Files | `app/main.py` + `app/routers/` |
| SQL (Relational) Databases (SQLModel) | `app/database.py`, `app/models.py` |
| Settings and Environment Variables | `app/config.py` + `.env` |
| Security – OAuth2 with Password, Bearer with JWT | `app/security.py`, `app/routers/auth.py` |
| Advanced Security – OAuth2 scopes | scopes `pedidos` y `admin` en `app/security.py` |
| CORS | `app/main.py` |
| Testing | `tests/test_api.py`, `tests/test_pagos.py`, `tests/test_backoffice.py` |
| (extra) GraphQL + Subscriptions con Strawberry | `app/graphql_api/`, `app/eventos.py` |
| (extra) Archivos / `UploadFile` + StaticFiles | `app/routers/imagenes.py`, `app/main.py` |

## Requisitos

- Python 3.11 o superior

## Como correrlo

```bash
cd back
python -m venv .venv
.venv\Scripts\activate          # Windows  (Linux/Mac: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env          # y cambia SECRET_KEY (Linux/Mac: cp)
fastapi dev app/main.py
```

Queda en `http://localhost:8000`. La documentacion interactiva (Swagger) esta en
**`http://localhost:8000/docs`**: el boton **Authorize** abre el login OAuth2 y deja
probar los endpoints protegidos.

La primera vez crea `gomitas.db` (SQLite) con las categorias, productos y dos
usuarios de prueba (ver `SEED_*` en `.env.example`): un **admin** y un **cliente**.

Pruebas automaticas: `pytest`

## Autenticacion (OAuth2 Password Flow + JWT)

1. `POST /auth/registro` (JSON `nombre`, `email`, `password`) crea la cuenta. La
   contraseña se guarda con hash **Argon2** (`pwdlib`).
2. `POST /auth/token` (form-data `username`=email, `password`) regresa
   `{ "access_token": "...", "token_type": "bearer" }`. El token es un **JWT** firmado
   con `SECRET_KEY` que vence en `ACCESS_TOKEN_EXPIRE_MINUTES`.
3. Las rutas protegidas se llaman con el header `Authorization: Bearer <token>`.

**Scopes** (permisos dentro del token):

- `pedidos` — todo cliente: crear y ver *sus* pedidos.
- `trabajador` — personal de mostrador (`es_trabajador`) y admins: ver todos los pedidos y
  **confirmar recogidas**. No puede tocar productos ni ver el dinero del dia.
- `admin` — solo usuarios con `es_admin`: productos, categorias, equipo, pagos y dashboard.

Aunque alguien pida `scope=admin` al hacer login, el servidor solo otorga los scopes
que ese usuario tiene. Sin token → **401**; con token pero sin el scope → **403**.

## Endpoints

| Metodo | Ruta | Acceso |
| --- | --- | --- |
| POST | `/auth/registro` | publico |
| POST | `/auth/token` | publico (login) |
| GET | `/auth/me` | cualquier usuario autenticado |
| GET | `/categorias` | publico |
| GET | `/categorias/{id}` | publico (incluye sus productos) |
| GET | `/productos?categoria_id=` | publico |
| GET | `/productos/{id}` | publico |
| POST | `/productos` | scope `admin` |
| PATCH | `/productos/{id}` | scope `admin` |
| DELETE | `/productos/{id}` | scope `admin` (409 si ya esta en un pedido) |
| POST | `/pedidos` | scope `pedidos` — valida y descuenta stock |
| GET | `/pedidos/mios` | scope `pedidos` |
| GET | `/pedidos/{id}` | scope `pedidos` (solo el dueño o un admin) |
| GET | `/pedidos?metodo=&estado=&estado_pago=` | scope `trabajador` (con filtros) |
| POST | `/pedidos/{id}/cancelar` | scope `pedidos` (dueño o admin; regresa el stock) |
| POST | `/pedidos/{id}/entregar` | scope `trabajador` — body opcional `{"codigo": "K7M2QX"}`; si es "pagar al recoger", ahi se cobra |
| POST | `/imagenes` | scope `admin` — `multipart/form-data` con `archivo`; regresa `{"url": "/uploads/<id>.png"}` |
| GET | `/uploads/<archivo>` | publico — las imagenes subidas |
| POST / WS | `/graphql` | Backoffice GraphQL (ver abajo). Tambien GraphiQL en el navegador |
| GET | `/pagos/config` | publico — `modo`: `mercadopago` o `simulado` |
| POST | `/pagos/{id}/reintentar` | scope `pedidos` — nuevo cobro, puede cambiar el metodo |
| POST | `/pagos/{id}/verificar` | scope `pedidos` — consulta el pago en la API de MP |
| POST | `/pagos/{id}/simular` | scope `pedidos` — solo en modo simulado |
| PATCH | `/pagos/{id}` | scope `admin` — cambiar el estado a mano |
| POST | `/pagos/webhook` | publico (Mercado Pago; valida `x-signature`) |
| GET | `/admin/estadisticas?dias=30` | scope `admin` — datos del dashboard |

## Metodos de pago (Mercado Pago Checkout Pro)

`POST /pedidos` ahora recibe `metodo_pago`:

| Metodo | Como se cobra |
| --- | --- |
| `tarjeta_credito` | Checkout Pro solo con tarjetas de credito (hasta 12 meses) |
| `tarjeta_debito` | Checkout Pro solo con tarjetas de debito |
| `oxxo` | Checkout Pro con pago en efectivo: genera la ficha para OXXO y otras tiendas |
| `link_pago` | Link de Checkout Pro que acepta cualquier metodo y se puede compartir |
| `pickup` | Sin pasarela: se paga al recoger y el admin lo marca con `/entregar` |

El stock se aparta al crear el pedido; si se cancela (o MP avisa que la ficha OXXO
vencio) se devuelve. El total se calcula en el servidor y, al aprobar un pago, se
revisa que lo que reporta Mercado Pago coincida con el pedido.

### Modo simulado (por defecto)

Sin `MP_ACCESS_TOKEN` en `.env` no se llama a Mercado Pago: el frontend muestra una
pasarela de mentira donde se elige si el pago se aprueba, se rechaza o queda
pendiente. Sirve para probar todo el flujo y llenar el dashboard sin cuenta.

### Usar Mercado Pago de verdad (sandbox)

1. Crea una aplicacion en https://www.mercadopago.com.mx/developers/panel/app
   (producto **Checkout Pro**).
2. En **Credenciales de prueba** copia el *Access Token* y pegalo en `.env`:
   `MP_ACCESS_TOKEN=TEST-...`
3. Reinicia el backend. `GET /pagos/config` debe decir `"modo": "mercadopago"`.
4. Para pagar usa las tarjetas de prueba de Mercado Pago (titular `APRO` = aprobado,
   `OTHE` = rechazado). Vienen en la documentacion de Checkout Pro, seccion
   "Tarjetas de prueba". Con credenciales de prueba MP pide entrar con un
   **usuario de prueba comprador** (se crean en el mismo panel), no con tu cuenta real.

Al terminar, Mercado Pago regresa al frontend (`FRONTEND_URL/?pago=retorno&pedido=ID`)
y el backend **consulta el pago en la API de MP** (no confia en la URL). En localhost
MP no puede mandar webhooks; para recibirlos expon el backend (por ejemplo con ngrok),
pon esa URL en `MP_NOTIFICATION_URL=https://.../pagos/webhook` y el secreto de la
seccion Webhooks del panel en `MP_WEBHOOK_SECRET`.

## Dashboard

`GET /admin/estadisticas?dias=7|30|90|0` regresa: resumen (ingresos, pedidos, tasa de
aprobacion, ticket promedio, monto por cobrar), pagos por metodo y estado, estado de
pedidos, pagos aprobados por marca (Visa, Mastercard, OXXO...), ingresos por dia y
productos mas vendidos. La primera vez que arranca, el backend crea ~70 pedidos de
ejemplo de los ultimos 30 dias para que el dashboard tenga datos
(`SEED_PEDIDOS_DEMO=false` para no crearlos).

Equivalencia con la API GraphQL anterior: `categorias`/`categoria` → `GET /categorias`,
`productos`/`producto` → `GET /productos`, `crearProducto`/`actualizarProducto`/
`eliminarProducto` → `POST`/`PATCH`/`DELETE /productos`, `crearPedido` →
`POST /pedidos`. El pedido ya no recibe `clienteNombre`/`clienteEmail`: el cliente
se toma del token.

## Backoffice GraphQL (`/graphql`)

Es el API del panel de administrador. Reutiliza el mismo login OAuth2/JWT y las mismas reglas
de negocio del REST (`servicios_pago.py`); la tienda sigue usando REST.

- **Queries / Mutations** por HTTP `POST /graphql` con `Authorization: Bearer <token>`.
- **Subscriptions** por WebSocket (`ws://localhost:8000/graphql`, protocolo `graphql-transport-ws`).
  Un navegador no puede mandar headers en un WebSocket, asi que el token viaja en el mensaje
  `connection_init` como `{"Authorization": "Bearer <token>"}`.
- Abre `http://localhost:8000/graphql` en el navegador para probar con **GraphiQL**.

| Tipo | Operacion | Rol |
| --- | --- | --- |
| Query | `productos(busqueda, categoriaId)` (incluye los ocultos), `categorias`, `equipo` | admin |
| Query | `pedidos(estado, metodo, buscar, soloPorRecoger, limite)`, `pedidoPorCodigo(codigo)`, `resumen` | trabajador |
| Query | `misPedidos` | cliente |
| Mutation | `crearProducto`, `actualizarProducto`, `ajustarStock`, `cambiarActivo`, `eliminarProducto` | admin |
| Mutation | `crearCategoria`, `actualizarCategoria`, `eliminarCategoria` | admin |
| Mutation | `crearTrabajador`, `cambiarEstadoUsuario`, `marcarPagado` | admin |
| Mutation | `confirmarRecogida(pedidoId, codigo)`, `cancelarPedido(pedidoId)` | trabajador |
| Subscription | `pedidosEnVivo` — pedido nuevo / pagado / entregado / cancelado | trabajador |
| Subscription | `inventarioEnVivo` — cambios de stock o de datos de un producto | admin |
| Subscription | `misPedidosEnVivo` — solo los pedidos del cliente que se suscribe | cliente |

Ejemplo de subscription (GraphiQL, con el token en el header o en connectionParams):

```graphql
subscription {
  pedidosEnVivo {
    tipo                      # NUEVO | PAGADO | ENTREGADO | CANCELADO | ACTUALIZADO
    pedido { id total codigoRecogida cliente { nombre } pago { metodo estado } }
  }
}
```

**Como funcionan las subscriptions:** `app/eventos.py` es un bus en memoria. Cuando un pedido
cambia (crear, pagar, webhook de Mercado Pago, recoger, cancelar...) el codigo llama a
`publicar_pedido()`; cada subscription abierta tiene su cola y recibe el evento. Solo viaja el
id: la subscription vuelve a leer la BD y manda el pedido actualizado. *Limite:* es memoria de un
solo proceso (`fastapi dev` / un `uvicorn`); con varios workers habria que usar Redis pub/sub.

**Recogida en mostrador:** cada pedido tiene un `codigo_recogida` de 6 caracteres (sin 0/O/1/I).
`confirmarRecogida` marca el pedido como `entregado` y guarda quien y cuando; si el pedido era
"pagar al recoger" tambien cobra ahi. Un pedido de Mercado Pago aun sin pagar **no se puede
entregar**.

**Imagenes:** `POST /imagenes` valida el *contenido* del archivo (firma JPG/PNG/WEBP/GIF, no el
nombre ni el content-type), maximo 5 MB, y lo guarda con nombre aleatorio en `back/uploads/`.

**Base de datos vieja:** al arrancar, `database.py` agrega solas las columnas nuevas
(`activo`, `es_trabajador`, `codigo_recogida`, ...) a un `gomitas.db` anterior y les pone codigo
a los pedidos que no tenian; no hay que borrarlo.

## Entidades

Categoria, Producto (`activo`), Cliente (tambien es el usuario: `hashed_password`, `es_admin`,
`es_trabajador`, `disabled`), Pedido (`codigo_recogida`, `fecha_entrega`, `entregado_por`),
DetallePedido y **Pago** (1:1 con Pedido) — mismas relaciones que `../db.sql`.

> Si ya tenias un `gomitas.db` de la version anterior, borralo para que se cree con la
> tabla `pago` (SQLite no agrega columnas nuevas solo).

## Usar MySQL/MariaDB en vez de SQLite

```bash
mysql -u root -p < ../db.sql
pip install pymysql
```

y en `.env`: `DATABASE_URL=mysql+pymysql://root:password@localhost/gomitas_ecommerce`.
