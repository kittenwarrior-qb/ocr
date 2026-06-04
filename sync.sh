#!/bin/bash
# Sync data from MISA CRM -> local DB
# Usage: ./sync.sh [customers|products|contacts|all]

set -e

TARGET=${1:-all}

# Support both docker-compose v1 and v2
if command -v docker-compose &>/dev/null; then
  DC="docker-compose"
elif docker compose version &>/dev/null 2>&1; then
  DC="docker compose"
else
  echo "Error: docker-compose not found"
  exit 1
fi

sync_one() {
  echo -n "Syncing $1... "
  $DC exec -T backend python -c "
import httpx
r = httpx.post('http://localhost:8000/api/v1/misa/sync/$1', timeout=300)
d = r.json()
print('total=%s created=%s updated=%s errors=%s' % (d.get('total',0), d.get('created',0), d.get('updated',0), d.get('errors',0)))
"
}

case $TARGET in
  customers|products|contacts)
    sync_one "$TARGET"
    ;;
  all)
    sync_one customers
    sync_one products
    sync_one contacts
    echo "Done."
    ;;
  *)
    echo "Usage: ./sync.sh [customers|products|contacts|all]"
    exit 1
    ;;
esac
