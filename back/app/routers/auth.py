from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from ..config import get_settings
from ..database import SessionDep
from ..models import Cliente, ClienteCreate, ClientePublic, Token
from ..security import (
    UsuarioActual,
    authenticate_user,
    create_access_token,
    get_cliente_por_email,
    hash_password,
    scopes_permitidos,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/registro", response_model=ClientePublic, status_code=status.HTTP_201_CREATED)
def registrar(datos: ClienteCreate, session: SessionDep):
    if get_cliente_por_email(session, datos.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ese email ya esta registrado")

    cliente = Cliente.model_validate(
        datos, update={"hashed_password": hash_password(datos.password)}
    )
    session.add(cliente)
    session.commit()
    session.refresh(cliente)
    return cliente


@router.post("/token")
def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: SessionDep,
) -> Token:
    # OAuth2 llama al campo "username"; aqui el username es el email.
    cliente = authenticate_user(session, form_data.username, form_data.password)
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Solo se otorgan los scopes que el usuario de verdad tiene. Si no pide
    # ninguno, recibe todos los suyos.
    permitidos = scopes_permitidos(cliente)
    pedidos = form_data.scopes or permitidos
    scopes = [s for s in pedidos if s in permitidos]

    es_personal = "trabajador" in scopes or "admin" in scopes
    vigencia = timedelta(minutes=get_settings().staff_token_expire_minutes) if es_personal else None
    access_token = create_access_token(data={"sub": cliente.email, "scopes": scopes}, expires_delta=vigencia)
    return Token(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=ClientePublic)
def leer_usuario_actual(current_user: UsuarioActual):
    return current_user
