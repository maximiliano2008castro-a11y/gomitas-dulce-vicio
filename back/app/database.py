# Tutorial FastAPI: "SQL (Relational) Databases" con SQLModel.
from typing import Annotated

from fastapi import Depends
from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from .config import get_settings

settings = get_settings()

# check_same_thread solo aplica a SQLite: FastAPI puede atender una misma
# peticion en varios hilos y SQLite por defecto lo prohibe.
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)


# Columnas que se agregaron despues de la primera version. create_all() no modifica
# tablas que ya existen, asi que si alguien trae un gomitas.db viejo se las agregamos aqui.
COLUMNAS_NUEVAS = {
    "cliente": {"es_trabajador": "BOOLEAN NOT NULL DEFAULT 0"},
    "producto": {"activo": "BOOLEAN NOT NULL DEFAULT 1"},
    "pedido": {
        "codigo_recogida": "VARCHAR(8)",
        "fecha_entrega": "DATETIME",
        "entregado_por": "VARCHAR(120)",
    },
}


def agregar_columnas_faltantes():
    inspector = inspect(engine)
    with engine.begin() as conexion:
        for tabla, columnas in COLUMNAS_NUEVAS.items():
            if not inspector.has_table(tabla):
                continue
            existentes = {c["name"] for c in inspector.get_columns(tabla)}
            for nombre, definicion in columnas.items():
                if nombre not in existentes:
                    conexion.execute(text(f"ALTER TABLE {tabla} ADD COLUMN {nombre} {definicion}"))


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    agregar_columnas_faltantes()


def get_session():
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
