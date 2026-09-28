FROM debian:trixie-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
	   ca-certificates tzdata python3 python3-fastapi python3-uvicorn \
	   python3-sqlalchemy python3-alembic python3-psycopg python3-argon2 \
	   python3-cryptography python3-pydantic-settings python3-email-validator \
	   python3-pytest python3-httpx \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
EXPOSE 8000
CMD ["python3", "-m", "uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--no-proxy-headers"]