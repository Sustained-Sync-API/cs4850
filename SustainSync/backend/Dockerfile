FROM python:3.11-slim

ARG OLLAMA_URL=""
WORKDIR /app

# Install system deps (libpq for psycopg2 and small tooling for downloading ollama if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential \
  libpq-dev \
  postgresql-client \
  curl \
  ca-certificates \
  tar \
 && rm -rf /var/lib/apt/lists/*

# Copy correct requirements file from backend folder and install
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Install a stable numpy <2 to avoid binary incompatibilities with faiss wheels,
# then install optional ML requirements (faiss, torch, etc.) if present.
COPY backend/requirements-ml.txt /app/requirements-ml.txt
RUN pip install --no-cache-dir "numpy<2" || true
RUN pip install --no-cache-dir -r /app/requirements-ml.txt || true

# Install Python client for Ollama (optional; harmless if package not used)
RUN pip install --no-cache-dir ollama || true

# If build-arg OLLAMA_URL is provided, attempt to download a tarball and
# extract a binary named `ollama`. Otherwise, try a conservative default
# location for the Linux x86_64 binary. Do not fail the build if this
# download/extract step doesn't work (keeps CI/dev workflow flexible).
RUN mkdir -p /tmp/ollama || true
RUN set -eux; \
    if [ -n "$OLLAMA_URL" ]; then \
      curl -fsSL "$OLLAMA_URL" -o /tmp/ollama/ollama.tar.gz || true; \
    else \
      # Try a likely official asset URL (may fail if not present or different arch)
      DEFAULT_URL="https://github.com/ollama/ollama/releases/latest/download/ollama-linux-x86_64.tar.gz"; \
      curl -fsSL "$DEFAULT_URL" -o /tmp/ollama/ollama.tar.gz || true; \
    fi; \
    tar -xzf /tmp/ollama/ollama.tar.gz -C /tmp/ollama 2>/dev/null || true; \
    if [ -f /tmp/ollama/ollama ]; then cp /tmp/ollama/ollama /usr/local/bin/ollama; fi || true

# Copy repo into image (so backend/ etc are available) and copy entrypoint to /app
COPY . /app
COPY backend/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Expose default Ollama port in case it's run inside the container
EXPOSE 11434

CMD ["/bin/bash", "/app/entrypoint.sh"]
