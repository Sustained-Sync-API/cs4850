SustainSync - Docker + Postgres quickstart

This repository includes a Docker Compose setup that starts a Postgres database and a Django container that will run migrations and import bills from the provided CSV.

Quick start

1. From the `SustainSync` folder run:

```bash
docker compose up --build
```

2. The first run will:
   - start Postgres
   - build the Django image
   - run migrations
    - import a CSV into the `Bill` model (idempotent). The import script looks in the container at `/app/data` for `bills.csv` or `billdata.csv`, or you can set the `BILLS_CSV` env var to point to a specific file.
   - start the Django development server on http://localhost:8000

Notes

- The Compose file mounts the repository `./data` folder into the container at `/app/data` so place your CSV there (repo-root `data/billdata.csv` or `SustainSync/backend/data/bills.csv` will be picked up depending on which file exists).
- If you only want the DB without importing, you can comment out the import command in `backend/entrypoint.sh`.
