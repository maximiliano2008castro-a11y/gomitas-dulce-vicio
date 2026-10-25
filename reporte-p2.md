# Reporte P2 — Flujo E-commerce con sesion OAuth2 (Frontend)

## Descripcion general

Frontend en **React + Vite** para el e-commerce de gomitas, ahora conectado a la
**API REST en FastAPI** (antes GraphQL) y con **inicio de sesion OAuth2**. El recorrido
`Home → Categoria → Detalle de producto → Carrito → Login/Registro → Checkout` se sigue
controlando 100% con **estado local (`useState`) y eventos** dentro de `App.jsx` — sin
`react-router` ni URLs. `App.jsx` es una maquina de estados con 5 vistas (`home`,
`categoria`, `carrito`, `login`, `checkout`); el detalle de producto sigue siendo un
**modal** (via portal).

**Checkout es una vista protegida:** el catalogo y el carrito son publicos, pero para
confirmar un pedido se necesita sesion. Si no la hay, `App` muestra `LoginView` y al
entrar regresa automaticamente al checkout.

## Cambios respecto a la version GraphQL

| Antes (GraphQL) | Ahora (REST + OAuth2) |
|---|---|
| `api/client.js` → `graphqlRequest(query, variables)` a un solo endpoint | `api/client.js` → `apiRequest(path, opciones)` + objeto `API` con un metodo por endpoint |
| Hook `useGraphQL(query, variables)` | Hook `useApi(peticion, deps)` (generico, recibe cualquier promesa) |
| Checkout pedia nombre y email en un formulario | El cliente sale del token; checkout muestra "Pedido a nombre de ..." |
| Sin sesion | `useAuthStore` (Zustand + `persist`) guarda `token` y `usuario` |
| 4 vistas | 5 vistas: se agrega `LoginView` (login y registro en una sola vista) |
| `TopBar` solo con carrito | `TopBar` muestra "Hola, {nombre}" + **Salir**, o **Iniciar sesion** |

## Temas de React aplicados (11 de 15 requeridos: minimo 8)

| # | Tema | Donde |
|---|------|-------|
| 1 | Componentes / composicion | `TopBar`, `Sidebar`, `Hero`, `ContextSection`, `Footer`, `ProductCard`, `CategoryCard`, `LoginView` |
| 2 | Hooks (`useState`, `useEffect`, hook propio) | `useApi` (fetch con loading/error/data), `ProductModal` (Esc listener), `App` (vista actual y destino tras login) |
| 3 | Padre → hijos (props) | `App` pasa `categorias`, `usuario`, callbacks y `cart` a las vistas |
| 4/5 | Eventos HTML y eventos custom | `onClick`, `onChange`, `onSubmit` nativos + props `onSeleccionarCategoria`, `onAgregarCarrito`, `onIniciarSesion`, `onCerrarSesion`, `onExito` |
| 6 | Listas y keys | `Sidebar`, grids de `ProductCard`, `CartView` (`key={id}`) |
| 7 | Fragment | `ProductCard` y los campos condicionales de `LoginView` / `TopBar` |
| 8 | Estilizacion (2 formas) | `ContextSection` combina `className` y `style={}` inline |
| 9 | Zustand (estado global) | `useCartStore` (carrito) y `useAuthStore` (sesion), ambos con `persist` → `localStorage` |
| 10 | Skeletons | `Skeleton.jsx` mientras `CategoryView` espera el fetch |
| 11 | Portales | `ProductModal` con `createPortal(..., document.body)`, `Esc` para cerrar, `aria-modal` |

## Arquitectura de componentes (UML)

```mermaid
graph TD
  App[App.jsx<br/>maquina de estados]

  App --> TopBar
  App --> Sidebar
  App --> HomeView
  App --> CategoryView
  App --> CartView
  App --> LoginView
  App --> CheckoutView
  App --> Footer

  HomeView --> Hero
  HomeView --> ContextSection
  HomeView --> CategoryCard

  CategoryView --> ProductCard
  CategoryView --> ProductModal
  CategoryView --> ProductGridSkeleton

  ProductGridSkeleton --> ProductCardSkeleton

  App -.usa.-> useCartStore[(useCartStore - Zustand)]
  App -.usa.-> useAuthStore[(useAuthStore - Zustand)]
  LoginView -.usa.-> useAuthStore
  CheckoutView -.usa.-> useAuthStore
  HomeView -.usa.-> useApi[[useApi hook]]
  CategoryView -.usa.-> useApi
  LoginView -.usa.-> apiClient[[api/client.js]]
  CheckoutView -.usa.-> apiClient
  useApi -.usa.-> apiClient
  apiClient -.lee token.-> useAuthStore
  apiClient -.HTTP + Bearer.-> Backend[(API REST FastAPI)]
  useCartStore -.persist.-> LocalStorage[(localStorage)]
  useAuthStore -.persist.-> LocalStorage
```

## Maquina de estados de navegacion

```mermaid
stateDiagram-v2
  [*] --> Home
  Home --> Categoria: click categoria (Sidebar / CategoryCard)
  Categoria --> Home: "Volver a categorias"
  Categoria --> Categoria: abre ProductModal (detalle producto)
  Home --> Carrito: click icono carrito
  Categoria --> Carrito: click icono carrito
  Carrito --> Categoria: "Seguir comprando"
  Carrito --> Checkout: "Ir a checkout" (con sesion)
  Carrito --> Login: "Ir a checkout" (sin sesion)
  Home --> Login: "Iniciar sesion"
  Login --> Checkout: login/registro OK (venia del carrito)
  Login --> Home: login OK (venia de Home)
  Login --> Carrito: "Volver"
  Checkout --> Login: token vencido (401)
  Checkout --> Carrito: "Volver al carrito"
  Checkout --> Home: pedido confirmado -> "Volver al inicio"
```

## Flujo de autenticacion en el frontend

```mermaid
sequenceDiagram
  actor U as Usuario
  participant L as LoginView
  participant C as api/client.js
  participant S as useAuthStore
  participant B as API FastAPI

  U->>L: email + contraseña (o registro)
  opt Modo registro
    L->>C: API.registro({nombre, email, password})
    C->>B: POST /auth/registro (JSON)
    B-->>C: 201 Cliente
  end
  L->>C: API.login(email, password)
  C->>B: POST /auth/token (form-data username/password)
  B-->>C: { access_token, token_type: "bearer" }
  L->>S: iniciarSesion(token, null)
  L->>C: API.yo()
  C->>B: GET /auth/me + Authorization: Bearer
  B-->>C: { id, nombre, email, es_admin }
  L->>S: iniciarSesion(token, usuario)
  L-->>U: regresa al checkout
```

## Flujo de datos

1. `HomeView` y `CategoryView` usan `useApi` para pedir `GET /categorias` y
   `GET /categorias/{id}` (loading/error/data). Estas rutas son publicas.
2. Al agregar un producto desde el modal, `ProductModal` llama a `onAgregar`, que viene
   de `App` → `useCartStore.agregarProducto` (Zustand).
3. `apiRequest` lee el token de `useAuthStore` en cada peticion y, si existe, agrega el
   header `Authorization: Bearer <token>`. El login se manda como **form-data**
   (`URLSearchParams`), que es lo que exige OAuth2; el resto como JSON.
4. `CheckoutView` manda solo los items (`[{ producto_id, cantidad }]`) a
   `POST /pedidos`; el backend sabe quien es el cliente por el token. Si confirma, se
   vacia el carrito y se muestra la confirmacion.
5. Si cualquier respuesta es **401** con un token guardado (vencido o invalido),
   `apiRequest` llama a `cerrarSesion()`; como `App` deriva la vista
   (`checkout` sin usuario → `login`), el usuario vuelve a ver el login sin perder el carrito.
6. Los errores de FastAPI (`{ detail: "..." }` o la lista de errores de validacion) se
   convierten a un mensaje legible y se muestran en la vista.

## Capturas

| | |
|---|---|
| ![Home](assets/01-home.png) Home: categorias desde `GET /categorias` | ![Categoria](assets/02-categoria.png) Categoria con sus productos |
| ![Modal](assets/03-modal-producto.png) Detalle de producto (portal) | ![Carrito](assets/04-carrito.png) Carrito (Zustand + localStorage) |
| ![Login requerido](assets/05-login-requerido.png) Checkout sin sesion → login | ![Registro](assets/06-registro.png) Modo registro |
| ![Checkout](assets/07-checkout-autenticado.png) Checkout con sesion: el cliente sale del token | ![Confirmacion](assets/08-confirmacion.png) Pedido confirmado por `POST /pedidos` |
