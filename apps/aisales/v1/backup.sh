#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/home/aisales/aisales/backups
mkdir -p $BACKUP_DIR
docker exec aisales-postgres pg_dump -U aisales aisales | gzip > $BACKUP_DIR/postgres_$DATE.sql.gz
find $BACKUP_DIR -name "postgres_*.sql.gz" -mtime +30 -delete
echo "Backup done: postgres_$DATE.sql.gz"
