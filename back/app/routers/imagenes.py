# Subida de imagenes para productos y categorias (solo admin).
# El archivo se guarda en back/uploads/ con un nombre aleatorio y se sirve en /uploads/<nombre>
# (ver main.py). Al producto solo se le guarda esa ruta en su campo "imagen".
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, UploadFile, status

from ..config import get_settings
from ..security import UsuarioAdmin

router = APIRouter(prefix="/imagenes", tags=["imagenes"])

MAX_BYTES = 5 * 1024 * 1024  # 5 MB


def carpeta_uploads() -> Path:
    carpeta = Path(get_settings().uploads_dir)
    carpeta.mkdir(parents=True, exist_ok=True)
    return carpeta


def detectar_extension(contenido: bytes) -> str | None:
    """Mira los primeros bytes del archivo (no el nombre ni el content-type que manda el
    navegador, que se pueden falsificar) para saber si de verdad es una imagen."""
    if contenido.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if contenido.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if contenido.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if contenido[:4] == b"RIFF" and contenido[8:12] == b"WEBP":
        return ".webp"
    return None


@router.post("", status_code=status.HTTP_201_CREATED)
async def subir_imagen(archivo: UploadFile, _admin: UsuarioAdmin):
    contenido = await archivo.read(MAX_BYTES + 1)
    if len(contenido) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="La imagen pesa mas de 5 MB")
    extension = detectar_extension(contenido)
    if extension is None:
        raise HTTPException(status_code=415, detail="Solo se aceptan imagenes JPG, PNG, WEBP o GIF")

    nombre = f"{uuid4().hex}{extension}"
    (carpeta_uploads() / nombre).write_bytes(contenido)
    return {"url": f"/uploads/{nombre}"}
