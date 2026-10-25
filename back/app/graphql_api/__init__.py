# Backoffice GraphQL (Strawberry) montado dentro de FastAPI en /graphql.
from strawberry.fastapi import GraphQLRouter
from strawberry.subscriptions import GRAPHQL_TRANSPORT_WS_PROTOCOL, GRAPHQL_WS_PROTOCOL

from .permisos import obtener_contexto
from .schema import schema

graphql_router = GraphQLRouter(
    schema,
    context_getter=obtener_contexto,
    # "graphql-transport-ws" es el protocolo que habla la libreria graphql-ws del frontend.
    subscription_protocols=[GRAPHQL_TRANSPORT_WS_PROTOCOL, GRAPHQL_WS_PROTOCOL],
)
