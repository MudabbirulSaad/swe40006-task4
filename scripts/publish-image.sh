#!/usr/bin/env bash
set -euo pipefail
repository=${1:?Pass task4-hello, task4-pinboard, or task4-notes-export}
version=${2:?Pass a version such as 0.2.0}
case "$repository" in
  task4-hello) context=apps/hello ;;
  task4-pinboard) context=apps/pinboard ;;
  task4-notes-export) context=tools/notes-export ;;
  *) echo 'Unknown application.' >&2; exit 2 ;;
esac
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Use a numeric x.y.z version.' >&2; exit 2; }
if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
  echo 'Commit and verify the source before publishing an image.' >&2
  exit 1
fi
revision=$(git rev-parse HEAD)
image="darksoda/$repository:$version"
docker build --build-arg "REVISION=$revision" -t "$image" "$context"
docker push "$image"
docker image inspect "$image" --format '{{index .RepoDigests 0}}'
