import os
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.schema import CreateSchema, DropSchema

from app.config import Settings
from app.db import Base, database
from app.main import create_app


class Clock:
    def __init__(self):
        self.now = datetime(2026, 9, 19, 10, 0, tzinfo=timezone.utc)

    def __call__(self):
        return self.now


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    settings = Settings()
    assert settings.environment == "test"
    url = make_url(settings.database_url)
    assert url.database == "community_test"
    engine, _sessions = database(settings.database_url)
    schema = f"test_{uuid4().hex}"
    with engine.begin() as connection:
        connection.execute(CreateSchema(schema))
    original_url = os.environ.get("COMMUNITY_DATABASE_URL")
    isolated_url = url.update_query_dict({"options": f"-csearch_path={schema}"})
    os.environ["COMMUNITY_DATABASE_URL"] = isolated_url.render_as_string(hide_password=False)
    try:
        command.upgrade(Config("alembic.ini"), "head")
        yield schema
    finally:
        if original_url is None:
            os.environ.pop("COMMUNITY_DATABASE_URL", None)
        else:
            os.environ["COMMUNITY_DATABASE_URL"] = original_url
        try:
            with engine.begin() as connection:
                connection.execute(DropSchema(schema, cascade=True))
        finally:
            engine.dispose()


@pytest.fixture
def app():
    settings = Settings(secret_key=Fernet.generate_key().decode(), network_limit=500)
    assert settings.environment == "test"
    url = make_url(settings.database_url)
    assert url.database == "community_test"
    assert url.query.get("options", "").startswith("-csearch_path=test_")
    clock = Clock()
    application = create_app(settings, clock)
    application.state.clock = clock
    with application.state.engine.begin() as connection:
        # Reference data (the shared vocabulary) comes from the migrations, so emptying it would leave nothing to choose.
        tables = [table for table in Base.metadata.sorted_tables if not table.info.get("reference_data")]
        names = ", ".join(f'"{table.name}"' for table in tables)
        connection.execute(text(f"TRUNCATE {names} CASCADE"))
    yield application
    application.state.engine.dispose()


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client