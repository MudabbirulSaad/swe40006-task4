#!/usr/bin/env bash
set -euo pipefail
name=task4-hello-world
date -u +'%Y-%m-%dT%H:%M:%SZ'
docker version
docker compose version
docker context show
docker pull hello-world
docker run --name "$name" hello-world
docker inspect --format 'name={{.Name}} image={{.Image}} status={{.State.Status}} exit={{.State.ExitCode}}' "$name"
docker logs "$name"
# Keep the stopped container available until its evidence has been collected.
