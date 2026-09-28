from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


def database(url: str):
    engine = create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)
    return engine, sessionmaker(engine, expire_on_commit=False)