# Tutorial FastAPI: "Bigger Applications - Multiple Files".
# Punto de entrada: crea la app, registra CORS y monta cada router.
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from .config import get_settings
from .database import create_db_and_tables, engine
from .graphql_api import graphql_router
from .routers import admin, auth, categorias, imagenes, pagos, pedidos, productos
from .routers.imagenes import carpeta_uploads
from .seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    with Session(engine) as session:
        seed(session)
    yield


app = FastAPI(
    title="Gomitas Dulce Vicio API",
    description="Backend del e-commerce de gomitas: REST + OAuth2 + JWT, pagos con Mercado Pago, dashboard y Backoffice GraphQL con Subscriptions (/graphql).",
    version="4.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(categorias.router)
app.include_router(productos.router)
app.include_router(pedidos.router)
app.include_router(pagos.router)
app.include_router(admin.router)
app.include_router(imagenes.router)
# GraphQL del backoffice: queries y mutations por HTTP, subscriptions por WebSocket (/graphql).
app.include_router(graphql_router, prefix="/graphql")

# Las imagenes subidas desde el backoffice se sirven como archivos estaticos.
app.mount("/uploads", StaticFiles(directory=carpeta_uploads()), name="uploads")


@app.get("/", tags=["salud"])
def raiz():
    return {"mensaje": "API de gomitas lista. Documentacion en /docs"}
