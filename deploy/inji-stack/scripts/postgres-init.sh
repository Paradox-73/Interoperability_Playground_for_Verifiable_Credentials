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
  psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname postgres -f "$SQL_DIR/$1"
}

run_sql certify_init.sql
run_sql mimoto_init.sql
run_sql inji_verify/db.sql
run_sql inji_verify/ddl.sql
echo "ps02-init: databases inji_certify, inji_mimoto and inji_verify are ready"
