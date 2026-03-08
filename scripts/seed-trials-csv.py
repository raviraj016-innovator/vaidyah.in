#!/usr/bin/env python3
"""Seed clinical trial data from a CSV file directly into PostgreSQL.

Usage:
    python scripts/seed-trials-csv.py [--csv path/to/file.csv] [--db-url postgresql://...]

Defaults:
    --csv   clinical-trials.csv  (project root)
    --db-url postgresql://vaidyah:password@localhost:5432/vaidyah
"""

import argparse
import csv
import json
import re
import sys
from datetime import datetime

import psycopg2
from psycopg2.extras import execute_values

# --------------------------------------------------------------------------- #
#  Helpers (same logic as the trial-service CSV ingest)
# --------------------------------------------------------------------------- #

STATUS_MAP = {
    "RECRUITING": "recruiting",
    "COMPLETED": "completed",
    "ACTIVE_NOT_RECRUITING": "active_not_recruiting",
    "NOT_YET_RECRUITING": "not_yet_recruiting",
    "SUSPENDED": "suspended",
    "TERMINATED": "terminated",
    "WITHDRAWN": "withdrawn",
    "ENROLLING_BY_INVITATION": "recruiting",
}


def parse_age(age_str):
    if not age_str or age_str.strip().upper() in ("N/A", "NA", ""):
        return None
    m = re.search(r"(\d+)", age_str.strip())
    if not m:
        return None
    val = int(m.group(1))
    if "month" in age_str.lower():
        return max(int(val / 12), 0)
    return val


def parse_date(date_str):
    if not date_str or date_str.strip().upper() in ("N/A", "NA", ""):
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except ValueError:
            continue
    return None


def norm_status(s):
    if not s:
        return None
    cleaned = s.strip().upper().replace(" ", "_")
    return STATUS_MAP.get(cleaned)


def split_list(s):
    if not s:
        return []
    return [x.strip() for x in s.split(",") if x.strip()]


# --------------------------------------------------------------------------- #
#  Main
# --------------------------------------------------------------------------- #

def main():
    parser = argparse.ArgumentParser(description="Seed trials CSV into PostgreSQL")
    parser.add_argument(
        "--csv", default="clinical-trials.csv", help="Path to CSV file"
    )
    parser.add_argument(
        "--db-url",
        default="postgresql://vaidyah:password@localhost:5432/vaidyah",
        help="PostgreSQL connection string",
    )
    parser.add_argument(
        "--batch-size", type=int, default=500, help="Rows per INSERT batch"
    )
    args = parser.parse_args()

    print(f"Reading CSV: {args.csv}")
    with open(args.csv, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Found {len(rows)} rows")

    conn = psycopg2.connect(args.db_url)
    cur = conn.cursor()

    # Ensure metadata column exists (idempotent)
    cur.execute("""
        DO $$ BEGIN
            ALTER TABLE clinical_trials ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
        EXCEPTION WHEN others THEN NULL;
        END $$;
    """)
    conn.commit()

    inserted = 0
    skipped = 0
    batch = []

    for i, row in enumerate(rows):
        nct_id = row.get("nct_id", "").strip()
        if not nct_id:
            skipped += 1
            continue

        status = norm_status(row.get("status"))
        if not status:
            skipped += 1
            continue

        conditions = split_list(row.get("condition"))
        categories = split_list(row.get("categories"))
        min_age = parse_age(row.get("min_age"))
        max_age = parse_age(row.get("max_age"))
        gender = row.get("gender", "All").strip() or "all"
        start_date = parse_date(row.get("start_date"))

        eligibility = json.dumps({
            "age_min": min_age,
            "age_max": max_age,
            "gender": gender.lower(),
            "criteria_text": "",
            "inclusion": [],
            "exclusion": [],
        })

        metadata = json.dumps({
            "categories": categories,
            "age_group": row.get("age_group", "").strip() or None,
            "race_ethnicity": row.get("race_ethnicity", "").strip() or None,
        })

        locations = json.dumps(
            [{"facility_name": row.get("locations", "").strip()}]
            if row.get("locations", "").strip()
            else []
        )

        batch.append((
            nct_id,
            row.get("title", "").strip(),
            row.get("brief_summary", "").strip(),
            row.get("plain_english_summary", "").strip(),
            conditions,
            row.get("phase", "").strip() or None,
            status,
            eligibility,
            locations,
            json.dumps([]),  # contacts
            row.get("sponsor", "").strip() or None,
            start_date,
            row.get("url", "").strip() or None,
            metadata,
        ))

        if len(batch) >= args.batch_size:
            _flush(cur, batch)
            inserted += len(batch)
            batch = []
            print(f"  ... {inserted}/{len(rows)} inserted", end="\r")

    if batch:
        _flush(cur, batch)
        inserted += len(batch)

    conn.commit()
    cur.close()
    conn.close()

    print(f"\nDone! Inserted/updated: {inserted}, Skipped: {skipped}")


def _flush(cur, batch):
    sql = """
        INSERT INTO clinical_trials
            (nct_id, title, brief_summary, plain_summary, conditions,
             phase, status, eligibility, locations, contacts,
             sponsor, start_date, url, metadata)
        VALUES %s
        ON CONFLICT (nct_id) DO UPDATE SET
            title = EXCLUDED.title,
            brief_summary = EXCLUDED.brief_summary,
            plain_summary = EXCLUDED.plain_summary,
            conditions = EXCLUDED.conditions,
            phase = EXCLUDED.phase,
            status = EXCLUDED.status,
            eligibility = EXCLUDED.eligibility,
            sponsor = EXCLUDED.sponsor,
            start_date = EXCLUDED.start_date,
            url = EXCLUDED.url,
            metadata = EXCLUDED.metadata,
            last_synced = NOW()
    """
    template = (
        "(%s, %s, %s, %s, %s::text[], %s, %s::trial_status, %s::jsonb, %s::jsonb, "
        "%s::jsonb, %s, %s, %s, %s::jsonb)"
    )
    execute_values(cur, sql, batch, template=template)


if __name__ == "__main__":
    main()
