import importlib.util
import sqlite3
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "pinboard", Path(__file__).parents[1] / "apps/pinboard/backend/app.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
PASSWORD = "a-test-password-123"


@pytest.fixture
def app(tmp_path):
    return module.create_app(
        {"TESTING": True, "SECRET_KEY": "test-secret", "DATABASE": str(tmp_path / "notes.sqlite")}
    )


@pytest.fixture
def client(app):
    return app.test_client()


def request(client, method, path, data=None):
    csrf = client.get("/api/auth/session").json["csrf_token"]
    return getattr(client, method)(path, json=data, headers={"X-CSRFToken": csrf})


def register(client, name="alice"):
    result = request(
        client,
        "post",
        "/api/auth/register",
        {"username": name, "email": f"{name}@example.com", "password": PASSWORD},
    )
    assert result.status_code == 201
    return result


def note(**updates):
    return {
        "title": "Docker checks",
        "body": "Verify the published image.",
        "color": "sage",
        "pinned": False,
        "x": 24,
        "y": 24,
    } | updates


def test_health_and_csrf(client):
    assert client.get("/healthz").json == {"status": "ok"}
    assert client.post("/api/auth/register", json={}).status_code == 400
    assert client.get("/api/notes").status_code == 401


def test_registration_login_and_hashing(app, client):
    register(client)
    request(client, "post", "/api/auth/logout")
    for identifier in ("ALICE", "Alice@example.com"):
        result = request(client, "post", "/api/auth/login", {"identifier": identifier, "password": PASSWORD})
        assert result.status_code == 200
        assert result.json["user"]["username"] == "alice"
        request(client, "post", "/api/auth/logout")
    with sqlite3.connect(app.config["DATABASE"]) as conn:
        stored = conn.execute("SELECT password_hash FROM users").fetchone()[0]
        assert stored != PASSWORD
        assert module.check_password_hash(stored, PASSWORD)


def test_duplicate_and_invalid_registration(client):
    register(client)
    assert (
        request(
            client,
            "post",
            "/api/auth/register",
            {"username": "ALICE", "email": "new@example.com", "password": PASSWORD},
        ).status_code
        == 409
    )
    assert (
        request(
            client,
            "post",
            "/api/auth/register",
            {"username": "a@b", "email": "a@b.com", "password": PASSWORD},
        ).status_code
        == 400
    )
    assert (
        request(
            client,
            "post",
            "/api/auth/register",
            {"username": "other", "email": "a@b.com", "password": "short"},
        ).status_code
        == 400
    )


def test_crud_and_export(client):
    register(client)
    created = request(client, "post", "/api/notes", note())
    assert created.status_code == 201
    key = created.json["note"]["id"]
    edited = request(
        client, "patch", f"/api/notes/{key}", {"pinned": True, "body": "Build, push, pull, run."}
    )
    assert edited.json["note"]["pinned"] is True
    exported = client.get("/api/notes/export")
    assert exported.json["schema_version"] == 1
    assert "user_id" not in exported.json["notes"][0]
    assert "attachment" in exported.headers["Content-Disposition"]
    assert request(client, "delete", f"/api/notes/{key}").status_code == 204
    assert client.get("/api/notes").json == {"notes": []}


def test_other_accounts_cannot_read_or_modify_notes(app, client):
    register(client)
    key = request(client, "post", "/api/notes", note()).json["note"]["id"]
    other = app.test_client()
    register(other, "bob")
    assert other.get("/api/notes").json["notes"] == []
    assert request(other, "patch", f"/api/notes/{key}", {"title": "Changed"}).status_code == 404
    assert request(other, "delete", f"/api/notes/{key}").status_code == 404
    assert (
        request(other, "patch", "/api/notes/layout", {"positions": [{"id": key, "x": 5, "y": 5}]}).status_code
        == 400
    )
    assert client.get("/api/notes").json["notes"][0]["title"] == "Docker checks"


def test_layout_is_atomic(client):
    register(client)
    key = request(client, "post", "/api/notes", note()).json["note"]["id"]
    result = request(
        client,
        "patch",
        "/api/notes/layout",
        {"positions": [{"id": key, "x": 200, "y": 100}, {"id": "missing", "x": 0, "y": 0}]},
    )
    assert result.status_code == 400
    assert client.get("/api/notes").json["notes"][0]["x"] == 24
    assert (
        request(
            client, "patch", "/api/notes/layout", {"positions": [{"id": key, "x": 200, "y": 100}]}
        ).status_code
        == 200
    )


def test_guest_import_appends_and_retries_without_duplicates(client):
    register(client)
    request(client, "post", "/api/notes", note(title="Existing account note"))
    batch = {"notes": [note(id="guest-1"), note(id="guest-2", color="sky")]}
    first = request(client, "post", "/api/notes/import", batch)
    retry = request(client, "post", "/api/notes/import", batch)
    assert first.json["confirmed_ids"] == ["guest-1", "guest-2"]
    assert len(retry.json["notes"]) == 3
    imported = next(n for n in first.json["notes"] if n["title"] == "Docker checks")
    request(client, "delete", "/api/notes/" + imported["id"])
    assert len(request(client, "post", "/api/notes/import", batch).json["notes"]) == 2


def test_invalid_import_rolls_back_entire_batch(client):
    register(client)
    batch = {"notes": [note(id="guest-1"), note(id="guest-2", x=-1)]}
    assert request(client, "post", "/api/notes/import", batch).status_code == 400
    assert client.get("/api/notes").json["notes"] == []
    batch["notes"][1]["x"] = 12
    assert len(request(client, "post", "/api/notes/import", batch).json["notes"]) == 2


@pytest.mark.parametrize(
    "updates",
    [
        {"title": "", "body": " "},
        {"color": "unknown"},
        {"x": -1},
        {"y": True},
        {"body": "x" * 10001},
        {"pinned": "false"},
    ],
)
def test_note_validation(client, updates):
    register(client)
    assert request(client, "post", "/api/notes", note(**updates)).status_code == 400


def test_login_rate_limit(client):
    for _ in range(5):
        assert (
            request(
                client, "post", "/api/auth/login", {"identifier": "unknown", "password": "incorrect"}
            ).status_code
            == 401
        )
    assert (
        request(
            client, "post", "/api/auth/login", {"identifier": "unknown", "password": "incorrect"}
        ).status_code
        == 429
    )


def test_database_survives_application_restart(app, client):
    register(client)
    request(client, "post", "/api/notes", note())
    reopened = module.create_app(dict(app.config)).test_client()
    assert (
        request(
            reopened, "post", "/api/auth/login", {"identifier": "alice", "password": PASSWORD}
        ).status_code
        == 200
    )
    assert len(reopened.get("/api/notes").json["notes"]) == 1


def test_secret_is_required(tmp_path, monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        module.create_app({"DATABASE": str(tmp_path / "notes.sqlite")})


def test_registration_returns_a_working_rotated_csrf_token(client):
    registered = register(client)
    response = client.post("/api/notes", json=note(), headers={"X-CSRFToken": registered.json["csrf_token"]})
    assert response.status_code == 201


def test_secure_session_cookie_flags(app):
    app.config["SESSION_COOKIE_SECURE"] = True
    response = app.test_client().get("/api/auth/session", base_url="https://example.test")
    cookie = response.headers["Set-Cookie"]
    assert "Secure" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=Lax" in cookie


def test_invalid_colour_type_is_a_validation_error(client):
    register(client)
    assert request(client, "post", "/api/notes", note(color=[])).status_code == 400
