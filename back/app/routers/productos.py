from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from ..database import SessionDep
from ..models import Categoria, DetallePedido, Producto, ProductoCreate, ProductoPublic, ProductoUpdate
from ..security import UsuarioAdmin

router = APIRouter(prefix="/productos", tags=["productos"])


def obtener_producto(session, producto_id: int) -> Producto:
    producto = session.get(Producto, producto_id)
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return producto


def validar_categoria(session, categoria_id: int):
    if not session.get(Categoria, categoria_id):
        raise HTTPException(status_code=400, detail=f"La categoria {categoria_id} no existe")


# ----- Lectura: publica -----

@router.get("", response_model=list[ProductoPublic])
def listar_productos(session: SessionDep, categoria_id: int | None = None):
    query = select(Producto).where(Producto.activo == True)  # noqa: E712 (SQL, no Python)
    if categoria_id is not None:
        query = query.where(Producto.categoria_id == categoria_id)
    return session.exec(query).all()


@router.get("/{producto_id}", response_model=ProductoPublic)
def leer_producto(producto_id: int, session: SessionDep):
    producto = obtener_producto(session, producto_id)
    if not producto.activo:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return producto


# ----- Escritura: requiere token con scope "admin" -----

@router.post("", response_model=ProductoPublic, status_code=status.HTTP_201_CREATED)
def crear_producto(datos: ProductoCreate, session: SessionDep, _admin: UsuarioAdmin):
    validar_categoria(session, datos.categoria_id)
    producto = Producto.model_validate(datos)
    session.add(producto)
    session.commit()
    session.refresh(producto)
    return producto


@router.patch("/{producto_id}", response_model=ProductoPublic)
def actualizar_producto(
    producto_id: int, datos: ProductoUpdate, session: SessionDep, _admin: UsuarioAdmin
):
    producto = obtener_producto(session, producto_id)
    cambios = datos.model_dump(exclude_unset=True)
    if "categoria_id" in cambios:
        validar_categoria(session, cambios["categoria_id"])
    producto.sqlmodel_update(cambios)
    session.add(producto)
    session.commit()
    session.refresh(producto)
    return producto


@router.delete("/{producto_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_producto(producto_id: int, session: SessionDep, _admin: UsuarioAdmin):
    producto = obtener_producto(session, producto_id)
    # Igual que ON DELETE RESTRICT en db.sql: no se borra si ya esta en algun pedido.
    en_pedidos = session.exec(
        select(DetallePedido).where(DetallePedido.producto_id == producto_id)
    ).first()
    if en_pedidos:
        raise HTTPException(
            status_code=409, detail="No se puede eliminar: el producto ya aparece en pedidos"
        )
    session.delete(producto)
    session.commit()
