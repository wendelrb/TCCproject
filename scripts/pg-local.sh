#!/usr/bin/env bash
# Sobe (ou re-sobe) o Postgres local usado pelos testes. Idempotente.
# O container desta sessão reinicia e derruba o cluster; rode isto antes de testar.
# Contexto em ASSUMPTIONS.md A-001.
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGD=${PGD:-/var/lib/postgresql/16/tcc}
PGPORT=${PGPORT:-55432}

if [ ! -d "$PGD" ]; then
  echo "criando cluster em $PGD"
  install -d -o postgres -g postgres -m 700 "$PGD"
  su postgres -c "$PGBIN/initdb -D $PGD -U postgres --auth=trust" >/dev/null
fi

if pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1; then
  echo "postgres já aceitando conexões em 127.0.0.1:$PGPORT"
  exit 0
fi

su postgres -c "$PGBIN/pg_ctl -D $PGD -o '-p $PGPORT' -l $PGD/../pg.log start" >/dev/null 2>&1 || true

for _ in $(seq 1 20); do
  if pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1; then
    echo "postgres pronto em 127.0.0.1:$PGPORT"
    exit 0
  fi
  sleep 0.5
done

echo "postgres NAO subiu; ultimas linhas do log:" >&2
tail -20 "$PGD/../pg.log" >&2 || true
exit 1
