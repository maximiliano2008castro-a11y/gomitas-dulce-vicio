# Bus de eventos en memoria: lo que alimenta las Subscriptions de GraphQL.
#
# Cuando algo cambia (pedido nuevo, pago aprobado, pedido recogido, stock...), el codigo
# que lo cambio llama a publicar_pedido() / publicar_productos(). Cada subscription abierta
# (cada pestaña del backoffice) tiene su propia cola y recibe una copia del evento.
#
# Solo se manda el id de lo que cambio: la subscription vuelve a leer la BD, asi siempre
# entrega datos frescos. Limite: es memoria de UN proceso; con varios workers de uvicorn
# habria que cambiarlo por Redis pub/sub (ver reporte-backoffice.md).
import asyncio
from collections.abc import AsyncIterator

from .models import EstadoPedido, Pedido


class BusDeEventos:
    def __init__(self):
        # Cada suscriptor = (event loop donde corre, su cola).
        self._suscriptores: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = set()

    async def escuchar(self) -> AsyncIterator[dict]:
        loop = asyncio.get_running_loop()
        cola: asyncio.Queue = asyncio.Queue(maxsize=200)
        suscriptor = (loop, cola)
        self._suscriptores.add(suscriptor)
        try:
            while True:
                yield await cola.get()
        finally:
            # Se ejecuta cuando el cliente cierra la subscription o se cae el websocket.
            self._suscriptores.discard(suscriptor)

    def publicar(self, evento: dict) -> None:
        # Las rutas REST normales corren en otro hilo que el websocket, por eso se usa
        # call_soon_threadsafe en vez de tocar la cola directamente.
        for loop, cola in list(self._suscriptores):
            try:
                loop.call_soon_threadsafe(self._meter, cola, evento)
            except RuntimeError:
                self._suscriptores.discard((loop, cola))  # el loop ya se cerro

    @staticmethod
    def _meter(cola: asyncio.Queue, evento: dict) -> None:
        try:
            cola.put_nowait(evento)
        except asyncio.QueueFull:
            pass  # suscriptor muy lento: se descarta el evento en vez de frenar a todos


bus = BusDeEventos()


def tipo_de_pedido(pedido: Pedido) -> str:
    return {
        EstadoPedido.entregado: "ENTREGADO",
        EstadoPedido.cancelado: "CANCELADO",
        EstadoPedido.pagado: "PAGADO",
    }.get(pedido.estado, "ACTUALIZADO")


def publicar_productos(ids: list[int], tipo: str = "ACTUALIZADO") -> None:
    for producto_id in set(ids):
        bus.publicar({"canal": "producto", "tipo": tipo, "producto_id": producto_id})


def publicar_pedido(pedido: Pedido, tipo: str | None = None) -> None:
    """Avisa que un pedido cambio. Si se crea o se cancela tambien cambio el stock."""
    tipo = tipo or tipo_de_pedido(pedido)
    bus.publicar(
        {"canal": "pedido", "tipo": tipo, "pedido_id": pedido.id, "cliente_id": pedido.cliente_id}
    )
    if tipo in ("NUEVO", "CANCELADO"):
        publicar_productos([d.producto_id for d in pedido.items])
