# Imagen para publicar la tienda: un solo servidor con la API (FastAPI + GraphQL)
# y el frontend de React ya compilado.

# 1) Compilar el frontend (Vite pide Node 20.19 o mas)
FROM node:22-alpine AS front
WORKDIR /front
COPY front/package.json front/package-lock.json ./
RUN npm ci
COPY front/ ./
RUN npm run build

# 2) Backend (Strawberry pide Python 3.11 o mas)
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app/back
COPY back/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY back/ ./
COPY --from=front /front/dist /app/front/dist

# Render manda el puerto en la variable PORT. Un solo proceso, porque el bus de
# eventos de las subscriptions vive en memoria.
EXPOSE 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips="*"
