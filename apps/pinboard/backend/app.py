import math
import os
import re
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory, session
from flask_wtf.csrf import CSRFError, CSRFProtect, generate_csrf
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

COLORS = {"butter", "sage", "rose", "sky", "lavender", "paper"}
NOTE_FIELDS = "id,title,body,color,pinned,x,y,created_at,updated_at"


def now():
    return datetime.now(timezone.utc).isoformat()


def db():
    if "db" not in g:
        g.db = sqlite3.connect(g.app_database, timeout=10)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def require_user(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if not g.user:
            return {"error": "Sign in to access your notes."}, 401
        return fn(*args, **kwargs)

    return wrapped


def payload():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValueError("Send a JSON object.")
    return data


def validate_note(data):
    title, body = data.get("title", ""), data.get("body", "")
    if not isinstance(title, str) or not isinstance(body, str):
        raise ValueError("Note text must be a string.")
    title = title.strip()
    if not title and not body.strip():
        raise ValueError("Write a title or a note.")
    if len(title) > 120 or len(body) > 10000:
        raise ValueError("Keep titles under 120 and notes under 10,000 characters.")
    color = data.get("color", "butter")
    if not isinstance(color, str) or color not in COLORS:
        raise ValueError("Choose a supported note colour.")
    pinned = data.get("pinned", False)
    if not isinstance(pinned, bool):
        raise ValueError("Pinned must be true or false.")
    x, y = coordinates(data)
    return {"title": title, "body": body, "color": color, "pinned": pinned, "x": x, "y": y}


def coordinates(data):
    values = [data.get("x", 24), data.get("y", 24)]
    if any(
        isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 100000
        for v in values
    ):
        raise ValueError("Note positions must be between 0 and 100,000.")
    return values


def serialize(row):
    note = dict(row)
    note["pinned"] = bool(note["pinned"])
    return note


def user_notes():
    return [
        serialize(row)
        for row in db().execute(
            f"SELECT {NOTE_FIELDS} FROM notes WHERE user_id=? ORDER BY pinned DESC, created_at, id",
            (g.user["id"],),
        )
    ]


def create_app(config=None):
    app = Flask(__name__, static_folder="static", static_url_path="/assets-static")
    app.config.from_mapping(
        SECRET_KEY=os.getenv("SECRET_KEY"),
        DATABASE=os.getenv("DATABASE_PATH", "/data/pinboard.sqlite"),
        APP_TITLE=os.getenv("APP_TITLE", "Pinboard"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        MAX_CONTENT_LENGTH=2 * 1024 * 1024,
        WTF_CSRF_TIME_LIMIT=None,
    )
    if config:
        app.config.update(config)
    if not app.config["SECRET_KEY"]:
        raise RuntimeError("Set SECRET_KEY before starting Pinboard.")
    if os.getenv("TRUST_PROXY", "false").lower() == "true":
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    CSRFProtect(app)

    database = Path(app.config["DATABASE"])
    database.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database) as connection:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.executescript(Path(__file__).with_name("schema.sql").read_text())

    @app.before_request
    def load_user():
        g.app_database = app.config["DATABASE"]
        g.user = (
            db()
            .execute("SELECT id,username,email FROM users WHERE id=?", (session.get("user_id"),))
            .fetchone()
        )

    @app.teardown_appcontext
    def close_db(_error):
        connection = g.pop("db", None)
        if connection is not None:
            connection.close()

    @app.after_request
    def headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.errorhandler(ValueError)
    def validation(error):
        return {"error": str(error)}, 400

    @app.errorhandler(CSRFError)
    def csrf_error(_error):
        return {"error": "Your session changed. Refresh and try again."}, 400

    @app.errorhandler(HTTPException)
    def http_error(error):
        if request.path.startswith("/api/"):
            return {"error": error.description}, error.code
        return error

    @app.get("/healthz")
    def health():
        db().execute("SELECT 1 FROM users LIMIT 1")
        return {"status": "ok"}

    def session_response():
        return {
            "user": dict(g.user) if g.user else None,
            "csrf_token": generate_csrf(),
            "title": app.config["APP_TITLE"],
        }

    @app.get("/api/auth/session")
    def auth_session():
        return session_response()

    @app.post("/api/auth/register")
    def register():
        data = payload()
        username = data.get("username", "")
        email = data.get("email", "")
        password = data.get("password", "")
        if not all(isinstance(v, str) for v in (username, email, password)):
            raise ValueError("Enter your username, email and password.")
        username, email = username.strip(), email.strip().lower()
        if not re.fullmatch(r"[A-Za-z0-9_-]{3,30}", username):
            raise ValueError("Use 3–30 letters, numbers, underscores or hyphens for your username.")
        if len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            raise ValueError("Enter a valid email address.")
        if not 12 <= len(password) <= 128:
            raise ValueError("Use a password with 12–128 characters.")
        try:
            with db():
                cursor = db().execute(
                    "INSERT INTO users(username,email,password_hash,created_at) VALUES(?,?,?,?)",
                    (username, email, generate_password_hash(password), now()),
                )
        except sqlite3.IntegrityError:
            return {"error": "That username or email is already registered."}, 409
        session.clear()
        session["user_id"] = cursor.lastrowid
        g.user = (
            db().execute("SELECT id,username,email FROM users WHERE id=?", (cursor.lastrowid,)).fetchone()
        )
        return session_response(), 201

    @app.post("/api/auth/login")
    def login():
        data = payload()
        identity, password = data.get("identifier", ""), data.get("password", "")
        if (
            not isinstance(identity, str)
            or not isinstance(password, str)
            or len(identity) > 254
            or len(password) > 128
        ):
            raise ValueError("Enter your username or email and password.")
        identity = identity.strip().lower()
        attempt = db().execute("SELECT * FROM login_attempts WHERE identity=?", (identity,)).fetchone()
        if attempt and attempt["expires_at"] > time.time() and attempt["failures"] >= 5:
            return {"error": "Too many attempts. Try again in 15 minutes."}, 429
        user = (
            db()
            .execute(
                "SELECT * FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE",
                (identity, identity),
            )
            .fetchone()
        )
        if not user or not check_password_hash(user["password_hash"], password):
            failures = attempt["failures"] + 1 if attempt and attempt["expires_at"] > time.time() else 1
            with db():
                db().execute(
                    "INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)",
                    (identity, failures, time.time() + 900),
                )
            return {"error": "Username, email or password is incorrect."}, 401
        with db():
            db().execute("DELETE FROM login_attempts WHERE identity=?", (identity,))
        session.clear()
        session["user_id"] = user["id"]
        g.user = {key: user[key] for key in ("id", "username", "email")}
        return session_response()

    @app.post("/api/auth/logout")
    def logout():
        session.clear()
        g.user = None
        return session_response()

    @app.get("/api/notes")
    @require_user
    def list_notes():
        return {"notes": user_notes()}

    def insert_note(data, client_id=None):
        note = validate_note(data)
        note_id, timestamp = str(uuid.uuid4()), now()
        db().execute(
            "INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (
                note_id,
                g.user["id"],
                client_id,
                note["title"],
                note["body"],
                note["color"],
                note["pinned"],
                note["x"],
                note["y"],
                timestamp,
                timestamp,
            ),
        )
        return serialize(db().execute(f"SELECT {NOTE_FIELDS} FROM notes WHERE id=?", (note_id,)).fetchone())

    @app.post("/api/notes")
    @require_user
    def add_note():
        with db():
            note = insert_note(payload())
        return {"note": note}, 201

    @app.patch("/api/notes/<note_id>")
    @require_user
    def update_note(note_id):
        existing = (
            db()
            .execute(f"SELECT {NOTE_FIELDS} FROM notes WHERE id=? AND user_id=?", (note_id, g.user["id"]))
            .fetchone()
        )
        if not existing:
            return {"error": "Note not found."}, 404
        note = validate_note(serialize(existing) | payload())
        with db():
            db().execute(
                "UPDATE notes SET title=?,body=?,color=?,pinned=?,x=?,y=?,updated_at=? WHERE id=? AND user_id=?",
                (
                    note["title"],
                    note["body"],
                    note["color"],
                    note["pinned"],
                    note["x"],
                    note["y"],
                    now(),
                    note_id,
                    g.user["id"],
                ),
            )
        return {
            "note": serialize(
                db().execute(f"SELECT {NOTE_FIELDS} FROM notes WHERE id=?", (note_id,)).fetchone()
            )
        }

    @app.delete("/api/notes/<note_id>")
    @require_user
    def delete_note(note_id):
        with db():
            cursor = db().execute("DELETE FROM notes WHERE id=? AND user_id=?", (note_id, g.user["id"]))
        if not cursor.rowcount:
            return {"error": "Note not found."}, 404
        return "", 204

    @app.patch("/api/notes/layout")
    @require_user
    def layout():
        positions = payload().get("positions")
        if not isinstance(positions, list) or len(positions) > 500:
            raise ValueError("Send up to 500 note positions.")
        with db():
            for position in positions:
                if not isinstance(position, dict) or not isinstance(position.get("id"), str):
                    raise ValueError("Each position needs a note ID.")
                x, y = coordinates(position)
                cursor = db().execute(
                    "UPDATE notes SET x=?,y=?,updated_at=? WHERE id=? AND user_id=?",
                    (x, y, now(), position["id"], g.user["id"]),
                )
                if not cursor.rowcount:
                    raise ValueError("A note in this layout is unavailable.")
        return {"notes": user_notes()}

    @app.post("/api/notes/import")
    @require_user
    def import_notes():
        notes = payload().get("notes")
        if not isinstance(notes, list) or len(notes) > 500:
            raise ValueError("Import up to 500 notes at a time.")
        confirmed = []
        with db():
            for note in notes:
                if not isinstance(note, dict) or not isinstance(note.get("id"), str) or len(note["id"]) > 100:
                    raise ValueError("Each imported note needs a valid ID.")
                validate_note(note)
                receipt = db().execute(
                    "INSERT OR IGNORE INTO imports VALUES(?,?)", (g.user["id"], note["id"])
                )
                if receipt.rowcount:
                    insert_note(note, note["id"])
                confirmed.append(note["id"])
        return {"confirmed_ids": confirmed, "notes": user_notes()}

    @app.get("/api/notes/export")
    @require_user
    def export():
        response = jsonify(schema_version=1, exported_at=now(), notes=user_notes())
        response.headers["Content-Disposition"] = 'attachment; filename="pinboard-notes.json"'
        return response

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def frontend(path):
        if path.startswith("api/"):
            return {"error": "Not found."}, 404
        if path and (Path(app.static_folder) / path).is_file():
            return send_from_directory(app.static_folder, path)
        return send_from_directory(app.static_folder, "index.html")

    return app
