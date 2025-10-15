# Sustained Sync API — Deployment & Testing Guide

This folder contains the Django backend, the Vite frontend, and instructions to deploy and test the application locally using Docker Compose.

### Quickstart (local development)

1. Copy the `.env` file and fill real values (do not commit it):

```bash
cp .env .env.local
# edit .env.local with secure values
```

2. Start the stack:

```bash
cd SustainSync
docker compose up -d --build
```

3. Watch backend logs:

```bash
docker compose logs -f web
```

4. Open the frontend: http://localhost:3000
   Django admin: http://localhost:8000/admin/

### Verify

- Count endpoint:

```bash
curl http://localhost:8000/api/count/
```

### Optional ML/RAG

See `SustainSync/backend/requirements-ml.txt` if you want to enable heavy ML dependencies.

---

For more details, see the top-level README.
