#!/usr/bin/env bash
set -euo pipefail
container=task4-export-proof
docker compose --profile export build notes-export
docker compose --profile export run --name "$container" notes-export
docker inspect --format 'status={{.State.Status}} exit={{.State.ExitCode}} network={{.HostConfig.NetworkMode}}' "$container"
docker logs "$container"
docker rm "$container"
# A separate container reads the volume after the original process has been removed.
docker run --rm --network none --entrypoint python \
  --mount type=volume,src=task4_export-data,dst=/output,readonly \
  darksoda/task4-notes-export:1.0.0 \
  -c 'from pathlib import Path; import json; p=Path("/output"); print(p.joinpath("notes.md").read_text()); d=json.loads(p.joinpath("summary.json").read_text()); assert d["notes"] == 2; print(d)'
