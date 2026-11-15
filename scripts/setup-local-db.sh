#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -e .env ]; then
  printf '%s\n' '.env already exists; left unchanged.'
  exit 0
fi
umask 077
set -C
{
  printf '%s\n' 'POSTGRES_DB=taskmanager' 'POSTGRES_USER=taskmanager' 'DB_PORT=5432'
  printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
} > .env
printf '%s\n' 'Created local .env with a generated password (not tracked by Git).'
