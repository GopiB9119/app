import json
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sqlalchemy.engine import Engine

from app import cli
from app.config import Settings


@pytest.fixture
def contract_cli(monkeypatch, tmp_path):
    schema = {
        "openapi": "3.1.0",
        "paths": {"/v1/example": {"get": {"responses": {"200": {"description": "OK"}}}}},
        "components": {"schemas": {"Example": {"type": "object", "required": ["id"]}}},
    }
    engine = Mock()
    application = SimpleNamespace(openapi=lambda: deepcopy(schema), state=SimpleNamespace(engine=engine))
    monkeypatch.setattr(cli, "create_app", lambda settings: application)
    settings = Settings(secret_key=None, secret_file=tmp_path / "unused.key")
    return schema, engine, settings


def test_openapi_check_accepts_reordered_keys_without_writing(contract_cli, tmp_path, capsys):
    schema, engine, settings = contract_cli
    output = tmp_path / "openapi.json"
    reordered = dict(reversed(list(schema.items())))
    reordered["components"] = {"schemas": {"Example": dict(reversed(list(schema["components"]["schemas"]["Example"].items())))}}
    output.write_text(json.dumps(reordered, indent=1) + "\n", encoding="utf-8")
    before = output.read_bytes(), output.stat().st_mtime_ns

    cli.main(["check-openapi", "--output", str(output)], settings)

    assert (output.read_bytes(), output.stat().st_mtime_ns) == before
    assert not settings.secret_file.exists()
    engine.dispose.assert_called_once()
    assert "matches" in capsys.readouterr().out.lower()


@pytest.mark.parametrize("change", ["operation", "schema"])
def test_openapi_check_refuses_drift_without_replacing_the_file(contract_cli, tmp_path, capsys, change):
    schema, engine, settings = contract_cli
    stored = deepcopy(schema)
    if change == "operation":
        stored["paths"].clear()
    else:
        stored["components"]["schemas"]["Example"]["required"] = []
    output = tmp_path / "openapi.json"
    output.write_text(json.dumps(stored), encoding="utf-8")
    before = output.read_bytes(), output.stat().st_mtime_ns

    with pytest.raises(SystemExit) as refused:
        cli.main(["check-openapi", "--output", str(output)], settings)

    assert refused.value.code == 1
    assert (output.read_bytes(), output.stat().st_mtime_ns) == before
    assert not settings.secret_file.exists()
    engine.dispose.assert_called_once()
    printed = capsys.readouterr().out
    assert "OpenAPI drift" in printed
    assert ("#/paths/~1v1~1example" if change == "operation" else "#/components/schemas/Example/required") in printed


@pytest.mark.parametrize(("current", "stored"), [(True, 1), (False, 0), (None, {}), (["first", "second"], ["second", "first"])])
def test_openapi_differences_keep_json_value_types_and_array_order(current, stored):
    assert list(cli.openapi_differences(current, stored))


def test_openapi_difference_paths_escape_json_pointer_characters():
    assert list(cli.openapi_differences({"/v1/~example": {}}, {})) == ["#/~1v1~1~0example"]


@pytest.mark.parametrize("content", [None, b'{"private":"synthetic-marker",,}', b"\xff"])
def test_openapi_check_refuses_missing_or_invalid_files_without_writing(contract_cli, tmp_path, capsys, content):
    _schema, engine, settings = contract_cli
    output = tmp_path / "uncreated" / "openapi.json"
    if content is not None:
        output.parent.mkdir()
        output.write_bytes(content)

    with pytest.raises(SystemExit) as refused:
        cli.main(["check-openapi", "--output", str(output)], settings)

    assert refused.value.code == 1
    if content is None:
        assert not output.parent.exists()
    else:
        assert output.read_bytes() == content
    assert not settings.secret_file.exists()
    engine.dispose.assert_not_called()
    printed = capsys.readouterr()
    assert "missing, unreadable or invalid JSON" in printed.out
    assert "synthetic-marker" not in printed.out + printed.err


def test_openapi_drift_output_is_bounded_and_does_not_print_values(contract_cli, tmp_path, capsys):
    schema, _engine, settings = contract_cli
    output = tmp_path / "openapi.json"
    stored = deepcopy(schema)
    stored["components"]["schemas"] = {f"Item{index:02}": {"description": "synthetic-private-marker"} for index in range(25)}
    output.write_text(json.dumps(stored), encoding="utf-8")

    with pytest.raises(SystemExit) as refused:
        cli.main(["check-openapi", "--output", str(output)], settings)

    assert refused.value.code == 1
    printed = capsys.readouterr().out
    assert len([line for line in printed.splitlines() if line.startswith("#/")]) == 20
    assert "More differences omitted." in printed
    assert "synthetic-private-marker" not in printed


def test_real_openapi_export_and_check_need_no_database_or_application_key(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(Engine, "connect", Mock(side_effect=AssertionError("Schema inspection must not connect to a database.")))
    monkeypatch.setattr(Settings, "load_key", Mock(side_effect=AssertionError("Schema inspection must not read an application key.")))
    settings = Settings(secret_key=None, secret_file=tmp_path / "keys" / "identity.key")
    output = tmp_path / "contract" / "openapi.json"

    cli.main(["export-openapi", "--output", str(output)], settings)
    before = output.read_bytes(), output.stat().st_mtime_ns
    document = json.loads(before[0])
    assert document["paths"]["/v1/me"]["get"]["security"]
    assert document["paths"]["/v1/auth/login"]["post"]["responses"]["422"]["description"] == "Unprocessable Entity"
    assert document["paths"]["/v1/spaces/{space_id}/documents"]["post"]["responses"]["413"]["description"] == "Request Entity Too Large"
    cli.main(["--output", str(output), "check-openapi"], settings)

    assert (output.read_bytes(), output.stat().st_mtime_ns) == before
    assert not settings.secret_file.parent.exists()
    assert settings.secret_key is None
    assert "matches" in capsys.readouterr().out.lower()