"""The database schema this code was written for."""
import functools
import importlib
import pkgutil
from pathlib import Path

from alembic.script import ScriptDirectory
from sqlalchemy import MetaData

import app.modules
from app.db import Base

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"


def schema_metadata() -> MetaData:
    """Every table the modules declare, so Alembic compares the whole schema and not only what happens to be imported."""
    for module in pkgutil.iter_modules(app.modules.__path__):
        name = f"{app.modules.__name__}.{module.name}.models"
        if not module.ispkg:
            continue
        try:
            importlib.import_module(name)
        except ModuleNotFoundError as error:
            if error.name != name:
                raise
    return Base.metadata


class MigrationCheck:
    """Whether a database has every migration this code needs."""

    def __init__(self, directory=MIGRATIONS):
        script = ScriptDirectory(str(directory))
        self.heads = frozenset(script.get_heads())
        self.known = frozenset(revision.revision for revision in script.walk_revisions())

    def satisfied_by(self, applied) -> bool:
        applied = set(applied)
        # A revision this code does not know was applied by newer code. Migrations must stay usable by the previous
        # release (Chapter 10, C10-A11), so a newer database still serves; a database behind this code does not.
        return bool(applied) and (bool(applied - self.known) or self.heads <= applied)


@functools.cache
def migration_check() -> MigrationCheck:
    """Read the migration files at the first readiness check, not at start-up, so a broken file fails readiness
    instead of stopping the API from starting. A failed read is not cached and is tried again."""
    return MigrationCheck()
