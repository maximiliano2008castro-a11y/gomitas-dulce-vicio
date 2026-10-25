# Se carga antes que las pruebas: BD SQLite temporal (no toca gomitas.db), sin
# pedidos de ejemplo y sin Mercado Pago real (aunque tu .env tenga credenciales).
import os
import tempfile

# Llave solo para las pruebas, por si no existe back/.env (ej. recien descomprimido).
os.environ.setdefault("SECRET_KEY", "llave-solo-para-pruebas-" + "0" * 40)
os.environ["DATABASE_URL"] ="sqlite:///" + os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["SEED_PEDIDOS_DEMO"] = "false"
os.environ["MP_ACCESS_TOKEN"] = ""
os.environ["MP_WEBHOOK_SECRET"] = ""
os.environ["MP_NOTIFICATION_URL"] = ""
# Las imagenes que se suben en las pruebas van a una carpeta temporal.
os.environ["UPLOADS_DIR"] = tempfile.mkdtemp()
