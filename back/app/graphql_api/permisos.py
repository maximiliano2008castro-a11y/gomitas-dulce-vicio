# Autenticacion de GraphQL: reutiliza el mismo JWT de OAuth2 que las rutas REST.
#   - Queries y mutations (HTTP):   header  Authorization: Bearer <token>
#   - Subscriptions (WebSocket):    el navegador no puede mandar headers en un WebSocket, asi que
#                                   el token viaja en el mensaje connection_init ("connectionParams").
from dataclasses import dataclass

from fastapi import HTTPException
from sqlmodel import Session
from strawberry.fastapi import BaseContext
from strawberry.permission import BasePermission
from strawberry.types import Info

from ..database import engine
from ..security import validar_token


@dataclass
class UsuarioGQL:
    id: int
    nombre: str
    es_admin: bool
    es_trabajador: bool


class ContextoGQL(BaseContext):
    usuario: UsuarioGQL | None = None


def obtener_contexto() -> ContextoGQL:
    return ContextoGQL()


def _token_de(info: Info) -> str | None:
    contexto = info.context
    encabezado = None
    if isinstance(contexto.connection_params, dict):  # WebSocket
        params = contexto.connection_params
        encabezado = params.get("Authorization") or params.get("authorization")
    if not encabezado and contexto.request is not None:  # HTTP
        encabezado = contexto.request.headers.get("authorization")
    if encabezado and encabezado.lower().startswith("bearer "):
        return encabezado[7:].strip()
    return None


class PermisoBase(BasePermission):
    message = "Necesitas iniciar sesion"
    scope: str | None = None  # scope que debe traer el token; None = cualquier usuario con sesion

    def has_permission(self, source, info: Info, **kwargs) -> bool:
        token = _token_de(info)
        if not token:
            return False
        with Session(engine) as session:
            try:
                cliente, scopes = validar_token(token, session)
            except HTTPException:
                self.message = "Sesion invalida o vencida: vuelve a iniciar sesion"
                return False
            if cliente.disabled:
                self.message = "Usuario deshabilitado"
                return False
            if self.scope and self.scope not in scopes:
                self.message = "No tienes permiso para esta operacion"
                return False
            info.context.usuario = UsuarioGQL(
                id=cliente.id, nombre=cliente.nombre,
                es_admin=cliente.es_admin and "admin" in scopes,
                es_trabajador=cliente.es_trabajador or cliente.es_admin,
            )
        return True


class EsUsuario(PermisoBase):
    scope = "pedidos"


class EsPersonal(PermisoBase):
    """Admin o trabajador de mostrador."""
    scope = "trabajador"


class EsAdmin(PermisoBase):
    scope = "admin"
