#!/usr/bin/env bash
set -e

# wait for postgres
echo "Waiting for Postgres..."
until pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER"; do
  sleep 1
done

# make migrations for the app and run migrations
python backend/manage.py makemigrations --noinput || true
python backend/manage.py migrate --noinput

# import bills (idempotent) - retry a few times if the table isn't yet available
MAX_TRIES=5
TRY=1
until python backend/import_bills.py; do
  ec=$?
  echo "import_bills.py failed (exit $ec)."
  TRY=$((TRY+1))
  if [ $TRY -gt $MAX_TRIES ]; then
    echo "import_bills.py failed after $MAX_TRIES attempts, continuing startup."
    break
  fi
  echo "Retrying import_bills.py in 2s... (attempt $TRY/$MAX_TRIES)"
  sleep 2
done

# Cleanup duplicate bills with overlapping service periods
echo "Running duplicate bill cleanup..."
python backend/cleanup_duplicates.py || echo "⚠️  Duplicate cleanup failed, continuing startup."

# Create or update Django superuser from environment variables if provided
if [ -n "${DJANGO_SUPERUSER_USERNAME:-}" ] && [ -n "${DJANGO_SUPERUSER_EMAIL:-}" ] && [ -n "${DJANGO_SUPERUSER_PASSWORD:-}" ]; then
  echo "Ensuring Django superuser exists: $DJANGO_SUPERUSER_USERNAME"
  python backend/manage.py shell <<PY
from django.contrib.auth import get_user_model
User = get_user_model()
username = "${DJANGO_SUPERUSER_USERNAME}"
email = "${DJANGO_SUPERUSER_EMAIL}"
password = "${DJANGO_SUPERUSER_PASSWORD}"
user, created = User.objects.update_or_create(
    username=username,
    defaults={"email": email, "is_staff": True, "is_superuser": True}
)
if created:
    user.set_password(password)
    user.save()
    print(f"Created superuser {username}")
else:
    # ensure password and flags are correct
    user.set_password(password)
    user.is_staff = True
    user.is_superuser = True
    user.email = email
    user.save()
    print(f"Updated superuser {username}")
PY
fi

# Optionally start Ollama if binary is present or START_OLLAMA env var is true
if [ -x "/usr/local/bin/ollama" ] || [ "${START_OLLAMA:-false}" = "true" ]; then
  echo "Starting Ollama server in background..."
  # start ollama serve in the background; output logs to /app/ollama.log
  /usr/local/bin/ollama serve --port ${OLLAMA_PORT:-11434} > /app/ollama.log 2>&1 &
  sleep 1
  echo "Ollama started (logs: /app/ollama.log)"
fi

# start development server
python backend/manage.py runserver 0.0.0.0:8000

#run as LF in windows instead of CRLF (Bottom right of VS code, click CRLF and change to LF)