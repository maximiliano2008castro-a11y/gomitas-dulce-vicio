from fastapi import APIRouter, HTTPException
from sqlmodel import select

from ..database import SessionDep
from ..models import Categoria, CategoriaConProductos, CategoriaPublic, ProductoPublic

router = APIRouter(prefix="/categorias", tags=["categorias"])


@router.get("", response_model=list[CategoriaPublic])
def listar_categorias(session: SessionDep):
    return session.exec(select(Categoria)).all()


@router.get("/{categoria_id}", response_model=CategoriaConProductos)
def leer_categoria(categoria_id: int, session: SessionDep):
    categoria = session.get(Categoria, categoria_id)
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria no encontrada")
    # La tienda solo muestra los productos activos (el backoffice puede ocultar productos).
    productos = [ProductoPublic.model_validate(p) for p in categoria.productos if p.activo]
    return CategoriaConProductos(**categoria.model_dump(), productos=productos)
