"""src/db/data_store.py — SQLite writer for the US Stock data pipeline.

Provides get_db() and upsert_* helpers. Pipeline scripts call these alongside
their existing json.dump calls (parallel phase), then exclusively once JSON is
retired.

DB path priority:
  1. DATA_DB_PATH env var
  2. <project_root>/output/data.db
"""

import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_DEFAULT_DB_PATH = _PROJECT_ROOT / "output" / "data.db"

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS data_daily_reports (
  date         TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  verdict      TEXT NOT NULL,
  regime       TEXT NOT NULL,
  gate         TEXT NOT NULL,
  data_json    TEXT NOT NULL,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_data_reports_date ON data_daily_reports(date DESC);

CREATE TABLE IF NOT EXISTS data_risk_alerts (
  date         TEXT PRIMARY KEY,
  generated_at TEXT,
  verdict      TEXT,
  data_json    TEXT NOT NULL,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_data_risk_date ON data_risk_alerts(date DESC);

CREATE TABLE IF NOT EXISTS data_prediction_history (
  date                  TEXT PRIMARY KEY,
  spy_direction         TEXT,
  spy_probability       REAL,
  spy_predicted_return  REAL,
  qqq_direction         TEXT,
  qqq_probability       REAL,
  qqq_predicted_return  REAL,
  model_accuracy        REAL,
  created_at            TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_regime_snapshot (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  date        TEXT NOT NULL,
  regime      TEXT NOT NULL,
  data_json   TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_market_gate_snapshot (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  date        TEXT NOT NULL,
  gate        TEXT NOT NULL,
  data_json   TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_ai_summaries (
  ticker          TEXT PRIMARY KEY,
  recommendation  TEXT,
  confidence      INTEGER,
  data_json       TEXT NOT NULL,
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_gbm_predictions (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  total       INTEGER,
  data_json   TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_index_prediction (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  date        TEXT NOT NULL,
  data_json   TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_risk_snapshot (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  date        TEXT NOT NULL,
  verdict     TEXT,
  data_json   TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_performance (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  generated_at TEXT,
  data_json    TEXT NOT NULL,
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_graph (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  generated_at TEXT,
  data_json    TEXT NOT NULL,
  updated_at   TEXT DEFAULT (datetime('now'))
);
"""


def get_default_db_path() -> Path:
    env = os.environ.get("DATA_DB_PATH")
    if env:
        return Path(env)
    return _DEFAULT_DB_PATH


def get_db(path: "str | Path | None" = None) -> sqlite3.Connection:
    """Open (or create) the data SQLite DB with WAL mode and return connection."""
    db_path = Path(path) if path else get_default_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    init_schema(conn)
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA_SQL)
    conn.commit()


# ──────────────────────────────────────────────────────────────────────
# Time series upserts
# ──────────────────────────────────────────────────────────────────────

def upsert_daily_report(conn: sqlite3.Connection, date: str, data: dict) -> None:
    """Insert or replace a daily report. `date` must be ISO 'YYYY-MM-DD'."""
    timing = data.get("market_timing", {})
    conn.execute(
        """INSERT OR REPLACE INTO data_daily_reports
           (date, generated_at, verdict, regime, gate, data_json)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            date,
            data.get("generated_at", ""),
            data.get("verdict", "CAUTION"),
            timing.get("regime", "neutral"),
            timing.get("gate", "CAUTION"),
            json.dumps(data, ensure_ascii=False),
        ),
    )
    conn.commit()


def upsert_risk_alert(
    conn: sqlite3.Connection,
    date: str,
    data: dict,
    update_snapshot: bool = False,
) -> None:
    """Insert or replace a dated risk alert row.

    Set update_snapshot=True when this is today's live alert (not a historical
    backfill) so that data_risk_snapshot (id=1) is also updated.
    """
    data_json = json.dumps(data, ensure_ascii=False, default=str)
    conn.execute(
        """INSERT OR REPLACE INTO data_risk_alerts
           (date, generated_at, verdict, data_json)
           VALUES (?, ?, ?, ?)""",
        (date, data.get("generated_at", ""), data.get("verdict", ""), data_json),
    )
    if update_snapshot:
        conn.execute(
            """INSERT OR REPLACE INTO data_risk_snapshot
               (id, date, verdict, data_json, updated_at)
               VALUES (1, ?, ?, ?, datetime('now'))""",
            (date, data.get("verdict", ""), data_json),
        )
    conn.commit()


def upsert_prediction_history_entry(conn: sqlite3.Connection, entry: dict) -> None:
    """Upsert one entry from the prediction_history.json array."""
    spy = entry.get("spy", {})
    qqq = entry.get("qqq", {})
    conn.execute(
        """INSERT OR REPLACE INTO data_prediction_history
           (date, spy_direction, spy_probability, spy_predicted_return,
            qqq_direction, qqq_probability, qqq_predicted_return, model_accuracy)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            entry.get("date", ""),
            spy.get("direction"),
            spy.get("probability"),
            spy.get("predicted_return"),
            qqq.get("direction"),
            qqq.get("probability"),
            qqq.get("predicted_return"),
            entry.get("model_accuracy"),
        ),
    )
    conn.commit()


# ──────────────────────────────────────────────────────────────────────
# Snapshot upserts (single-row tables with id=1)
# ──────────────────────────────────────────────────────────────────────

def upsert_regime_snapshot(conn: sqlite3.Connection, result: dict) -> None:
    """Upsert regime snapshot from regime_result.json contents."""
    date = result.get("date", datetime.now().strftime("%Y-%m-%d"))
    regime = result.get("final_regime", result.get("regime", "neutral"))
    conn.execute(
        """INSERT OR REPLACE INTO data_regime_snapshot
           (id, date, regime, data_json, updated_at)
           VALUES (1, ?, ?, ?, datetime('now'))""",
        (date, regime, json.dumps(result, ensure_ascii=False, default=str)),
    )
    conn.commit()


def upsert_market_gate_snapshot(conn: sqlite3.Connection, gate_data: dict) -> None:
    """Upsert market gate snapshot from market_gate.json contents."""
    date = gate_data.get("date", datetime.now().strftime("%Y-%m-%d"))
    conn.execute(
        """INSERT OR REPLACE INTO data_market_gate_snapshot
           (id, date, gate, data_json, updated_at)
           VALUES (1, ?, ?, ?, datetime('now'))""",
        (
            date,
            gate_data.get("gate", "CAUTION"),
            json.dumps(gate_data, ensure_ascii=False, default=str),
        ),
    )
    conn.commit()


def upsert_ai_summaries(conn: sqlite3.Connection, summaries: dict) -> None:
    """Upsert all tickers from ai_summaries.json (dict keyed by ticker)."""
    rows = [
        (
            ticker,
            info.get("recommendation", ""),
            info.get("confidence", 0),
            json.dumps(info, ensure_ascii=False),
        )
        for ticker, info in summaries.items()
    ]
    conn.executemany(
        """INSERT OR REPLACE INTO data_ai_summaries
           (ticker, recommendation, confidence, data_json, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'))""",
        rows,
    )
    conn.commit()


def upsert_gbm_predictions(conn: sqlite3.Connection, payload: dict) -> None:
    """Upsert gbm_predictions.json payload."""
    conn.execute(
        """INSERT OR REPLACE INTO data_gbm_predictions
           (id, total, data_json, updated_at)
           VALUES (1, ?, ?, datetime('now'))""",
        (payload.get("total", 0), json.dumps(payload, ensure_ascii=False)),
    )
    conn.commit()


def upsert_index_prediction(conn: sqlite3.Connection, prediction: dict) -> None:
    """Upsert index_prediction.json payload."""
    conn.execute(
        """INSERT OR REPLACE INTO data_index_prediction
           (id, date, data_json, updated_at)
           VALUES (1, ?, ?, datetime('now'))""",
        (
            prediction.get("date", datetime.now().strftime("%Y-%m-%d")),
            json.dumps(prediction, ensure_ascii=False),
        ),
    )
    conn.commit()


def upsert_performance(conn: sqlite3.Connection, perf_data: dict) -> None:
    """Upsert performance.json payload."""
    conn.execute(
        """INSERT OR REPLACE INTO data_performance
           (id, generated_at, data_json, updated_at)
           VALUES (1, ?, ?, datetime('now'))""",
        (perf_data.get("generated_at", ""), json.dumps(perf_data, ensure_ascii=False)),
    )
    conn.commit()


def upsert_graph(conn: sqlite3.Connection, graph_data: dict) -> None:
    """Upsert graph.json payload."""
    conn.execute(
        """INSERT OR REPLACE INTO data_graph
           (id, generated_at, data_json, updated_at)
           VALUES (1, ?, ?, datetime('now'))""",
        (
            graph_data.get("generated_at", ""),
            json.dumps(graph_data, ensure_ascii=False),
        ),
    )
    conn.commit()
