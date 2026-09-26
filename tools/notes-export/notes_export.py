"""Turn a Pinboard JSON export into readable, portable files."""

import argparse
import html
import json
import os
import re
import sys
import tempfile
from collections import Counter
from pathlib import Path

COLORS = {"butter", "sage", "rose", "sky", "lavender", "paper"}


def read_export(path):
    if path.stat().st_size > 10 * 1024 * 1024:
        raise ValueError("Input exceeds 10 MB.")
    document = json.loads(path.read_text(encoding="utf-8"))
    if (
        not isinstance(document, dict)
        or type(document.get("schema_version")) is not int
        or document["schema_version"] != 1
    ):
        raise ValueError("Expected a Pinboard export with schema_version 1.")
    notes = document.get("notes")
    if not isinstance(notes, list):
        raise ValueError("The export must contain a notes list.")
    for index, note in enumerate(notes, 1):
        if not isinstance(note, dict):
            raise ValueError(f"Note {index} is not an object.")
        if not all(
            isinstance(note.get(key), str)
            for key in ("id", "title", "body", "color", "created_at", "updated_at")
        ):
            raise ValueError(f"Note {index} is missing a text field.")
        if note["color"] not in COLORS or not isinstance(note.get("pinned"), bool):
            raise ValueError(f"Note {index} has an invalid colour or pinned value.")
    if len({note["id"] for note in notes}) != len(notes):
        raise ValueError("The export contains duplicate note IDs.")
    return sorted(notes, key=lambda note: (not note["pinned"], note["created_at"], note["id"]))


def markdown_text(text):
    return re.sub(r"([\\`*_{}\[\]#+!|~])", r"\\\1", html.escape(text, quote=False))


def render_markdown(notes):
    lines = ["# Pinboard notes", "", f"{len(notes)} note{'s' if len(notes) != 1 else ''}.", ""]
    for note in notes:
        title = note["title"] or "Untitled note"
        lines.extend([f"## {markdown_text(title)}", ""])
        if note["pinned"]:
            lines.extend(["Pinned", ""])
        lines.extend("> " + markdown_text(line) for line in note["body"].splitlines())
        lines.extend(["", f"Updated: {markdown_text(note['updated_at'])}", ""])
    return "\n".join(lines)


def summary(notes):
    return {
        "schema_version": 1,
        "notes": len(notes),
        "pinned": sum(note["pinned"] for note in notes),
        "words": sum(len((note["title"] + " " + note["body"]).split()) for note in notes),
        "by_color": dict(sorted(Counter(note["color"] for note in notes).items())),
    }


def atomic_write(path, content):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, encoding="utf-8", delete=False) as output:
            temporary = Path(output.name)
            output.write(content)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Pinboard JSON export")
    parser.add_argument(
        "--output-dir", type=Path, required=True, help="Directory for notes.md and summary.json"
    )
    args = parser.parse_args(argv)
    try:
        notes = read_export(args.input)
        args.output_dir.mkdir(parents=True, exist_ok=True)
        result = summary(notes)
        atomic_write(args.output_dir / "notes.md", render_markdown(notes))
        atomic_write(args.output_dir / "summary.json", json.dumps(result, indent=2) + "\n")
    except (OSError, ValueError, UnicodeError) as error:
        print(f"notes-export: {error}", file=sys.stderr)
        return 1
    print(json.dumps({"status": "ok", **result, "output_dir": str(args.output_dir)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
