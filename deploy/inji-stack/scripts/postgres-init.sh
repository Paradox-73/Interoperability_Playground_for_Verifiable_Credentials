#!/bin/sh
# SPDX-License-Identifier: MIT
#
# Creates the three Inji databases on the first start of the stack's Postgres container.
# Mounted as /docker-entrypoint-initdb.d/00-ps02-init.sh; the postgres image runs it once, while the data
# directory is still empty, against the local Unix socket.
#
# The SQL files are the upstream files in deploy/inji-stack/sql/, mounted at /ps02-sql. They are run with
# psql -f so that their \c and \ir meta-commands work and \ir resolves relative to the including file.
#
# Inji Verify (gap "Verify schema"): the inji-verify docker-compose sample creates its tables from
# docker-compose/db-init/init.sql, whose vp_submission table lacks the response_code columns that
# verify-service 0.18.2 writes. The release database scripts db_scripts/inji_verify/db.sql + ddl.sql match the
# service, so they are used here instead.
set -eu

SQL_DIR=${PS02_SQL_DIR:-/ps02-sql}

run_sql() {
  echo "ps02-init: running $1"
  case "$1" in
    /*) file=$1 ;;
    *) file="$SQL_DIR/$1" ;;
  esac
  psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname postgres -f "$file"
}

# PS02_INIT_SQL picks the files (database-ac of the holder-web profile runs only certify_init.sql).
for file in ${PS02_INIT_SQL:-certify_init.sql mimoto_init.sql inji_verify/db.sql inji_verify/ddl.sql}; do
  run_sql "$file"
done
echo "ps02-init: databases ready (${PS02_INIT_SQL:-inji_certify, inji_mimoto and inji_verify})"
