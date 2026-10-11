#!/bin/sh
# Host volumes are often root-owned: fix the data directory, then drop to the node user.
set -e
mkdir -p "$DATA_DIR"
if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups node server/main.ts "$@"
fi
exec node server/main.ts "$@"
