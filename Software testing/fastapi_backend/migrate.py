"""Applies every migrations/*.sql not yet recorded in schema_migrations, in
filename order. Runs on backend startup via run_migrations(conn), or by hand
with `python migrate.py`. Each file runs in its own transaction: a failing
migration is rolled back and nothing after it is attempted."""

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MIGRATIONS_DIR = os.path.join(BASE_DIR, "migrations")


def run_migrations(conn) -> list[str]:
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """)
    conn.commit()

    cur.execute("SELECT version FROM schema_migrations;")
    applied = {row["version"] for row in cur.fetchall()}

    newly_applied = []
    for filename in sorted(os.listdir(MIGRATIONS_DIR)):
        if not filename.endswith(".sql"):
            continue
        version = filename[:-4]
        if version in applied:
            continue

        with open(os.path.join(MIGRATIONS_DIR, filename), encoding="utf-8") as f:
            sql = f.read()
        if not sql.strip():
            continue

        try:
            cur.execute(sql)
            cur.execute("INSERT INTO schema_migrations (version) VALUES (%s);", (version,))
            conn.commit()
        except Exception as exc:
            conn.rollback()
            raise RuntimeError(
                f"Migration {filename} failed and was rolled back; later migrations were not attempted."
            ) from exc
        newly_applied.append(version)

    cur.close()
    return newly_applied


if __name__ == "__main__":
    import psycopg2
    from psycopg2.extras import RealDictCursor
    from dotenv import load_dotenv

    load_dotenv(os.path.join(BASE_DIR, ".env"), override=True)
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        database=os.getenv("DB_NAME", ""),
        user=os.getenv("DB_USER", ""),
        password=os.getenv("DB_PASSWORD", ""),
        cursor_factory=RealDictCursor,
    )
    try:
        applied = run_migrations(conn)
    finally:
        conn.close()
    print("Applied: " + ", ".join(applied) if applied else "Database already up to date.")
