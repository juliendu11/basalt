#!/bin/sh
# Picks which process to run in this container based on PROCESS_TYPE
# (start/env.ts), so the same image serves the HTTP app, a BullMQ queue
# worker, or the periodic scheduler loop (docs/plans/14-jobs-and-queues.md).
set -e

PROCESS_TYPE="${PROCESS_TYPE:-web}"

case "$PROCESS_TYPE" in
  web)
    echo "→ Running migrations"
    node ace migration:run --force
    exec node bin/server.js
    ;;
  queue)
    if [ -n "$QUEUE_NAMES" ]; then
      exec node ace queue:work --queue="$QUEUE_NAMES"
    else
      exec node ace queue:work
    fi
    ;;
  scheduler)
    exec node ace scheduler:run
    ;;
  *)
    echo "entrypoint: unknown PROCESS_TYPE '$PROCESS_TYPE' (expected: web, queue, scheduler)" >&2
    exit 1
    ;;
esac
