import psycopg
from psycopg.rows import dict_row
from app import config


def get_db():
    """One connection per request; commits on success, rolls back on error.

    SET LOCAL lasts for this request's transaction only, so it also works behind the Supabase pooler.
    """
    with psycopg.connect(config.DATABASE_URL, row_factory=dict_row) as conn:
        conn.execute(f"set local timezone to '{config.TIMEZONE}'")
        conn.execute("set local search_path to tt2, public")
        yield conn
