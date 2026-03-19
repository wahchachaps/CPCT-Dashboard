import json
import os
import sys
import uuid
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

try:
    import requests  # type: ignore
except Exception:
    requests = None

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app import (
    CATEGORY_OPTIONS,
    allowed_file,
    infer_category_from_name,
    parse_year_month,
    precompute_upload_data,
)

UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
MANIFEST_PATH = os.path.join(UPLOADS_DIR, "manifest.json")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()


def supabase_configured():
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)


def rest_base_url():
    return f"{SUPABASE_URL.rstrip('/')}/rest/v1/uploads"


def build_headers(extra=None):
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Accept": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def request_json(method, url, payload=None, extra_headers=None):
    headers = build_headers(extra_headers)
    if payload is not None:
        headers["Content-Type"] = "application/json"

    if requests:
        resp = requests.request(
            method,
            url,
            headers=headers,
            json=payload,
            timeout=30
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"{resp.status_code} {resp.text}")
        if not resp.text:
            return None
        return resp.json()

    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            if not text:
                return None
            return json.loads(text)
    except urllib.error.HTTPError as exc:
        try:
            text = exc.read().decode("utf-8")
        except Exception:
            text = str(exc)
        raise RuntimeError(f"{exc.code} {text}") from exc


def normalize_id(value):
    if not value:
        return str(uuid.uuid4())
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        try:
            return str(uuid.UUID(hex=str(value)))
        except (ValueError, AttributeError, TypeError):
            return str(uuid.uuid4())


def load_manifest_entries():
    if not os.path.isfile(MANIFEST_PATH):
        return []
    try:
        with open(MANIFEST_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return []
    return data if isinstance(data, list) else []


def scan_upload_dir():
    if not os.path.isdir(UPLOADS_DIR):
        return []
    entries = []
    for name in os.listdir(UPLOADS_DIR):
        if name.lower() == "manifest.json":
            continue
        if not allowed_file(name):
            continue
        entries.append({
            "stored_name": name,
            "original_name": name,
        })
    return entries


def normalize_name(value):
    base = os.path.splitext(str(value or ""))[0].lower()
    return re.sub(r"[^a-z0-9]+", "", base)


def resolve_path(entry):
    for key in ("stored_name", "original_name"):
        name = entry.get(key)
        if not name:
            continue
        path = os.path.join(UPLOADS_DIR, name)
        if os.path.isfile(path):
            return path
    original_name = entry.get("original_name")
    if original_name:
        target = normalize_name(original_name)
        if target:
            for name in os.listdir(UPLOADS_DIR):
                if name.lower() == "manifest.json":
                    continue
                if not allowed_file(name):
                    continue
                if target in normalize_name(name):
                    candidate = os.path.join(UPLOADS_DIR, name)
                    if os.path.isfile(candidate):
                        return candidate
    return None


def entry_exists(stored_name):
    if not stored_name:
        return False
    try:
        encoded = urllib.parse.quote(stored_name)
        url = f"{rest_base_url()}?select=id&stored_name=eq.{encoded}&limit=1"
        data = request_json("GET", url)
        return bool(data)
    except Exception:
        return False


def main():
    if not supabase_configured():
        print("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
        return 1

    entries = load_manifest_entries()
    scanned = scan_upload_dir()
    if entries:
        seen = {entry.get("stored_name") for entry in entries if entry.get("stored_name")}
        for item in scanned:
            if item.get("stored_name") not in seen:
                entries.append(item)
    else:
        entries = scanned

    if not entries:
        print("No uploads found to migrate.")
        return 0

    migrated = 0
    skipped = 0
    errors = 0

    for entry in entries:
        path = resolve_path(entry)
        if not path:
            print("Missing file for entry:", entry.get("original_name") or entry.get("stored_name") or "unknown")
            errors += 1
            continue

        original_name = entry.get("original_name") or os.path.basename(path)
        stored_name = entry.get("stored_name") or os.path.basename(path)
        if entry_exists(stored_name):
            print("Already in database, skipping:", stored_name)
            skipped += 1
            continue

        category = (entry.get("category") or "").strip().lower()
        if category not in CATEGORY_OPTIONS:
            category = infer_category_from_name(original_name)
        if category not in CATEGORY_OPTIONS:
            category = "other"

        year = entry.get("year")
        month = entry.get("month")
        if not year or not month:
            parsed_year, parsed_month = parse_year_month(original_name)
            year = year or parsed_year
            month = month or parsed_month

        uploaded_at = entry.get("uploaded_at")
        if not uploaded_at:
            try:
                uploaded_at = datetime.fromtimestamp(os.path.getmtime(path)).isoformat(timespec="seconds")
            except OSError:
                uploaded_at = datetime.now().isoformat(timespec="seconds")

        try:
            with open(path, "rb") as handle:
                payload = handle.read()
        except OSError:
            print("Failed to read:", path)
            errors += 1
            continue

        data_json, data_error = precompute_upload_data(payload, original_name, category)
        if data_error:
            print(f"Processing failed for {original_name}: {data_error}")
            errors += 1
            continue

        try:
            request_json(
                "POST",
                rest_base_url(),
                {
                    "id": normalize_id(entry.get("id")),
                    "original_name": original_name,
                    "stored_name": stored_name,
                    "uploaded_at": uploaded_at,
                    "year": year,
                    "month": month,
                    "category": category,
                    "data_json": data_json,
                },
                {"Prefer": "return=minimal"}
            )
        except Exception as exc:
            print(f"Insert failed for {original_name}: {exc}")
            errors += 1
            continue

        try:
            os.remove(path)
        except OSError:
            print("Inserted but could not delete:", path)
        else:
            print("Migrated and deleted:", original_name)

        migrated += 1

    print(f"Done. Migrated: {migrated}, Skipped: {skipped}, Errors: {errors}")
    return 0 if errors == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
