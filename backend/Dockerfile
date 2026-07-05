# Python 3.12 — Cognee's dependency wheels (torch, tokenizers, lancedb, …) are not all
# available for 3.14, so we pin the runtime the build is known to resolve on.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# build-essential covers any dependency that falls back to a source build.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Cognee persists its graph / vector / relational stores under these roots. On Render,
# mount a persistent disk at /data so the graph you build survives across requests and
# redeploys. These override cognee's ephemeral in-container defaults.
ENV DATA_ROOT_DIRECTORY=/data/.data_storage \
    SYSTEM_ROOT_DIRECTORY=/data/.cognee_system \
    CACHE_ROOT_DIRECTORY=/data/.cognee_cache \
    COGNEE_LOGS_DIR=/data/.cognee_logs

EXPOSE 8000

# $PORT is injected by the host; default to 8000 for local `docker run`.
# Ensure the persistent-disk subdirs exist before Cognee touches them.
CMD ["sh", "-c", "mkdir -p \"$DATA_ROOT_DIRECTORY\" \"$SYSTEM_ROOT_DIRECTORY\" \"$CACHE_ROOT_DIRECTORY\" \"$COGNEE_LOGS_DIR\" && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
