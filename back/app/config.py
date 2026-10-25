# Tutorial FastAPI: "Settings and Environment Variables" (pydantic-settings).
# Todo lo configurable se lee de variables de entorno o del archivo .env.
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Carpeta back/, para que .env y la BD se encuentren sin importar desde donde se arranque.
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    # El personal (admin/trabajador) deja el backoffice abierto todo el turno en el mostrador,
    # asi que su sesion dura mas que la del cliente (12 horas).
    staff_token_expire_minutes: int = 720

    database_url: str = f"sqlite:///{BASE_DIR / 'gomitas.db'}"
    cors_origins: list[str] = ["http://localhost:5173"]
    # Carpeta donde se guardan las imagenes que sube el admin (se sirven en /uploads).
    uploads_dir: str = str(BASE_DIR / "uploads")

    seed_admin_email: str = "admin@gomitas.com"
    seed_admin_password: str = "admin12345"
    seed_cliente_email: str = "cliente@prueba.com"
    seed_cliente_password: str = "cliente12345"
    seed_trabajador_email: str = "trabajador@gomitas.com"
    seed_trabajador_password: str = "trabajador12345"
    # Pedidos de ejemplo (varios metodos y estados) para que el dashboard tenga datos.
    seed_pedidos_demo: bool = True

    # Mercado Pago (Checkout Pro). Sin access token el backend usa una pasarela
    # SIMULADA, para poder probar todo el flujo sin cuenta de Mercado Pago.
    mp_access_token: str = ""
    # Secreto de la seccion Webhooks del panel de MP, para validar x-signature.
    mp_webhook_secret: str = ""
    # URL publica (ngrok, deploy...) a la que MP manda las notificaciones. Vacio = sin webhook.
    mp_notification_url: str = ""
    # A donde regresa el comprador despues de pagar en Mercado Pago.
    # En Render, si no se configura FRONTEND_URL, se usa la direccion publica del servicio.
    frontend_url: str = Field(
        default="http://localhost:5173",
        validation_alias=AliasChoices("FRONTEND_URL", "RENDER_EXTERNAL_URL"),
    )
    # Las fechas se guardan en UTC; el dashboard agrupa por dia con este desfase
    # (Mexico centro es UTC-6 todo el año desde 2022).
    utc_offset_horas: int = -6

    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env")


@lru_cache
def get_settings() -> Settings:
    return Settings()
