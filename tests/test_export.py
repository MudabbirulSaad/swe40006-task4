import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("notes_export", ROOT / "tools/notes-export/notes_export.py")
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


def test_export_example_and_repeat(tmp_path, capsys):
    args = ["--input", str(ROOT / "examples/notes.json"), "--output-dir", str(tmp_path)]
    assert exporter.main(args) == 0
    assert json.loads(capsys.readouterr().out)["status"] == "ok"
    summary = json.loads((tmp_path / "summary.json").read_text())
    assert summary["notes"] == 2
    assert summary["pinned"] == 1
    first = (tmp_path / "notes.md").read_text()
    assert first.index("Deployment checks") < first.index("Weekend")
    assert exporter.main(args) == 0
    assert (tmp_path / "notes.md").read_text() == first


def test_empty_export(tmp_path):
    source = tmp_path / "empty.json"
    source.write_text(json.dumps({"schema_version": 1, "notes": []}))
    assert exporter.main(["--input", str(source), "--output-dir", str(tmp_path / "output")]) == 0
    assert json.loads((tmp_path / "output/summary.json").read_text())["notes"] == 0


@pytest.mark.parametrize(
    "content",
    [
        "broken json",
        '{"schema_version":2,"notes":[]}',
        '{"schema_version":true,"notes":[]}',
        '{"schema_version":1,"notes":[{}]}',
        "[]",
    ],
)
def test_invalid_input_returns_failure_without_output(tmp_path, content):
    source = tmp_path / "bad.json"
    source.write_text(content)
    output = tmp_path / "output"
    assert exporter.main(["--input", str(source), "--output-dir", str(output)]) == 1
    assert not output.exists()


def test_missing_input(tmp_path):
    assert exporter.main(["--input", str(tmp_path / "missing.json"), "--output-dir", str(tmp_path)]) == 1


def test_output_path_is_a_file(tmp_path):
    target = tmp_path / "file"
    target.write_text("Keep this file")
    assert exporter.main(["--input", str(ROOT / "examples/notes.json"), "--output-dir", str(target)]) == 1
    assert target.read_text() == "Keep this file"


def test_markdown_escapes_html_and_formatting():
    assert (
        exporter.markdown_text("<script>alert(1)</script> **bold**")
        == "&lt;script&gt;alert(1)&lt;/script&gt; \\*\\*bold\\*\\*"
    )


def test_duplicate_ids_are_rejected(tmp_path):
    data = json.loads((ROOT / "examples/notes.json").read_text())
    data["notes"][1]["id"] = data["notes"][0]["id"]
    source = tmp_path / "duplicate.json"
    source.write_text(json.dumps(data))
    with pytest.raises(ValueError, match="duplicate"):
        exporter.read_export(source)
