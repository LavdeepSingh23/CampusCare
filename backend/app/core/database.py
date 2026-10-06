import logging
import pymysql

from app.core.config import (
    DB_HOST,
    DB_PORT,
    DB_NAME,
    DB_USER,
    DB_PASSWORD,
)
from app.core.local_db import get_local_db_connection

logger = logging.getLogger(__name__)


def get_db_connection():
    if DB_HOST:
        try:
            return pymysql.connect(
                host=DB_HOST,
                port=DB_PORT,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME,
                ssl={"ssl": {}},
                cursorclass=pymysql.cursors.DictCursor,
                autocommit=False,
                connect_timeout=3,
            )
        except Exception as e:
            logger.warning(
                "Remote MySQL connection to %s failed (%s). Falling back to local database.",
                DB_HOST,
                e,
            )
            return get_local_db_connection()

    return get_local_db_connection()