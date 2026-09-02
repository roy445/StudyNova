#!/usr/bin/env bash
# StudyNova AI – database backup / restore helper
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M%S)
DIR=${BACKUP_DIR:-./backups}
mkdir -p "$DIR"

case "${1:-backup}" in
  backup)
    pg_dump "${DATABASE_URL:?DATABASE_URL is required}" -Fc -f "$DIR/studynova-$STAMP.dump"
    echo "✅ backup written to $DIR/studynova-$STAMP.dump"
    ;;
  restore)
    FILE=${2:?usage: backup.sh restore <file.dump>}
    pg_restore --clean --if-exists --no-owner -d "${DATABASE_URL:?}" "$FILE"
    echo "✅ restored from $FILE"
    ;;
  storage)
    # Object storage backup (S3 compatible). Requires awscli.
    aws s3 sync "s3://${S3_BUCKET:?}" "$DIR/objects-$STAMP" --endpoint-url "${S3_ENDPOINT:?}"
    echo "✅ object storage synced to $DIR/objects-$STAMP"
    ;;
  *)
    echo "usage: backup.sh [backup|restore <file>|storage]" && exit 1
    ;;
esac
