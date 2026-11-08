# One service for judges: the engine serves the built app and the API from one URL.
# Stage 1 builds the web app as a static site. Stage 2 runs the Python engine, which serves it.

FROM node:22-slim AS web
WORKDIR /web
RUN npm install -g bun
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build:static

FROM python:3.12-slim
WORKDIR /app
COPY . /app
COPY --from=web /web/dist/client /app/static
# The decision log lives on a volume mounted at /data so it survives a redeploy.
RUN mkdir -p /data
ENV STATIC_DIR=/app/static \
    DECISION_LOG=/data/decision_log.ndjson \
    HOST=0.0.0.0 \
    PYTHONUNBUFFERED=1
# PORT is set by the platform.
CMD ["python", "server.py"]
