# Como revisar el proyecto — Metodos de cobro + Backoffice GraphQL

E-commerce de gomitas (React + FastAPI + OAuth2) con **5 metodos de pago** integrados
con **Mercado Pago** y un **dashboard de estadisticas** para el administrador.

## Requisitos

- **Python 3.11 o superior** — https://www.python.org/downloads/ (al instalar, marcar
  *"Add python.exe to PATH"*).
- **Node.js 22 (LTS) o superior** — https://nodejs.org/
- Internet la primera vez (para instalar dependencias).

No se necesita base de datos ni cuenta de Mercado Pago: usa SQLite y, sin credenciales,
una **pasarela de pago simulada** (ver "Sobre Mercado Pago" abajo).

## Arrancarlo (Windows)

1. Descomprime el zip.
2. Doble clic en **`INICIAR.bat`**. La primera vez tarda 1–2 minutos instalando.
3. Se abren dos ventanas (Backend y Frontend) y el navegador en http://localhost:5173

Para correr las **pruebas automaticas**: doble clic en **`PROBAR.bat`** (deben salir
`10 passed`).

<details>
<summary>Mac / Linux, o si prefieres hacerlo a mano</summary>

```bash
# Terminal 1 - backend
cd back
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # Windows: copy .env.example .env
fastapi dev app/main.py

# Terminal 2 - frontend
cd front
npm install
npm run dev

# Pruebas (desde back/, con el entorno activado)
pytest -v
```
</details>

## Usuarios de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Administrador (**Backoffice** completo) | `admin@gomitas.com` | `admin12345` |
| Trabajador (mostrador) | `trabajador@gomitas.com` | `trabajador12345` |
| Cliente | `cliente@prueba.com` | `cliente12345` |

Tambien se puede crear una cuenta nueva desde "Iniciar sesion → Registrate".

## Que revisar (lista de comprobacion)

**Compra y metodos de pago** (entrar como cliente):

- [ ] Agregar productos al carrito → **Ir a checkout** → aparecen los 5 metodos:
      tarjeta de credito, tarjeta de debito, efectivo en tienda (OXXO), link de pago y
      pagar al recoger.
- [ ] **Tarjeta de credito**: "Simular tarjeta rechazada" → el pago queda *Rechazado* y
      se puede reintentar → "Pagar" → *Aprobado* y el pedido *Pagado*.
- [ ] **Efectivo en tienda**: "Generar ficha de pago" → aparece la ficha con referencia
      (pago *Pendiente*) → "Simular que ya pague en OXXO" → *Aprobado*.
- [ ] **Link de pago**: muestra un link para copiar/compartir.
- [ ] **Pagar al recoger**: el pedido queda *apartado*, sin pasarela.
- [ ] **Mis pedidos**: lista con el estado de cada pago; un pedido sin pagar se puede
      **cambiar de metodo** o **cancelar** (el stock regresa).

**Backoffice en vivo** (la mejor forma de verlo: abre **3 ventanas** — admin, trabajador y cliente):

- [ ] **Admin → Productos → + Nuevo producto**: nombre, descripcion, precio, stock, categoria y
      **foto** (arrastrar una imagen). Aparece en la lista y, en la tienda, en su categoria.
- [ ] **Editar** el producto: cambiar la descripcion/precio/foto y guardar; en la tienda se ve el cambio.
- [ ] Interruptor **En tienda** apagado: el producto desaparece de la tienda (no se borra).
      +/− cambia el stock; **Eliminar** (si ya se vendio, pide ocultarlo).
- [ ] **Cliente**: comprar con **Pagar al recoger** (o con tarjeta/Mercado Pago simulado y *Aprobar*).
      Le aparece un **ticket con su codigo de recogida** (6 caracteres).
- [ ] **Trabajador → Recogida**: el pedido aparece **solo, sin recargar** (aviso + sonido). Escribir el
      codigo del cliente → **Confirmar recogida** (o **Cobrar y entregar** si era pagar al recoger).
- [ ] Un pedido de tarjeta/OXXO **sin pagar** no se puede entregar; en cuanto se aprueba el pago,
      aparece en "Por recoger".
- [ ] La pantalla del **cliente** cambia sola a *Entregado*. El **admin** ve el movimiento en
      "Actividad en vivo" y el stock bajar en Productos.
- [ ] **Equipo** (admin): crear un trabajador nuevo y entrar con el. El trabajador **no** ve
      Productos, Categorias ni dinero.
- [ ] (Opcional) GraphiQL en http://localhost:8000/graphql para probar queries y mutations a mano
      (token en la pestaña *Headers*: `{"Authorization": "Bearer ..."}`).

**Dashboard** (admin → Backoffice → **Estadisticas**):

- [ ] Numeros principales: ingresos, pedidos, tasa de aprobacion, ticket promedio, por cobrar.
- [ ] **Pagos por metodo**: cuantos pagos hubo con cada metodo y cuantos se aprobaron,
      quedaron pendientes, se rechazaron o cancelaron (pasar el mouse para ver el detalle;
      "Ver como tabla" muestra los numeros).
- [ ] Estado de pagos y de pedidos, ingresos por dia, pagos por marca (Visa, Mastercard,
      OXXO...) y productos mas vendidos.
- [ ] Filtro de periodo: 7 / 30 / 90 dias / Todo.
- [ ] Tabla de pedidos con filtros y acciones (Entregar, Cobrar y entregar, Marcar pagado,
      Cancelar). Despues de una accion las estadisticas se actualizan.
- [ ] Un pedido hecho como cliente aparece en el dashboard.

Al arrancar por primera vez el backend crea **~70 pedidos de ejemplo** de los ultimos
30 dias para que el dashboard tenga datos.

**API**: http://localhost:8000/docs (Swagger). Boton **Authorize** para iniciar sesion
y probar los endpoints de `pagos` y `admin`.

## Sobre Mercado Pago

La integracion real con Mercado Pago Checkout Pro esta programada en
`back/app/mercadopago.py` (preferencias, consulta de pagos y webhook con firma), y se
prueba con la API de Mercado Pago simulada en `back/tests/test_pagos.py`.

Para usar el sandbox real de Mercado Pago basta con poner un *Access Token de prueba*
en `back/.env` (`MP_ACCESS_TOKEN=TEST-...`) y reiniciar el backend; los pasos estan en
`back/README.md`. Sin token, el sistema usa la pasarela simulada y lo indica en
pantalla ("Modo demo").

## Documentacion

- `reporte-pagos.md` — diseño de los pagos, DER, maquina de estados, flujo con Mercado
  Pago, seguridad, dashboard y pruebas (con capturas en `assets/`).
- `reporte-p6.md`, `reporte-p2.md` — backend REST/OAuth2 y frontend (practicas anteriores).
- `back/README.md` — endpoints y configuracion.
- `db.sql` — esquema para MySQL/MariaDB.

## Si algo falla

- **"No se encontro Python / Node"**: instalarlo y volver a abrir `INICIAR.bat`.
- **El puerto 8000 o 5173 esta ocupado**: cerrar otras ventanas de servidores y reintentar.
- **Empezar con datos limpios**: cerrar las ventanas, borrar `back/gomitas.db` y volver a
  iniciar.
