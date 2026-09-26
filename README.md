# Pinboard

A small notes board built with React and Flask. Guest notes stay in the browser; signing in moves them to a private SQLite-backed board.

Move notes freely, arrange them in one click, pin the useful ones, and export a portable copy. Accounts accept a username or email at sign-in. Guest transfers preserve existing account notes and can be retried safely.

## Run locally

Use Docker Engine with Compose and Python 3 to generate the local configuration. Node.js and frontend dependencies are installed inside the build stage.

```bash
python3 scripts/init-env.py
docker compose up --build --wait pinboard
bash scripts/verify-web.sh
```

Open [Pinboard](http://localhost:8081). Container builds use `npm ci` with the committed lockfile. The final image contains the compiled frontend and Python runtime; Node.js and frontend development dependencies stay in the build stage.

The `.env` file contains the session secret. The initialization command creates it with owner-only permissions and leaves an existing file unchanged. Keep the secret stable across restarts.

Notes are stored in the `task4_notes-data` Docker volume. `docker compose down` stops the application without deleting notes. Recreate it with `docker compose up -d pinboard`. Do not add `--volumes` unless you intend to delete stored accounts and notes.

## Development without containers

```bash
python3 -m venv .venv
.venv/bin/pip install -r apps/pinboard/backend/requirements.txt -r requirements-dev.txt
python3 scripts/init-env.py
set -a
. ./.env
set +a
DATABASE_PATH="$PWD/.local/dev.sqlite" .venv/bin/gunicorn \
  --chdir apps/pinboard/backend --bind 127.0.0.1:8000 'app:create_app()'
```

In another terminal, run `npm run dev` from `apps/pinboard/frontend`. Vite proxies API calls to Flask. SQLite is initialized automatically.

Use Python 3.13+ and Node.js 24+ for development. Run `npm ci` in the frontend directory before starting Vite.

## Configuration

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | Required session-signing secret; generated locally. |
| `APP_TITLE` | Wordmark text, default `Pinboard`. |
| `DATABASE_PATH` | SQLite file, default `/data/pinboard.sqlite` in the container. |
| `COOKIE_SECURE` | Require HTTPS for session cookies; enabled by the public Compose override. |
| `TRUST_PROXY` | Trust one proxy hop; enabled only with the local tunnel service. |
| `TUNNEL_IMAGE` | Optional override for the cloudflared image; the default is pinned by digest. |

## Public demonstration

```bash
docker compose -f compose.yaml -f compose.public.yaml up --wait
docker compose -f compose.yaml -f compose.public.yaml logs tunnel
```

Open the HTTPS URL printed by cloudflared. Use that URL when signing in: secure cookies intentionally do not work through plain HTTP in this mode. Quick Tunnel addresses are temporary and change when the tunnel is recreated.

To return to local mode:

```bash
docker compose -f compose.yaml -f compose.public.yaml stop tunnel
docker compose up -d pinboard
```

## Other containers

The independent greeting example is under `apps/hello`:

```bash
docker compose --profile hello up --build -d hello
curl --fail http://localhost:8080/
```

The export tool is a standalone Python program with no network dependency. Download your notes from the board, then run:

```bash
python3 tools/notes-export/notes_export.py \
  --input exports/pinboard-notes.json --output-dir exports/readable
```

It writes `notes.md` and `summary.json`. Invalid input and filesystem failures return exit code 1; argument errors return 2. Existing output files are replaced atomically one file at a time.

For the container demonstration using the included synthetic notes:

```bash
bash scripts/verify-export.sh
```

This runs without networking, mounts input read-only, records the exit status, removes the finished container, and verifies that a separate container can still read the output volume.

For your own export, build the image and mount host directories:

```bash
mkdir -p exports/readable
docker build -t darksoda/task4-notes-export:1.0.0 tools/notes-export
docker run --rm --network none --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$PWD/exports,dst=/input,readonly" \
  --mount "type=bind,src=$PWD/exports/readable,dst=/output" \
  darksoda/task4-notes-export:1.0.0 \
  --input /input/pinboard-notes.json --output-dir /output
```

## Tests

```bash
.venv/bin/pytest -q
.venv/bin/ruff check apps/hello apps/pinboard/backend tools/notes-export tests scripts/init-env.py
cd apps/pinboard/frontend
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests expect Pinboard on port 8081. Set `BASE_URL` to test a different deployment. Run them on a test database: the account tests create synthetic users and notes. Tests cover desktop and mobile Chromium, mouse/touch/keyboard movement, guest persistence, authentication, retrying an interrupted transfer, and retaining drafts after failed saves. Set `SCREENSHOT_DIR` to save screenshots outside the repository.

## Published images and second-host verification

Image names are `darksoda/task4-hello`, `darksoda/task4-pinboard`, and `darksoda/task4-notes-export`. Publication is a separate step from building:

The verified release references and source revisions are in [images.lock.json](images.lock.json). Use the digest reference when you need the exact published image. These releases target Linux AMD64; other architectures need a local build or emulation.

```bash
docker login
bash scripts/publish-image.sh task4-hello 0.2.0
```

The script requires a clean committed working tree, labels the image with its source revision, pushes it, and prints its digest. Dispatch **Verify published image on a second host** in GitHub Actions with the repository name and digest. The runner pulls the published image without rebuilding it and uploads its host details, HTTP checks and container logs.

## Application boundaries

Each account has one private board. The app does not provide collaboration, email verification, or password recovery. Guests remain usable when accounts are unavailable. Clearing browser storage removes guest notes; account notes live in the SQLite volume.

The HTTP API uses session cookies and CSRF tokens. Call `/api/auth/session` for the token, then send it as `X-CSRFToken` on writes. Notes support create, list, patch and delete operations under `/api/notes`; `/layout`, `/import`, and `/export` handle arrangement, guest transfer and portable backups. `/healthz` verifies database access.

The UI uses source-owned components following shadcn/ui conventions and Radix primitives. Component aliases and styling are configured in `components.json`.
