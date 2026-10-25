# Practica P2-6 — E-commerce de gomitas: FastAPI + OAuth2 + Mercado Pago + Backoffice GraphQL en vivo

E-commerce de gomitas: frontend React (flujo por estado, sin URLs) consultando su
propio backend REST en FastAPI, con inicio de sesion OAuth2 (password flow + JWT),
**pagos con Mercado Pago** (tarjeta de credito, debito, efectivo en OXXO, link de pago
y pago al recoger), un **dashboard** de estadisticas y un **Backoffice completo con GraphQL
Subscriptions**: el administrador maneja productos (con foto y descripcion), categorias y equipo, y los
trabajadores confirman en el mostrador que el cliente ya recogio su pedido, todo en tiempo real.

> **Para revisarlo rapido:** doble clic en `INICIAR.bat` (instala y abre todo) y `PROBAR.bat` (pruebas). Ver **`COMO-REVISAR.md`**.

## Estructura

```
practica p2-6/
├── front/          # React + Vite (ver front/README.md)
├── back/           # Python + FastAPI + SQLModel + OAuth2 (ver back/README.md)
├── db.sql          # Esquema SQL (migracion futura, ver seccion abajo)
├── reporte-p2.md   # UML de componentes / maquina de estados del frontend
├── reporte-p6.md   # UML de entidades (DER) del backend
├── INICIAR.bat     # Instala y arranca todo (Windows)
├── PROBAR.bat      # Corre las pruebas automaticas
├── COMO-REVISAR.md # Guia para quien revisa
├── reporte-pagos.md # Metodos de pago, Mercado Pago y dashboard
├── reporte-backoffice.md # Backoffice, GraphQL y Subscriptions (para el blog)
└── assets/         # Capturas de pantalla
```

## Como correrlo (2 terminales)

**Terminal 1 — backend:**

```bash
cd back
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
fastapi dev app/main.py
```

Queda en `http://localhost:8000` (Swagger en `/docs`).

**Terminal 2 — frontend:**

```bash
cd front
npm install
npm run dev
```

Abrir `http://localhost:5173`. El frontend ya apunta a `http://localhost:8000` por
defecto (ver `front/src/api/client.js`, configurable con `VITE_API_URL`).

## Flujo con autenticacion

home → categoria → carrito → **login / registro** → checkout. El catalogo es publico;
confirmar un pedido requiere sesion. El token OAuth2 se guarda en el store de Zustand
(`front/src/store/useAuthStore.js`) y viaja en `Authorization: Bearer` en cada peticion.
Si vence, la sesion se cierra sola y el checkout vuelve a pedir login.

## Pagos y dashboard

checkout → **elegir metodo de pago** → pagar (Mercado Pago, ficha OXXO, link o en
tienda) → estado del pago. El cliente ve sus pedidos en **Mis pedidos** y puede
reintentar, cambiar de metodo o cancelar. Sin credenciales de Mercado Pago todo
funciona con una **pasarela simulada**; para usar el sandbox real basta poner
`MP_ACCESS_TOKEN` en `back/.env` (ver `back/README.md`).

Usuarios de prueba:

| Rol | Email | Contraseña | Que ve |
|---|---|---|---|
| Administrador | `admin@gomitas.com` | `admin12345` | **Backoffice** completo |
| Trabajador | `trabajador@gomitas.com` | `trabajador12345` | Backoffice: Inicio, **Recogida** y Pedidos |
| Cliente | `cliente@prueba.com` | `cliente12345` | La tienda |

## Backoffice (boton **🛠️ Backoffice** al entrar como admin o trabajador)

- **Productos:** crear, editar (nombre, descripcion, precio, categoria), **subir la foto**
  (arrastrar y soltar), ajustar stock con +/−, ocultar de la tienda o eliminar. El stock se
  actualiza solo cuando alguien compra.
- **Recogida (mostrador):** el trabajador escribe el **codigo de recogida** que le muestra el
  cliente (o elige el pedido de la fila "Por recoger") y confirma la entrega. Si el pedido ya se
  pago en Mercado Pago solo lo entrega; si es "pagar al recoger" lo cobra ahi.
- **Pedidos**, **Categorias**, **Estadisticas** (el dashboard) y **Equipo** (alta de trabajadores).
- Todo se actualiza en vivo (**GraphQL Subscriptions** por WebSocket): pedido nuevo con aviso
  y sonido, pago aprobado, recogida. El cliente tambien ve su pedido cambiar solo.
- API GraphQL: `http://localhost:8000/graphql` (GraphiQL). Detalle en `back/README.md`.

## Estado de los datos

El backend guarda en SQLite (`back/gomitas.db`, se crea solo al arrancar con los
datos de prueba). `db.sql` tiene el mismo esquema para MySQL/MariaDB; basta con
cambiar `DATABASE_URL` en `back/.env` (ver `back/README.md`).
