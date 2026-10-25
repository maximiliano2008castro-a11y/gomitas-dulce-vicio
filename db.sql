-- ============================================================
-- db.sql — Gomitas E-commerce (Practica P2-6)
-- ============================================================
-- Esquema SQL que corresponde 1 a 1 con los modelos SQLModel del
-- backend FastAPI (ver back/app/models.py y reporte-p6.md). Por
-- defecto el backend crea solo estas tablas en SQLite; este script
-- es para usar MySQL/MariaDB (DATABASE_URL en back/.env).
-- Compatible tambien con PostgreSQL cambiando AUTO_INCREMENT por
-- SERIAL / GENERATED ALWAYS AS IDENTITY.
-- ============================================================

CREATE DATABASE IF NOT EXISTS gomitas_ecommerce
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE gomitas_ecommerce;

-- ------------------------------------------------------------
-- Categoria
-- ------------------------------------------------------------
CREATE TABLE categoria (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(80) NOT NULL,
  descripcion VARCHAR(255) NOT NULL,
  imagen      VARCHAR(500) NOT NULL
);

-- ------------------------------------------------------------
-- Producto (N:1 con Categoria)
-- ------------------------------------------------------------
CREATE TABLE producto (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  nombre       VARCHAR(120) NOT NULL,
  descripcion  VARCHAR(255) NOT NULL,
  precio       DECIMAL(10, 2) NOT NULL CHECK (precio >= 0),
  stock        INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  imagen       VARCHAR(500) NOT NULL,          -- URL, o /uploads/<archivo> si se subio desde el backoffice
  categoria_id INT NOT NULL,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE = oculto en la tienda (backoffice)
  CONSTRAINT fk_producto_categoria
    FOREIGN KEY (categoria_id) REFERENCES categoria(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ------------------------------------------------------------
-- Cliente
-- ------------------------------------------------------------
-- Tambien es el usuario que inicia sesion (OAuth2). La contraseña
-- se guarda como hash Argon2, nunca en texto plano.
CREATE TABLE cliente (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  nombre          VARCHAR(120) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  hashed_password VARCHAR(255) NOT NULL,
  es_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  es_trabajador   BOOLEAN NOT NULL DEFAULT FALSE,  -- trabajador de mostrador (confirma recogidas)
  disabled        BOOLEAN NOT NULL DEFAULT FALSE
);

-- ------------------------------------------------------------
-- Pedido (N:1 con Cliente)
-- ------------------------------------------------------------
CREATE TABLE pedido (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  fecha      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- pendiente_pago | pagado | entregado | cancelado
  estado     VARCHAR(30) NOT NULL DEFAULT 'pendiente_pago',
  total      DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
  cliente_id INT NOT NULL,
  codigo_recogida VARCHAR(8),                 -- codigo que el cliente muestra en el mostrador
  fecha_entrega   DATETIME,                   -- cuando el trabajador confirmo la recogida
  entregado_por   VARCHAR(120),               -- nombre del trabajador que la confirmo
  CONSTRAINT fk_pedido_cliente
    FOREIGN KEY (cliente_id) REFERENCES cliente(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ------------------------------------------------------------
-- DetallePedido (N:1 con Pedido, N:1 con Producto)
-- ------------------------------------------------------------
CREATE TABLE detalle_pedido (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id        INT NOT NULL,
  producto_id      INT NOT NULL,
  cantidad         INT NOT NULL CHECK (cantidad > 0),
  precio_unitario  DECIMAL(10, 2) NOT NULL CHECK (precio_unitario >= 0),
  CONSTRAINT fk_detalle_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedido(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_detalle_producto
    FOREIGN KEY (producto_id) REFERENCES producto(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ------------------------------------------------------------
-- Pago (1:1 con Pedido) — metodo de pago y lo que reporta Mercado Pago
-- ------------------------------------------------------------
CREATE TABLE pago (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id         INT NOT NULL UNIQUE,
  metodo            ENUM('tarjeta_credito', 'tarjeta_debito', 'oxxo', 'link_pago', 'pickup') NOT NULL,
  estado            ENUM('pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado') NOT NULL DEFAULT 'pendiente',
  monto             DECIMAL(10, 2) NOT NULL CHECK (monto >= 0),
  proveedor         VARCHAR(20) NOT NULL,            -- mercadopago | simulado | tienda
  mp_preference_id  VARCHAR(80),
  mp_payment_id     VARCHAR(40),
  mp_tipo           VARCHAR(30),                     -- credit_card, debit_card, ticket...
  mp_medio          VARCHAR(30),                     -- visa, master, oxxo...
  detalle           VARCHAR(120),
  url_pago          VARCHAR(500),
  url_ficha         VARCHAR(500),
  creado            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pago_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedido(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_pago_metodo ON pago(metodo);
CREATE INDEX idx_pago_estado ON pago(estado);
CREATE INDEX idx_producto_categoria ON producto(categoria_id);
CREATE INDEX idx_pedido_cliente ON pedido(cliente_id);
CREATE INDEX idx_pedido_codigo ON pedido(codigo_recogida);
CREATE INDEX idx_detalle_pedido ON detalle_pedido(pedido_id);
CREATE INDEX idx_detalle_producto ON detalle_pedido(producto_id);

-- ============================================================
-- Datos de prueba (los mismos que back/app/seed.py)
-- ============================================================

INSERT INTO categoria (id, nombre, descripcion, imagen) VALUES
  (1, 'Acidas',   'Gomitas con cobertura acida',      'https://placehold.co/400x300/f97316/ffffff?text=Acidas'),
  (2, 'Clasicas', 'Los sabores de toda la vida',       'https://placehold.co/400x300/eab308/ffffff?text=Clasicas'),
  (3, 'Rellenas', 'Gomitas con relleno liquido',       'https://placehold.co/400x300/ec4899/ffffff?text=Rellenas'),
  (4, 'Veganas',  'Sin gelatina animal',               'https://placehold.co/400x300/22c55e/ffffff?text=Veganas');

INSERT INTO producto (id, nombre, descripcion, precio, stock, imagen, categoria_id) VALUES  -- activo = TRUE por defecto
  (1, 'Aros Acidos',        'Aros de gomita con azucar acida',              35, 40, 'https://placehold.co/400x300/f97316/ffffff?text=Aros+Acidos', 1),
  (2, 'Botellitas Acidas',  'Mini botellas de gomita sabor cola',           30, 25, 'https://placehold.co/400x300/f97316/ffffff?text=Botellitas', 1),
  (3, 'Ositos Clasicos',    'Ositos de gomita surtidos',                    25, 60, 'https://placehold.co/400x300/eab308/ffffff?text=Ositos', 2),
  (4, 'Aros de Frutas',     'Aros de gomita sabor frutal',                  28, 50, 'https://placehold.co/400x300/eab308/ffffff?text=Aros+Frutas', 2),
  (5, 'Fresas Rellenas',    'Gomitas de fresa con relleno de chocolate',    45, 15, 'https://placehold.co/400x300/ec4899/ffffff?text=Fresas', 3),
  (6, 'Sandias Rellenas',   'Gomitas de sandia con relleno acido',          45,  0, 'https://placehold.co/400x300/ec4899/ffffff?text=Sandias', 3),
  (7, 'Gomitas Veganas Mix','Mezcla de sabores sin gelatina animal',        50, 20, 'https://placehold.co/400x300/22c55e/ffffff?text=Veganas+Mix', 4);

-- Los usuarios (admin y cliente de prueba) NO se insertan aqui: sus
-- contraseñas necesitan hash Argon2, asi que los crea el backend al
-- arrancar (back/app/seed.py) con los datos de SEED_* en back/.env.
