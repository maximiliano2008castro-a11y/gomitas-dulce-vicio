# Tutorial FastAPI: "Security" -> "OAuth2 with Password (and hashing), Bearer with
# JWT tokens" y "Advanced Security" -> "OAuth2 scopes".
#
# Flujo (OAuth2 Password Flow):
#   1. El cliente manda email + password a POST /auth/token (form-data, como pide OAuth2).
#   2. Si son correctos, se regresa un JWT firmado con SECRET_KEY que dice quien es
#      (sub) y que puede hacer (scopes).
#   3. Cada peticion protegida manda "Authorization: Bearer <token>"; las dependencias
#      de aqui abajo lo validan y regresan al Cliente o responden 401/403.
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import OAuth2PasswordBearer, SecurityScopes
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from pydantic import ValidationError
from sqlmodel import Session, select

from .config import get_settings
from .database import SessionDep
from .models import Cliente, TokenData

settings = get_settings()

# Scopes = permisos que puede llevar un token.
SCOPES = {
    "pedidos": "Crear y consultar tus propios pedidos.",
    "trabajador": "Ver los pedidos de la tienda y confirmar recogidas en el mostrador.",
    "admin": "Administrar productos, pedidos y pagos; ver el dashboard.",
}

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token", scopes=SCOPES)

password_hash = PasswordHash.recommended()  # Argon2

# Hash de relleno: si el email no existe igual se verifica un hash, para que la
# respuesta tarde lo mismo y no se pueda adivinar que emails estan registrados.
DUMMY_HASH = password_hash.hash("dummy-password")


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hash.verify(plain_password, hashed_password)


def get_cliente_por_email(session: Session, email: str) -> Cliente | None:
    return session.exec(select(Cliente).where(Cliente.email == email)).first()


def authenticate_user(session: Session, email: str, password: str) -> Cliente | None:
    cliente = get_cliente_por_email(session, email)
    if not cliente:
        verify_password(password, DUMMY_HASH)
        return None
    if not verify_password(password, cliente.hashed_password):
        return None
    return cliente


def scopes_permitidos(cliente: Cliente) -> list[str]:
    # El admin puede hacer todo lo del trabajador; el trabajador no administra.
    if cliente.es_admin:
        return ["pedidos", "trabajador", "admin"]
    if cliente.es_trabajador:
        return ["pedidos", "trabajador"]
    return ["pedidos"]


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def validar_token(token: str, session: Session) -> tuple[Cliente, list[str]]:
    """Decodifica el JWT y regresa (cliente, scopes del token). Lo usan tanto las rutas
    REST como GraphQL. Si el token no sirve lanza 401."""
    error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        email = payload.get("sub")
        if email is None:
            raise error
        token_data = TokenData(email=email, scopes=payload.get("scopes", []))
    except (InvalidTokenError, ValidationError):
        raise error

    cliente = get_cliente_por_email(session, token_data.email)
    if cliente is None:
        raise error
    return cliente, token_data.scopes


async def get_current_user(
    security_scopes: SecurityScopes,
    token: Annotated[str, Depends(oauth2_scheme)],
    session: SessionDep,
) -> Cliente:
    if security_scopes.scopes:
        authenticate_value = f'Bearer scope="{security_scopes.scope_str}"'
    else:
        authenticate_value = "Bearer"

    try:
        cliente, scopes_token = validar_token(token, session)
    except HTTPException as e:
        e.headers = {"WWW-Authenticate": authenticate_value}
        raise

    for scope in security_scopes.scopes:
        if scope not in scopes_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para esta operacion",
                headers={"WWW-Authenticate": authenticate_value},
            )
    return cliente


async def get_current_active_user(
    current_user: Annotated[Cliente, Security(get_current_user)],
) -> Cliente:
    if current_user.disabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuario deshabilitado")
    return current_user


# Atajos listos para usar en los routers.
UsuarioActual = Annotated[Cliente, Security(get_current_active_user)]
UsuarioConPedidos = Annotated[Cliente, Security(get_current_active_user, scopes=["pedidos"])]
UsuarioTrabajador = Annotated[Cliente, Security(get_current_active_user, scopes=["trabajador"])]
UsuarioAdmin = Annotated[Cliente, Security(get_current_active_user, scopes=["admin"])]
