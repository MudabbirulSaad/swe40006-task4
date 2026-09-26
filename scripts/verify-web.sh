#!/usr/bin/env bash
set -euo pipefail
base_url=${1:-http://127.0.0.1:8081}
curl --fail --show-error --retry 10 --retry-all-errors --retry-delay 1 "$base_url/healthz"
curl --fail --show-error "$base_url/" > /dev/null
docker compose ps
docker compose exec -T pinboard id
docker compose logs --no-color --tail 30 pinboard
