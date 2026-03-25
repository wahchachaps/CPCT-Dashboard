import json
import math
import os
import re
import uuid
from datetime import datetime, time
from functools import lru_cache
from io import BytesIO

import pandas as pd
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from supabase import Client
from werkzeug.utils import secure_filename

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
UPLOADS_JSON_DIR = os.path.join(UPLOADS_DIR, "json")

if os.path.isfile(ENV_PATH):
    try:
        with open(ENV_PATH, "r", encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except OSError:
        pass

def _read_env(*names):
    for name in names:
        raw = os.environ.get(name)
        if raw is None:
            continue
        value = str(raw).strip()
        if value:
            return value
    return ""


app = Flask(__name__, static_folder=os.path.join(BASE_DIR, "frontend", "static"))
app.secret_key = os.environ.get("SECRET_KEY", "supersecretkey")
if os.environ.get("SESSION_COOKIE_SECURE", "") == "1":
    app.config["SESSION_COOKIE_SECURE"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
SUPABASE_URL = _read_env("SUPABASE_URL", "SUPABASE_PROJECT_URL")
SUPABASE_SERVICE_ROLE_KEY = _read_env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY")
DATABASE_URL = _read_env("DATABASE_URL")
SUPABASE_CONFIG_MESSAGE = (
    "Supabase is not configured on the server. "
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
)
KW_DEL_REQUIRED_MESSAGE = (
    "KW_DEL data columns not found. Switch the Pivot Field List values to KW_DEL "
    "(not KWH_DEL) before exporting the file."
)
KW_DEL_REUPLOAD_MESSAGE = (
    "No kW data found for this file. Switch the Pivot Field List values to KW_DEL "
    "(not KWH_DEL) and re-upload the file."
)
SYSTEM_LOSS_VALUE_ROW = 44
SYSTEM_LOSS_PERCENT_ROW = 54
ALLOWED_EXTENSIONS = {".xlsx", ".xls", ".csv"}
MONTH_ALIASES = [
    ("january", 1), ("jan", 1),
    ("february", 2), ("feb", 2), ("febuary", 2), ("feburary", 2), ("febuarary", 2),
    ("march", 3), ("mar", 3),
    ("april", 4), ("apr", 4),
    ("may", 5),
    ("june", 6), ("jun", 6),
    ("july", 7), ("jul", 7),
    ("august", 8), ("aug", 8),
    ("september", 9), ("sep", 9), ("sept", 9),
    ("october", 10), ("oct", 10),
    ("november", 11), ("nov", 11),
    ("december", 12), ("dec", 12)
]
MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]

CATEGORY_OPTIONS = {
    "edd": "EDD Report",
    "hourly": "Hourly Loading (Legacy)",
    "hourly_kwh": "Hourly Loading (kWh)",
    "hourly_kw": "Hourly Loading (kW)",
    "other": "Other"
}

_supabase_client = None


def supabase_enabled():
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)


def get_request_token():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            return token
    token = request.headers.get("X-Access-Token", "") or request.args.get("access_token", "")
    token = token.strip()
    return token or None


def get_supabase() -> "Client":
    global _supabase_client
    if _supabase_client is None:
        if not supabase_enabled():
            raise RuntimeError(SUPABASE_CONFIG_MESSAGE)
        try:
            from supabase import create_client
        except ImportError as exc:
            raise RuntimeError("Supabase client library is not installed.") from exc
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _supabase_client


def load_manifest(include_data=False):
    if not supabase_enabled():
        return []
    columns = "*"
    if not include_data:
        columns = "id,original_name,stored_name,uploaded_at,year,month,category,uploaded_by"
    try:
        response = get_supabase().table("uploads").select(columns).order("uploaded_at", desc=True).execute()
        data = response.data if hasattr(response, "data") else response.get("data", [])
        return data or []
    except Exception:
        return []


def fetch_upload(upload_id):
    if not supabase_enabled():
        return None
    try:
        response = get_supabase().table("uploads").select("*").eq("id", upload_id).limit(1).execute()
        data = response.data if hasattr(response, "data") else response.get("data", [])
        return data[0] if data else None
    except Exception:
        return None


def insert_upload(entry):
    response = get_supabase().table("uploads").insert(entry).execute()
    data = response.data if hasattr(response, "data") else response.get("data", [])
    return data[0] if data else None


def delete_upload_entry(upload_id):
    get_supabase().table("uploads").delete().eq("id", upload_id).execute()


def get_current_user():
    if not supabase_enabled():
        return None
    session_token = session.get("access_token")
    header_token = get_request_token()
    token = session_token or header_token
    if not token:
        return None

    def lookup_user(access_token):
        response = get_supabase().auth.get_user(access_token)
        if hasattr(response, "user"):
            return response.user
        if isinstance(response, dict):
            return response.get("user")
        return None

    if session_token:
        try:
            user = lookup_user(session_token)
            if user:
                return user
        except Exception:
            session.pop("access_token", None)
            session.pop("refresh_token", None)
            session_token = None

    if header_token and header_token != session_token:
        try:
            return lookup_user(header_token)
        except Exception:
            return None

    return None


def clear_session():
    session.pop("access_token", None)
    session.pop("refresh_token", None)
    session.pop("user_email", None)
    session.pop("user_id", None)


def format_auth_error(exc):
    if exc is None:
        return "Invalid email or password"
    message = ""
    if hasattr(exc, "message"):
        try:
            message = str(exc.message)
        except Exception:
            message = ""
    if not message:
        if hasattr(exc, "args") and exc.args:
            message = str(exc.args[0])
        else:
            message = str(exc)
    if not message:
        return "Invalid email or password"
    lowered = message.lower()
    if "invalid login credentials" in lowered:
        return "Invalid email or password"
    return message


def wants_json_response():
    if request.method == "DELETE":
        return True
    accept = request.headers.get("Accept", "")
    if "application/json" in accept:
        return True
    requested_with = request.headers.get("X-Requested-With", "")
    if requested_with.lower() in ("xmlhttprequest", "fetch"):
        return True
    if request.args.get("format") == "json":
        return True
    return False


def allowed_file(filename):
    ext = os.path.splitext(filename)[1].lower()
    return ext in ALLOWED_EXTENSIONS


def read_upload_payload(file_storage):
    try:
        return file_storage.read()
    finally:
        try:
            file_storage.close()
        except Exception:
            pass
        try:
            stream = getattr(file_storage, "stream", None)
            if stream and hasattr(stream, "close"):
                stream.close()
        except Exception:
            pass


def get_file_mtime(path):
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0


def get_upload_json_path(stored_name):
    if not stored_name:
        return ""
    return os.path.join(UPLOADS_JSON_DIR, f"{stored_name}.json")


def write_upload_json(stored_name, data_json):
    if not stored_name:
        return None, "Missing stored filename for JSON export."
    os.makedirs(UPLOADS_JSON_DIR, exist_ok=True)
    path = get_upload_json_path(stored_name)
    try:
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(data_json or {}, handle, ensure_ascii=True, separators=(",", ":"))
    except OSError:
        return None, "Unable to save the JSON file."
    return path, None


def load_upload_json(stored_name):
    path = get_upload_json_path(stored_name)
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None


def parse_year_month(filename):
    base = os.path.splitext(filename)[0].lower()
    year_match = re.search(r"(19|20)\d{2}", base)
    year = int(year_match.group()) if year_match else None
    month = None
    for alias, month_num in MONTH_ALIASES:
        if re.search(rf"\b{re.escape(alias)}\b", base):
            month = month_num
            break
    return year, month


def format_timestamp(value):
    if not value:
        return ""
    try:
        dt = datetime.fromisoformat(value)
        return dt.strftime("%b %d, %Y %I:%M %p")
    except ValueError:
        return value


def format_month_label(year, month):
    if not year or not month:
        return ""
    if 1 <= month <= 12:
        return f"{MONTH_NAMES[month - 1]} {year}"
    return str(year)


def format_date_ymd(date_obj):
    if not date_obj:
        return ""
    return date_obj.strftime("%Y-%m-%d")


def format_date_mdy(date_obj):
    if not date_obj:
        return ""
    return date_obj.strftime("%m/%d/%Y")


def format_billing_label(start_date, end_date):
    if not end_date:
        return ""
    month_name = MONTH_NAMES[end_date.month - 1] if 1 <= end_date.month <= 12 else ""
    if start_date:
        return f"{month_name} ({format_date_mdy(start_date)} - {format_date_mdy(end_date)})"
    return month_name


def parse_iso_date(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except ValueError:
        return None


def build_upload_groups(entries):
    enriched = []
    for entry in entries:
        item = dict(entry)
        original = item.get("original_name", "")
        item["display_name"] = os.path.splitext(original)[0] if original else item.get("stored_name", "")
        item["uploaded_at_display"] = format_timestamp(item.get("uploaded_at", ""))
        enriched.append(item)

    groups = {}
    for item in enriched:
        year = item.get("year")
        key = str(year) if year else "Unsorted"
        groups.setdefault(key, []).append(item)

    def item_sort_key(item):
        month = item.get("month") or 0
        uploaded_at = item.get("uploaded_at") or ""
        return (month, uploaded_at)

    for key in groups:
        groups[key].sort(key=item_sort_key, reverse=True)

    year_keys = [key for key in groups if key != "Unsorted"]
    year_keys.sort(key=lambda k: int(k), reverse=True)
    if "Unsorted" in groups:
        year_keys.append("Unsorted")

    return [{"year": key, "items": groups[key]} for key in year_keys]


def build_recent_uploads(entries, limit=4):
    enriched = []
    for entry in entries:
        item = dict(entry)
        original = item.get("original_name", "")
        item["display_name"] = os.path.splitext(original)[0] if original else item.get("stored_name", "")
        item["uploaded_at_display"] = format_timestamp(item.get("uploaded_at", ""))
        enriched.append(item)
    enriched.sort(key=lambda item: item.get("uploaded_at", ""), reverse=True)
    return enriched[:limit]


def build_bootstrap_payload():
    uploads = load_manifest()
    return {
        "upload_groups": build_upload_groups(uploads),
        "recent_uploads": build_recent_uploads(uploads),
        "upload_months": build_upload_months(uploads),
        "upload_months_hourly": build_upload_months(uploads, category="hourly_kwh")
    }


def infer_category_from_name(name):
    lowered = str(name or "").lower()
    if "edd" in lowered:
        return "edd"
    if re.search(r"\bkwh\b", lowered):
        return "hourly_kwh"
    if re.search(r"\bkw\b", lowered):
        return "hourly_kw"
    if "energy" in lowered or "cp" in lowered:
        return "hourly_kwh"
    if "hourly" in lowered:
        return "hourly_kwh"
    return "other"


def get_entry_category(entry):
    category = (entry.get("category") or "").strip().lower()
    if category in CATEGORY_OPTIONS:
        return category
    return infer_category_from_name(entry.get("original_name", ""))


def is_hourly_kwh_entry(entry):
    category = (entry.get("category") or "").strip().lower()
    if category in ("hourly_kwh", "hourly"):
        return True
    if category == "hourly_kw":
        return False
    inferred = infer_category_from_name(entry.get("original_name", ""))
    return inferred in ("hourly_kwh", "hourly")


def is_hourly_kw_entry(entry):
    category = (entry.get("category") or "").strip().lower()
    if category in ("hourly_kw", "hourly"):
        return True
    if category == "hourly_kwh":
        return False
    inferred = infer_category_from_name(entry.get("original_name", ""))
    return inferred in ("hourly_kw",)


def entry_matches_category(entry, category):
    if not category:
        return True
    normalized = category.strip().lower()
    if normalized == "hourly_kwh":
        return is_hourly_kwh_entry(entry)
    if normalized == "hourly_kw":
        return is_hourly_kw_entry(entry)
    return get_entry_category(entry) == normalized


def get_entry_data(entry):
    stored_name = entry.get("stored_name") if isinstance(entry, dict) else None
    file_data = load_upload_json(stored_name)
    if isinstance(file_data, dict):
        return file_data
    raw = entry.get("data_json") if isinstance(entry, dict) else None
    if not raw:
        return {}
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    if isinstance(raw, dict):
        return raw
    return {}


def shift_hourly_series(values):
    if not isinstance(values, list) or len(values) != 24:
        return values
    return values[1:] + values[:1]


def shift_hourly_days(days_map):
    if not isinstance(days_map, dict):
        return days_map
    shifted = {}
    for key, series in days_map.items():
        shifted[key] = shift_hourly_series(series)
    return shifted


def normalize_hourly_payload(entry):
    data = get_entry_data(entry)
    hourly = data.get("hourly") or {}
    version = entry.get("data_version") or 1
    if isinstance(version, str) and version.isdigit():
        version = int(version)
    if version >= 2:
        return hourly

    cp_payload = dict(hourly.get("cp") or {})
    kw_payload = dict(hourly.get("kw") or {})

    if "days" in cp_payload:
        cp_payload["days"] = shift_hourly_days(cp_payload.get("days"))
    if "month_max" in cp_payload:
        cp_payload["month_max"] = shift_hourly_series(cp_payload.get("month_max"))
    if "month_avg" in cp_payload:
        cp_payload["month_avg"] = shift_hourly_series(cp_payload.get("month_avg"))

    if "days" in kw_payload:
        kw_payload["days"] = shift_hourly_days(kw_payload.get("days"))
    if "month_max" in kw_payload:
        kw_payload["month_max"] = shift_hourly_series(kw_payload.get("month_max"))

    return {
        "labels": hourly.get("labels") or build_hour_labels(),
        "cp": cp_payload,
        "kw": kw_payload
    }


def get_kw_days_map(entry):
    hourly = normalize_hourly_payload(entry)
    kw_payload = hourly.get("kw") or {}
    days_map = kw_payload.get("days")
    if not isinstance(days_map, dict) or not days_map:
        return None, KW_DEL_REUPLOAD_MESSAGE
    return days_map, None


def build_hour_labels():
    return [format_hour_label(hour) for hour in range(24)]


def build_days_from_hour_map(day_hour_map):
    days = {}
    for day, hour_map in day_hour_map.items():
        series = []
        for hour in range(24):
            source_hour = (hour + 1) % 24
            value = hour_map.get(source_hour, 0)
            try:
                series.append(float(value))
            except (TypeError, ValueError):
                series.append(0.0)
        days[format_date_ymd(day)] = series
    return days


def compute_hourly_max(days_map):
    if not days_map:
        return []
    max_values = []
    for hour in range(24):
        max_value = None
        for series in days_map.values():
            if not isinstance(series, list) or hour >= len(series):
                continue
            value = series[hour]
            if isinstance(value, (int, float)):
                max_value = value if max_value is None else max(max_value, value)
        max_values.append(float(max_value or 0))
    return max_values


def compute_hourly_min(days_map):
    if not days_map:
        return []
    min_values = []
    for hour in range(24):
        min_value = None
        for series in days_map.values():
            if not isinstance(series, list) or hour >= len(series):
                continue
            value = series[hour]
            if isinstance(value, (int, float)):
                min_value = value if min_value is None else min(min_value, value)
        min_values.append(float(min_value or 0))
    return min_values


def find_peak_day_hour(days_map, peak_type="highest"):
    if not days_map:
        return None, None, None
    normalized_peak = (peak_type or "highest").strip().lower()
    if normalized_peak not in ("lowest", "highest"):
        normalized_peak = "highest"
    best_value = None
    best_day = None
    best_hour = None
    considered_any = False
    for day_key, series in days_map.items():
        if not isinstance(series, list):
            continue
        for hour, value in enumerate(series):
            if not isinstance(value, (int, float)):
                continue
            if normalized_peak == "lowest" and value <= 0:
                continue
            considered_any = True
            if best_value is None:
                best_value = float(value)
                best_day = day_key
                best_hour = hour
                continue
            if normalized_peak == "highest":
                if value > best_value:
                    best_value = float(value)
                    best_day = day_key
                    best_hour = hour
            else:
                if value < best_value:
                    best_value = float(value)
                    best_day = day_key
                    best_hour = hour
    if considered_any:
        return best_day, best_hour, best_value

    best_value = None
    best_day = None
    best_hour = None
    for day_key, series in days_map.items():
        if not isinstance(series, list):
            continue
        for hour, value in enumerate(series):
            if not isinstance(value, (int, float)):
                continue
            if best_value is None or value < best_value:
                best_value = float(value)
                best_day = day_key
                best_hour = hour
    return best_day, best_hour, best_value


def compute_hourly_avg(days_map):
    if not days_map:
        return []
    avg_values = []
    for hour in range(24):
        values = []
        for series in days_map.values():
            if not isinstance(series, list) or hour >= len(series):
                continue
            value = series[hour]
            if isinstance(value, (int, float)):
                values.append(value)
        avg_values.append(float(sum(values) / len(values)) if values else 0.0)
    return avg_values


def filter_days_map(days_map, start_date=None, end_date=None):
    if not start_date or not end_date:
        return days_map
    filtered = {}
    for key, series in days_map.items():
        day = parse_iso_date(key)
        if not day:
            continue
        if start_date <= day <= end_date:
            filtered[key] = series
    return filtered


def compute_cp_day_hour_sums(xl):
    sheet = find_cp_sheet(xl.sheet_names)
    if not sheet:
        return None, "CP sheet not found."
    df = xl.parse(sheet, header=None)
    row_labels_idx = None
    for i in range(len(df)):
        row = df.iloc[i]
        if any(isinstance(x, str) and "Row Labels" in x for x in row.tolist() if pd.notna(x)):
            row_labels_idx = i
            break
    if row_labels_idx is None:
        return None, "Unable to locate the CP data table."

    header_row = df.iloc[row_labels_idx]
    date_columns = []
    for idx, val in enumerate(header_row.tolist()):
        if idx == 0 or pd.isna(val):
            continue
        parsed = None
        if isinstance(val, pd.Timestamp):
            parsed = val
        else:
            try:
                parsed = pd.to_datetime(val, errors="coerce")
            except Exception:
                parsed = None
        if parsed is not None and pd.notna(parsed):
            date_columns.append((idx, parsed.date()))

    if not date_columns:
        return None, "No matching dates found for that month."

    day_hour_sum = {}
    data_rows = df.iloc[row_labels_idx + 1:]
    for _, row in data_rows.iterrows():
        time_val = row.iloc[0]
        hour, minute = parse_time_components(time_val)
        bucket = bucket_end_hour(hour, minute)
        if bucket is None:
            continue
        for col_idx, day in date_columns:
            val = row.iloc[col_idx] if col_idx < len(row) else None
            num = pd.to_numeric(val, errors="coerce")
            if pd.notna(num):
                day_map = day_hour_sum.setdefault(day, {})
                day_map[bucket] = day_map.get(bucket, 0) + float(num)

    return day_hour_sum, None


def compute_cp_hourly_payload(xl):
    day_hour_sum, error = compute_cp_day_hour_sums(xl)
    if error:
        return None, error
    days = build_days_from_hour_map(day_hour_sum)
    if not days:
        return None, "No usable CP data found."
    return {
        "days": days,
        "month_max": compute_hourly_max(days),
        "month_avg": compute_hourly_avg(days)
    }, None


def find_pivot_header_row(df):
    for i in range(len(df)):
        row = df.iloc[i]
        if any(isinstance(x, str) and "row labels" in x.lower() for x in row.tolist() if pd.notna(x)):
            return i
    return None


def _score_kw_measure_tokens(preview):
    score = 0
    for val in preview.values.flatten():
        if pd.isna(val):
            continue
        text = str(val).upper()
        if "KWH_DEL" in text:
            score -= 5
        if "KW_DEL" in text and "KWH_DEL" not in text:
            score += 5
    return score


def find_hourly_pivot_sheet(xl, target_year=None, target_month=None, prefer_kw=False):
    candidates = []
    for sheet in xl.sheet_names:
        preview = xl.parse(sheet, header=None, nrows=40)
        header_idx = find_pivot_header_row(preview)
        if header_idx is None:
            continue
        header_row = preview.iloc[header_idx]
        date_columns = []
        for idx, val in enumerate(header_row.tolist()):
            if idx == 0 or pd.isna(val):
                continue
            try:
                parsed = val if isinstance(val, pd.Timestamp) else pd.to_datetime(val, errors="coerce")
            except Exception:
                parsed = None
            if parsed is not None and pd.notna(parsed):
                date_columns.append(idx)
        if not date_columns:
            continue
        score = _score_kw_measure_tokens(preview)
        lower = sheet.lower()
        if "kwh" in lower:
            score -= 2
        elif "kw" in lower:
            score += 2
        if "demand" in lower:
            score += 1
        if match_month_in_name(sheet, target_year, target_month):
            score += 1
        candidates.append((sheet, header_idx, len(date_columns), score))

    if not candidates:
        return None, None

    if prefer_kw:
        sheet, header_idx, _, _ = max(candidates, key=lambda item: (item[3], item[2]))
        return sheet, header_idx

    for sheet, header_idx, _, _ in candidates:
        if match_month_in_name(sheet, target_year, target_month):
            return sheet, header_idx

    for sheet, header_idx, _, _ in candidates:
        lowered = sheet.lower()
        if "cp" in lowered or "energy" in lowered:
            return sheet, header_idx

    sheet, header_idx, _, _ = max(candidates, key=lambda item: item[2])
    return sheet, header_idx


def compute_kw_pivot_day_hour_max(xl, target_year=None, target_month=None):
    sheet, header_idx = find_hourly_pivot_sheet(xl, target_year, target_month, prefer_kw=True)
    if not sheet:
        return None, "Hourly Loading pivot data not found."

    df = xl.parse(sheet, header=None)
    header_row = df.iloc[header_idx]
    date_columns = []
    for idx, val in enumerate(header_row.tolist()):
        if idx == 0 or pd.isna(val):
            continue
        try:
            parsed = val if isinstance(val, pd.Timestamp) else pd.to_datetime(val, errors="coerce")
        except Exception:
            parsed = None
        if parsed is not None and pd.notna(parsed):
            date_columns.append((idx, parsed.date()))

    if not date_columns:
        return None, "No matching dates found for that month."

    day_hour_max = {}
    data_rows = df.iloc[header_idx + 1:]
    for _, row in data_rows.iterrows():
        time_val = row.iloc[0]
        hour, minute = parse_time_components(time_val)
        bucket = bucket_end_hour_kw(hour, minute)
        if bucket is None:
            continue
        for col_idx, day in date_columns:
            val = row.iloc[col_idx] if col_idx < len(row) else None
            num = pd.to_numeric(val, errors="coerce")
            if pd.notna(num):
                day_map = day_hour_max.setdefault(day, {})
                value = float(num)
                current = day_map.get(bucket)
                if current is None or value > current:
                    day_map[bucket] = value

    if not day_hour_max:
        return None, "No usable data found for that month."

    return day_hour_max, None


def compute_kw_hourly_payload(xl):
    day_hour_max, pivot_error = compute_kw_pivot_day_hour_max(xl)
    if not pivot_error:
        days = build_days_from_hour_map(day_hour_max)
        if not days:
            return None, "No usable data found for that month."
        return {
            "days": days,
            "month_max": compute_hourly_max(days)
        }, None

    df, sheet, error = load_kw_sheet(xl)
    if error:
        return None, pivot_error or error

    date_col, time_col, kw_col, col_error = get_kw_columns(df)
    if col_error:
        return None, col_error

    date_series = pd.to_datetime(df[date_col], errors="coerce")
    if not date_series.notna().any():
        return None, "No usable data found for that month."

    sein_col = None
    for col in df.columns:
        if str(col).strip().upper() == "SEIN":
            sein_col = col
            break
    has_multi_sein = False
    if sein_col is not None:
        try:
            unique_sein = df[sein_col].dropna().unique()
            has_multi_sein = len(unique_sein) > 1
        except Exception:
            has_multi_sein = False

    day_hour_max = {}
    if has_multi_sein:
        summed_by_stamp = {}
        for idx, date_val in date_series.items():
            if pd.isna(date_val):
                continue
            hour, minute = parse_time_components(df.at[idx, time_col])
            if hour is None or minute is None:
                continue
            num = pd.to_numeric(df.at[idx, kw_col], errors="coerce")
            if pd.isna(num):
                continue
            key = (date_val.date(), hour, minute)
            summed_by_stamp[key] = summed_by_stamp.get(key, 0.0) + float(num)

        for (day, hour, minute), value in summed_by_stamp.items():
            bucket = bucket_end_hour_kw(hour, minute)
            if bucket is None:
                continue
            day_map = day_hour_max.setdefault(day, {})
            current = day_map.get(bucket)
            if current is None or value > current:
                day_map[bucket] = value
    else:
        for idx, date_val in date_series.items():
            if pd.isna(date_val):
                continue
            hour, minute = parse_time_components(df.at[idx, time_col])
            bucket = bucket_end_hour_kw(hour, minute)
            if bucket is None:
                continue
            num = pd.to_numeric(df.at[idx, kw_col], errors="coerce")
            if pd.isna(num):
                continue
            day = date_val.date()
            day_map = day_hour_max.setdefault(day, {})
            value = float(num)
            current = day_map.get(bucket)
            if current is None or value > current:
                day_map[bucket] = value

    days = build_days_from_hour_map(day_hour_max)
    if not days:
        return None, "No usable data found for that month."
    return {
        "days": days,
        "month_max": compute_hourly_max(days)
    }, None


def extract_kwhr_purchase_from_xl(xl):
    sheet = find_kwhr_purchase_sheet(xl.sheet_names)
    if not sheet:
        return None, "KWhr Purchase sheet not found."

    df = xl.parse(sheet, header=None)
    header_idx = None
    for i in range(len(df)):
        row = df.iloc[i]
        values = [str(val).lower() for val in row.tolist() if pd.notna(val)]
        if any("raw mq" in val for val in values) and any("total amq" in val for val in values):
            header_idx = i
            break
    if header_idx is None:
        return None, "Unable to locate the KWhr Purchase table."

    header_row = df.iloc[header_idx].tolist()
    columns = []
    for idx, val in enumerate(header_row):
        if pd.notna(val):
            columns.append(str(val).strip())
        elif idx == 0:
            columns.append("Substation")
        else:
            columns.append(f"col_{idx}")

    data = df.iloc[header_idx + 1:].copy()
    data.columns = columns
    if "Substation" not in data.columns:
        data.insert(0, "Substation", df.iloc[header_idx + 1:, 0])

    def is_valid_row(name):
        text = str(name or "").strip().lower()
        if not text:
            return False
        blocked = ("total", "previous", "increase", "contestable", "island")
        return not text.startswith(blocked)

    data = data[data["Substation"].apply(is_valid_row)]

    metric_candidates = [
        "TOTAL AMQ",
        "NGCP  - Billing Determinant Energy (BDE)",
        "Adjusted MQ",
        "Raw MQ"
    ]
    metric_col = next((col for col in metric_candidates if col in data.columns), None)
    if not metric_col:
        return None, "No usable metric column found."

    values = pd.to_numeric(data[metric_col], errors="coerce")
    data = data[values.notna()]
    values = values.loc[data.index]

    labels = data["Substation"].astype(str).tolist()
    series = [float(val) for val in values.tolist()]

    return {
        "labels": labels,
        "values": series,
        "metric": metric_col
    }, None


def extract_peak_load_from_xl(xl):
    sheet = find_edd_sheet(xl.sheet_names)
    if not sheet:
        return None, "EDD sheet not found."

    df = xl.parse(sheet, header=None)

    month_col = find_for_month_column(df)

    peak_row = None
    for i in range(len(df)):
        row = df.iloc[i]
        for val in row.tolist():
            if isinstance(val, str) and "peak load" in val.lower():
                peak_row = i
                break
        if peak_row is not None:
            break

    if peak_row is None:
        return None, "Peak Load row not found."

    row = df.iloc[peak_row].tolist()
    if month_col is not None and month_col < len(row):
        value = parse_numeric_cell(row[month_col])
    else:
        value = None
        for val in row:
            num = parse_numeric_cell(val)
            if num is not None:
                value = num
                break

    if value is None:
        return None, "Peak Load value not found."

    return float(value), None


def extract_system_loss_from_xl(
    xl,
    value_row=SYSTEM_LOSS_VALUE_ROW,
    percent_row=SYSTEM_LOSS_PERCENT_ROW
):
    sheet = find_edd_sheet(xl.sheet_names)
    if not sheet:
        return None, "EDD sheet not found."

    df = xl.parse(sheet, header=None)
    month_col = find_for_month_column(df)

    def read_row(row_number):
        if not row_number or row_number < 1 or row_number > len(df):
            return None
        row = df.iloc[row_number - 1].tolist()
        if month_col is not None and month_col < len(row):
            num = parse_numeric_cell(row[month_col])
            if num is not None:
                return num
        for cell in row:
            num = parse_numeric_cell(cell)
            if num is not None:
                return num
        return None

    value = read_row(value_row)
    percent = read_row(percent_row)
    percent = normalize_percent_value(percent)

    if value is None:
        return None, f"System Loss value not found in row {value_row}."
    if percent is None:
        return None, f"System Loss percent not found in row {percent_row}."

    return {
        "value": float(value),
        "percent": float(percent)
    }, None


def precompute_upload_data(file_bytes, filename, category):
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".csv" and category in ("hourly", "hourly_kwh", "hourly_kw", "edd"):
        return None, "This chart requires an Excel file."
    try:
        xl = pd.ExcelFile(BytesIO(file_bytes))
    except Exception:
        return None, "Unable to read Excel file."

    if category == "hourly":
        labels = build_hour_labels()
        cp_payload, cp_error = compute_cp_hourly_payload(xl)
        if cp_error:
            return None, cp_error
        kw_payload, kw_error = compute_kw_hourly_payload(xl)
        if kw_error:
            return None, kw_error
        return {
            "hourly": {
                "labels": labels,
                "cp": cp_payload,
                "kw": kw_payload
            }
        }, None
    if category == "hourly_kwh":
        labels = build_hour_labels()
        cp_payload, cp_error = compute_cp_hourly_payload(xl)
        if cp_error:
            return None, cp_error
        return {
            "hourly": {
                "labels": labels,
                "cp": cp_payload,
                "kw": {}
            }
        }, None
    if category == "hourly_kw":
        labels = build_hour_labels()
        kw_payload, kw_error = compute_kw_hourly_payload(xl)
        if kw_error:
            return None, kw_error
        return {
            "hourly": {
                "labels": labels,
                "cp": {},
                "kw": kw_payload
            }
        }, None

    if category == "edd":
        kwhr_payload, kwhr_error = extract_kwhr_purchase_from_xl(xl)
        if kwhr_error:
            return None, kwhr_error
        peak_value, peak_error = extract_peak_load_from_xl(xl)
        if peak_error:
            return None, peak_error
        system_loss, system_loss_error = extract_system_loss_from_xl(xl)
        if system_loss_error:
            return None, system_loss_error
        return {
            "edd_purchase": kwhr_payload,
            "peak_load": peak_value,
            "system_loss_value": system_loss.get("value"),
            "system_loss_percent": system_loss.get("percent")
        }, None

    return {}, None


def build_upload_months(entries, category=None):
    enriched = []
    for entry in entries:
        if category and not entry_matches_category(entry, category):
            continue
        item = dict(entry)
        item["display_name"] = os.path.splitext(item.get("original_name", ""))[0] or item.get("stored_name", "")
        enriched.append(item)

    month_map = {}
    other_entries = []
    for item in enriched:
        year = item.get("year")
        month = item.get("month")
        if not year or not month:
            parsed_year, parsed_month = parse_year_month(item.get("original_name", ""))
            year = year or parsed_year
            month = month or parsed_month
        if year and month:
            key = (year, month)
            existing = month_map.get(key)
            if not existing or item.get("uploaded_at", "") > existing.get("uploaded_at", ""):
                month_map[key] = item
        else:
            other_entries.append(item)

    month_items = []
    for (year, month) in sorted(month_map.keys(), reverse=True):
        item = month_map[(year, month)]
        month_items.append({
            "id": item.get("id"),
            "label": format_month_label(year, month),
            "uploaded_at": item.get("uploaded_at", ""),
            "display_name": item.get("display_name", "")
        })

    other_entries.sort(key=lambda item: item.get("uploaded_at", ""), reverse=True)
    for item in other_entries:
        month_items.append({
            "id": item.get("id"),
            "label": item.get("display_name") or "Unknown",
            "uploaded_at": item.get("uploaded_at", ""),
            "display_name": item.get("display_name", "")
        })

    return month_items


def find_kwhr_purchase_sheet(sheet_names):
    for name in sheet_names:
        lower = name.lower()
        if "kwhr purchase" in lower or "kwhr purchases" in lower or "kwh purchase" in lower:
            return name
    return None


def find_cp_sheet(sheet_names):
    for name in sheet_names:
        lower = name.lower().strip()
        if lower.startswith("cp "):
            return name
    for name in sheet_names:
        lower = name.lower().strip()
        if lower == "energy":
            return name
    for name in sheet_names:
        lower = name.lower()
        if "cp" in lower and "january" in lower:
            return name
    for name in sheet_names:
        lower = name.lower()
        if "cp" in lower:
            return name
    return None


def find_edd_sheet(sheet_names):
    for name in sheet_names:
        lower = name.lower()
        if lower.startswith("edd"):
            return name
    for name in sheet_names:
        lower = name.lower()
        if "edd" in lower:
            return name
    return None


def find_for_month_column(df):
    header_idx = None
    for i in range(len(df)):
        row = df.iloc[i]
        values = [str(val).lower() for val in row.tolist() if pd.notna(val)]
        if any("for the month" in val for val in values):
            header_idx = i
            break
    if header_idx is None:
        return None
    for idx, val in enumerate(df.iloc[header_idx].tolist()):
        if isinstance(val, str) and "for the month" in val.lower():
            return idx
    return None


def parse_numeric_cell(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        cleaned = cleaned.replace(",", "")
        if cleaned.endswith("%"):
            cleaned = cleaned[:-1].strip()
        if cleaned.startswith("(") and cleaned.endswith(")"):
            cleaned = f"-{cleaned[1:-1]}"
        num = pd.to_numeric(cleaned, errors="coerce")
    else:
        num = pd.to_numeric(value, errors="coerce")
    if pd.isna(num):
        return None
    return float(num)


def normalize_percent_value(value):
    num = parse_numeric_cell(value)
    if num is None:
        return None
    abs_num = abs(num)
    if 0 < abs_num <= 1:
        return num * 100
    if abs_num > 100 and abs_num <= 10000:
        return num / 100
    return num


def match_month_in_name(name, target_year=None, target_month=None):
    if not target_year and not target_month:
        return False
    lowered = str(name or "").lower()
    if target_year and str(target_year) not in lowered:
        return False
    if target_month:
        month_name = MONTH_NAMES[target_month - 1].lower() if 1 <= target_month <= 12 else ""
        if month_name and month_name in lowered:
            return True
        for alias, month_num in MONTH_ALIASES:
            if month_num == target_month and alias in lowered:
                return True
        return False
    return True


def find_kw_header_row(df):
    for i in range(min(len(df), 12)):
        row = df.iloc[i]
        tokens = [str(val).strip().upper() for val in row.tolist() if pd.notna(val)]
        has_kw = any("KW_DEL" in token for token in tokens)
        has_time = any(token == "TIME" or "TIME" in token for token in tokens)
        has_date = any(token in ("BDATE", "DATE") or "BDATE" in token or token == "DATE" for token in tokens)
        if has_kw and has_time and has_date:
            return i
    return None


def find_kw_sheet(xl, target_year=None, target_month=None):
    candidates = []
    for sheet in xl.sheet_names:
        preview = xl.parse(sheet, header=None, nrows=12)
        header_idx = find_kw_header_row(preview)
        if header_idx is None:
            continue
        has_multi_sein = False
        try:
            sample = xl.parse(sheet, header=header_idx, nrows=200)
            sein_col = None
            for col in sample.columns:
                if str(col).strip().upper() == "SEIN":
                    sein_col = col
                    break
            if sein_col:
                unique_sein = sample[sein_col].dropna().unique()
                has_multi_sein = len(unique_sein) > 1
        except Exception:
            has_multi_sein = False
        candidates.append((sheet, header_idx, has_multi_sein))

    if not candidates:
        return None, None

    for sheet, header_idx, _ in candidates:
        if match_month_in_name(sheet, target_year, target_month):
            return sheet, header_idx

    for sheet, header_idx, has_multi in candidates:
        if has_multi:
            return sheet, header_idx

    return candidates[0][0], candidates[0][1]


def load_kw_sheet(xl, target_year=None, target_month=None):
    sheet, header_idx = find_kw_sheet(xl, target_year, target_month)
    if not sheet:
        return None, None, "KW data sheet not found."
    df = xl.parse(sheet, header=header_idx)
    return df, sheet, None


def get_kw_columns(df):
    columns = {str(col).strip().upper(): col for col in df.columns}
    date_col = columns.get("BDATE") or columns.get("DATE")
    time_col = columns.get("TIME")
    kw_col = columns.get("KW_DEL")
    if not kw_col:
        for key, col in columns.items():
            if "KW_DEL" in key:
                kw_col = col
                break
    if not date_col or not time_col or not kw_col:
        return None, None, None, KW_DEL_REQUIRED_MESSAGE
    return date_col, time_col, kw_col, None


@lru_cache(maxsize=24)
def _load_kw_base(file_path, mtime, target_year=None, target_month=None):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return None, None, None, None, "Hourly Loading requires an Excel file."
    try:
        xl = pd.ExcelFile(file_path)
    except Exception:
        return None, None, None, None, "Unable to read Excel file."

    df, sheet, error = load_kw_sheet(xl, target_year, target_month)
    if error:
        return None, None, None, None, error

    date_col, time_col, kw_col, col_error = get_kw_columns(df)
    if col_error:
        return None, None, None, None, col_error

    date_series = pd.to_datetime(df[date_col], errors="coerce")
    time_series = pd.to_datetime(df[time_col].astype(str), format="%H:%M:%S", errors="coerce")
    kw_series = pd.to_numeric(df[kw_col], errors="coerce")

    return date_series, time_series, kw_series, sheet, None


def extract_kwhr_purchase_data(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return None, "KWhr Purchase chart requires an Excel file."
    try:
        xl = pd.ExcelFile(file_path)
    except Exception:
        return None, "Unable to read Excel file."

    sheet = find_kwhr_purchase_sheet(xl.sheet_names)
    if not sheet:
        return None, "KWhr Purchase sheet not found."

    df = xl.parse(sheet, header=None)
    header_idx = None
    for i in range(len(df)):
        row = df.iloc[i]
        values = [str(val).lower() for val in row.tolist() if pd.notna(val)]
        if any("raw mq" in val for val in values) and any("total amq" in val for val in values):
            header_idx = i
            break
    if header_idx is None:
        return None, "Unable to locate the KWhr Purchase table."

    header_row = df.iloc[header_idx].tolist()
    columns = []
    for idx, val in enumerate(header_row):
        if pd.notna(val):
            columns.append(str(val).strip())
        elif idx == 0:
            columns.append("Substation")
        else:
            columns.append(f"col_{idx}")

    data = df.iloc[header_idx + 1:].copy()
    data.columns = columns
    if "Substation" not in data.columns:
        data.insert(0, "Substation", df.iloc[header_idx + 1:, 0])

    def is_valid_row(name):
        text = str(name or "").strip().lower()
        if not text:
            return False
        blocked = ("total", "previous", "increase", "contestable", "island")
        return not text.startswith(blocked)

    data = data[data["Substation"].apply(is_valid_row)]

    metric_candidates = [
        "TOTAL AMQ",
        "NGCP  - Billing Determinant Energy (BDE)",
        "Adjusted MQ",
        "Raw MQ"
    ]
    metric_col = next((col for col in metric_candidates if col in data.columns), None)
    if not metric_col:
        return None, "No usable metric column found."

    values = pd.to_numeric(data[metric_col], errors="coerce")
    data = data[values.notna()]
    values = values.loc[data.index]

    labels = data["Substation"].astype(str).tolist()
    series = values.tolist()

    return {
        "labels": labels,
        "values": series,
        "metric": metric_col,
        "sheet": sheet
    }, None


def parse_time_components(value):
    if isinstance(value, pd.Timestamp):
        return value.hour, value.minute
    if isinstance(value, time):
        return value.hour, value.minute
    if hasattr(value, "hour") and hasattr(value, "minute"):
        try:
            return int(value.hour), int(value.minute)
        except Exception:
            pass
    try:
        num = float(value)
        if math.isfinite(num):
            frac = num % 1
            total_minutes = int(round(frac * 24 * 60)) % (24 * 60)
            return total_minutes // 60, total_minutes % 60
    except (TypeError, ValueError):
        pass
    try:
        text = str(value).strip()
        if not text:
            return None, None
        parsed = pd.to_datetime(text, errors="coerce")
        if pd.notna(parsed):
            return int(parsed.hour), int(parsed.minute)
    except Exception:
        return None, None
    return None, None


def bucket_end_hour(hour, minute):
    if hour is None or minute is None:
        return None
    if minute == 0:
        return hour
    return (hour + 1) % 24


def bucket_end_hour_kw(hour, minute):
    if hour is None or minute is None:
        return None
    if minute < 5:
        return hour
    return (hour + 1) % 24


def format_hour_label(hour):
    return f"{hour + 1}:00"


def extract_cp_hourly_data(file_path, target_year=None, target_month=None):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return None, "Hourly Loading requires an Excel file."
    try:
        xl = pd.ExcelFile(file_path)
    except Exception:
        return None, "Unable to read Excel file."

    sheet = find_cp_sheet(xl.sheet_names)
    if not sheet:
        return None, "CP sheet not found."

    df = xl.parse(sheet, header=None)
    row_labels_idx = None
    for i in range(len(df)):
        row = df.iloc[i]
        if any(isinstance(x, str) and "Row Labels" in x for x in row.tolist() if pd.notna(x)):
            row_labels_idx = i
            break
    if row_labels_idx is None:
        return None, "Unable to locate the CP data table."

    header_row = df.iloc[row_labels_idx]
    date_columns = []
    for idx, val in enumerate(header_row.tolist()):
        if idx == 0 or pd.isna(val):
            continue
        parsed = None
        if isinstance(val, pd.Timestamp):
            parsed = val
        else:
            try:
                parsed = pd.to_datetime(val, errors="coerce")
            except Exception:
                parsed = None
        if parsed is not None and pd.notna(parsed):
            date_columns.append((idx, parsed))

    if target_year and target_month:
        date_columns = [
            (idx, dt) for idx, dt in date_columns
            if dt.year == target_year and dt.month == target_month
        ]

    if not date_columns:
        return None, "No matching dates found for that period."

    hour_buckets = {hour: [] for hour in range(24)}
    data_rows = df.iloc[row_labels_idx + 1:]
    for _, row in data_rows.iterrows():
        time_val = row.iloc[0]
        hour, minute = parse_time_components(time_val)
        bucket = bucket_end_hour(hour, minute)
        if bucket is None or bucket not in hour_buckets:
            continue
        values = []
        for col_idx, _ in date_columns:
            val = row.iloc[col_idx] if col_idx < len(row) else None
            num = pd.to_numeric(val, errors="coerce")
            if pd.notna(num):
                values.append(float(num))
        if not values:
            continue
        hour_buckets[bucket].append(sum(values) / len(values))

    labels = [format_hour_label(hour) for hour in range(24)]
    series = []
    for hour in range(24):
        bucket = hour_buckets.get(hour, [])
        if bucket:
            series.append(sum(bucket))
        else:
            series.append(0)

    return {
        "labels": labels,
        "values": series,
        "metric": "Energy (kWh)",
        "sheet": sheet
    }, None


def extract_cp_available_dates(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return None, "Hourly Loading requires an Excel file."
    try:
        xl = pd.ExcelFile(file_path)
    except Exception:
        return None, "Unable to read Excel file."

    sheet = find_cp_sheet(xl.sheet_names)
    if not sheet:
        return None, "CP sheet not found."

    df = xl.parse(sheet, header=None)
    row_labels_idx = None
    for i in range(len(df)):
        row = df.iloc[i]
        if any(isinstance(x, str) and "Row Labels" in x for x in row.tolist() if pd.notna(x)):
            row_labels_idx = i
            break
    if row_labels_idx is None:
        return None, "Unable to locate the CP data table."

    header_row = df.iloc[row_labels_idx]
    dates = []
    for val in header_row.tolist():
        if pd.isna(val) or isinstance(val, str):
            continue
        parsed = None
        if isinstance(val, pd.Timestamp):
            parsed = val
        else:
            try:
                parsed = pd.to_datetime(val, errors="coerce")
            except Exception:
                parsed = None
        if parsed is not None and pd.notna(parsed):
            dates.append(parsed.date())

    if not dates:
        return None, "No matching dates found."

    return sorted(set(dates)), None


def extract_cp_available_days(file_path, start_date=None, end_date=None):
    dates, error = extract_cp_available_dates(file_path)
    if error:
        return None, error
    if start_date and end_date:
        dates = [d for d in dates if start_date <= d <= end_date]
    if not dates:
        return None, "No matching dates found."
    return [format_date_ymd(d) for d in dates], None


def extract_cp_available_months(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return None, "Hourly Loading requires an Excel file."
    try:
        xl = pd.ExcelFile(file_path)
    except Exception:
        return None, "Unable to read Excel file."

    sheet = find_cp_sheet(xl.sheet_names)
    if not sheet:
        return None, "CP sheet not found."

    df = xl.parse(sheet, header=None)
    row_labels_idx = None
    for i in range(len(df)):
        row = df.iloc[i]
        if any(isinstance(x, str) and "Row Labels" in x for x in row.tolist() if pd.notna(x)):
            row_labels_idx = i
            break
    if row_labels_idx is None:
        return None, "Unable to locate the CP data table."

    header_row = df.iloc[row_labels_idx]
    months = set()
    for val in header_row.tolist():
        if pd.isna(val) or isinstance(val, str):
            continue
        parsed = None
        if isinstance(val, pd.Timestamp):
            parsed = val
        else:
            try:
                parsed = pd.to_datetime(val, errors="coerce")
            except Exception:
                parsed = None
        if parsed is not None and pd.notna(parsed):
            months.add((parsed.year, parsed.month))

    if not months:
        return None, "No dates found in CP sheet."

    return sorted(months), None


def extract_cp_hourly_day_data(file_path, target_year, target_month, target_day):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return None, "Hourly Loading requires an Excel file."
    try:
        xl = pd.ExcelFile(file_path)
    except Exception:
        return None, "Unable to read Excel file."

    sheet = find_cp_sheet(xl.sheet_names)
    if not sheet:
        return None, "CP sheet not found."

    df = xl.parse(sheet, header=None)
    row_labels_idx = None
    for i in range(len(df)):
        row = df.iloc[i]
        if any(isinstance(x, str) and "Row Labels" in x for x in row.tolist() if pd.notna(x)):
            row_labels_idx = i
            break
    if row_labels_idx is None:
        return None, "Unable to locate the CP data table."

    header_row = df.iloc[row_labels_idx]
    target_col = None
    for idx, val in enumerate(header_row.tolist()):
        if idx == 0 or pd.isna(val):
            continue
        parsed = None
        if isinstance(val, pd.Timestamp):
            parsed = val
        else:
            try:
                parsed = pd.to_datetime(val, errors="coerce")
            except Exception:
                parsed = None
        if parsed is None or pd.isna(parsed):
            continue
        if parsed.year == target_year and parsed.month == target_month and parsed.day == target_day:
            target_col = idx
            break

    if target_col is None:
        return None, "Selected day not found in the file."

    hour_buckets = {hour: [] for hour in range(24)}
    data_rows = df.iloc[row_labels_idx + 1:]
    for _, row in data_rows.iterrows():
        time_val = row.iloc[0]
        hour, minute = parse_time_components(time_val)
        bucket = bucket_end_hour(hour, minute)
        if bucket is None or bucket not in hour_buckets:
            continue
        val = row.iloc[target_col] if target_col < len(row) else None
        num = pd.to_numeric(val, errors="coerce")
        if pd.notna(num):
            hour_buckets[bucket].append(float(num))

    labels = [format_hour_label(hour) for hour in range(24)]
    series = []
    for hour in range(24):
        bucket = hour_buckets.get(hour, [])
        if bucket:
            series.append(sum(bucket))
        else:
            series.append(0)

    return {
        "labels": labels,
        "values": series,
        "metric": "Energy (kWh)",
        "sheet": sheet
    }, None


def extract_cp_hourly_month_max(file_path, target_year=None, target_month=None, start_date=None, end_date=None):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return None, "Hourly Loading requires an Excel file."
    try:
        xl = pd.ExcelFile(file_path)
    except Exception:
        return None, "Unable to read Excel file."

    sheet = find_cp_sheet(xl.sheet_names)
    if not sheet:
        return None, "CP sheet not found."

    df = xl.parse(sheet, header=None)
    row_labels_idx = None
    for i in range(len(df)):
        row = df.iloc[i]
        if any(isinstance(x, str) and "Row Labels" in x for x in row.tolist() if pd.notna(x)):
            row_labels_idx = i
            break
    if row_labels_idx is None:
        return None, "Unable to locate the CP data table."

    header_row = df.iloc[row_labels_idx]
    date_columns = []
    for idx, val in enumerate(header_row.tolist()):
        if idx == 0 or pd.isna(val):
            continue
        parsed = None
        if isinstance(val, pd.Timestamp):
            parsed = val
        else:
            try:
                parsed = pd.to_datetime(val, errors="coerce")
            except Exception:
                parsed = None
        if parsed is None or pd.isna(parsed):
            continue
        parsed_date = parsed.date()
        if start_date and end_date:
            if parsed_date < start_date or parsed_date > end_date:
                continue
        elif target_year and target_month:
            if parsed.year != target_year or parsed.month != target_month:
                continue
        date_columns.append((idx, parsed_date))

    if not date_columns:
        return None, "No matching dates found for that month."

    day_hour_sum = {}
    data_rows = df.iloc[row_labels_idx + 1:]
    for _, row in data_rows.iterrows():
        time_val = row.iloc[0]
        hour, minute = parse_time_components(time_val)
        bucket = bucket_end_hour(hour, minute)
        if bucket is None:
            continue
        for col_idx, day in date_columns:
            val = row.iloc[col_idx] if col_idx < len(row) else None
            num = pd.to_numeric(val, errors="coerce")
            if pd.notna(num):
                day_map = day_hour_sum.setdefault(day, {})
                day_map[bucket] = day_map.get(bucket, 0) + float(num)

    labels = [format_hour_label(hour) for hour in range(24)]
    values = []
    for hour in range(24):
        max_value = None
        for day_map in day_hour_sum.values():
            if hour in day_map:
                max_value = day_map[hour] if max_value is None else max(max_value, day_map[hour])
        values.append(max_value or 0)

    return {
        "labels": labels,
        "values": values,
        "metric": "Energy (kWh)",
        "sheet": sheet
    }, None


def extract_kw_available_dates(file_path):
    date_series, _, _, _, error = _load_kw_base(file_path, get_file_mtime(file_path))
    if error:
        return None, error

    dates = sorted(set(date_series.dropna().dt.date))
    if not dates:
        return None, "No matching dates found."

    return dates, None


def extract_kw_available_days(file_path, start_date=None, end_date=None):
    dates, error = extract_kw_available_dates(file_path)
    if error:
        return None, error
    if start_date and end_date:
        dates = [d for d in dates if start_date <= d <= end_date]
    if not dates:
        return None, "No matching dates found."
    return [format_date_ymd(d) for d in dates], None


def extract_kw_hourly_day_data(file_path, target_year, target_month, target_day):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return None, "Hourly Loading requires an Excel file."
    try:
        xl = pd.ExcelFile(file_path)
    except Exception:
        return None, "Unable to read Excel file."

    df, sheet, error = load_kw_sheet(xl, target_year, target_month)
    if error:
        return None, error

    date_col, time_col, kw_col, col_error = get_kw_columns(df)
    if col_error:
        return None, col_error

    date_series = pd.to_datetime(df[date_col], errors="coerce")
    target_date = datetime(target_year, target_month, target_day).date()
    mask = date_series.notna() & (date_series.dt.date == target_date)
    if not mask.any():
        return None, "Selected day not found in the file."

    day_hour_max = {}
    for idx in df.index[mask]:
        date_val = date_series.loc[idx]
        if pd.isna(date_val):
            continue
        hour, minute = parse_time_components(df.at[idx, time_col])
        bucket = bucket_end_hour_kw(hour, minute)
        if bucket is None:
            continue
        num = pd.to_numeric(df.at[idx, kw_col], errors="coerce")
        if pd.isna(num):
            continue
        day_map = day_hour_max.setdefault(target_date, {})
        value = float(num)
        current = day_map.get(bucket)
        if current is None or value > current:
            day_map[bucket] = value

    if not day_hour_max:
        return None, "No usable data found for that day."

    days = build_days_from_hour_map(day_hour_max)
    series = days.get(format_date_ymd(target_date), [])
    labels = [format_hour_label(hour) for hour in range(24)]

    return {
        "labels": labels,
        "values": series,
        "metric": "Load (kW)",
        "sheet": sheet
    }, None


def extract_kw_hourly_month_max(file_path, target_year=None, target_month=None, start_date=None, end_date=None):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return None, "Hourly Loading requires an Excel file."
    try:
        xl = pd.ExcelFile(file_path)
    except Exception:
        return None, "Unable to read Excel file."

    df, sheet, error = load_kw_sheet(xl, target_year, target_month)
    if error:
        return None, error

    date_col, time_col, kw_col, col_error = get_kw_columns(df)
    if col_error:
        return None, col_error

    date_series = pd.to_datetime(df[date_col], errors="coerce")
    if start_date and end_date:
        mask = date_series.notna() & (date_series.dt.date >= start_date) & (date_series.dt.date <= end_date)
    elif target_year and target_month:
        mask = date_series.notna() & (date_series.dt.year == target_year) & (date_series.dt.month == target_month)
    else:
        return None, "Year and month are required."

    if not mask.any():
        return None, "No matching dates found for that month."

    day_hour_max = {}
    for idx in df.index[mask]:
        date_val = date_series.loc[idx]
        if pd.isna(date_val):
            continue
        hour, minute = parse_time_components(df.at[idx, time_col])
        bucket = bucket_end_hour_kw(hour, minute)
        if bucket is None:
            continue
        num = pd.to_numeric(df.at[idx, kw_col], errors="coerce")
        if pd.isna(num):
            continue
        day = date_val.date()
        day_map = day_hour_max.setdefault(day, {})
        value = float(num)
        current = day_map.get(bucket)
        if current is None or value > current:
            day_map[bucket] = value

    if not day_hour_max:
        return None, "No usable data found for that month."

    days = build_days_from_hour_map(day_hour_max)
    values = compute_hourly_max(days)
    labels = [format_hour_label(hour) for hour in range(24)]

    return {
        "labels": labels,
        "values": values,
        "metric": "Load (kW)",
        "sheet": sheet
    }, None


def extract_peak_load(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return None, "Peak Load requires an Excel file."
    try:
        xl = pd.ExcelFile(file_path)
    except Exception:
        return None, "Unable to read Excel file."

    sheet = find_edd_sheet(xl.sheet_names)
    if not sheet:
        return None, "EDD sheet not found."

    df = xl.parse(sheet, header=None)

    month_col = find_for_month_column(df)

    peak_row = None
    for i in range(len(df)):
        row = df.iloc[i]
        for val in row.tolist():
            if isinstance(val, str) and "peak load" in val.lower():
                peak_row = i
                break
        if peak_row is not None:
            break

    if peak_row is None:
        return None, "Peak Load row not found."

    row = df.iloc[peak_row].tolist()
    if month_col is not None and month_col < len(row):
        value = parse_numeric_cell(row[month_col])
    else:
        value = None
        for val in row:
            num = parse_numeric_cell(val)
            if num is not None:
                value = num
                break

    if value is None:
        return None, "Peak Load value not found."

    return float(value), None


def build_peak_load_year_payload(entries, year):
    edd_entries = {}
    kw_entries = {}

    for entry in entries:
        entry_year = entry.get("year")
        entry_month = entry.get("month")
        if not entry_year or not entry_month:
            parsed_year, parsed_month = parse_year_month(entry.get("original_name", ""))
            entry_year = entry_year or parsed_year
            entry_month = entry_month or parsed_month
        if entry_year != year or not entry_month:
            continue

        category = get_entry_category(entry)
        if category == "edd":
            existing = edd_entries.get(entry_month)
            if not existing or entry.get("uploaded_at", "") > existing.get("uploaded_at", ""):
                edd_entries[entry_month] = entry
        if is_hourly_kw_entry(entry):
            existing = kw_entries.get(entry_month)
            if not existing or entry.get("uploaded_at", "") > existing.get("uploaded_at", ""):
                kw_entries[entry_month] = entry

    labels = MONTH_NAMES[:]
    values = [None] * 12

    kw_month_peaks = {}
    for month, entry in kw_entries.items():
        hourly = normalize_hourly_payload(entry)
        kw_payload = hourly.get("kw") or {}
        month_max = kw_payload.get("month_max") or []
        numeric = [val for val in month_max if isinstance(val, (int, float))]
        if numeric:
            kw_month_peaks[month] = max(numeric)

    for month in range(1, 13):
        combined = None
        edd_entry = edd_entries.get(month)
        if edd_entry:
            data = get_entry_data(edd_entry)
            peak_value = data.get("peak_load")
            if isinstance(peak_value, (int, float)):
                combined = peak_value if combined is None else max(combined, peak_value)
        kw_peak = kw_month_peaks.get(month)
        if isinstance(kw_peak, (int, float)):
            combined = kw_peak if combined is None else max(combined, kw_peak)
        if combined is not None:
            values[month - 1] = combined

    if all(value is None for value in values):
        return None

    return {
        "labels": labels,
        "values": values,
        "metric": "Peak Load (kW)",
        "year": year
    }


def build_system_loss_year_payload(entries, year):
    edd_entries = {}
    for entry in entries:
        if get_entry_category(entry) != "edd":
            continue
        entry_year = entry.get("year")
        entry_month = entry.get("month")
        if not entry_year or not entry_month:
            parsed_year, parsed_month = parse_year_month(entry.get("original_name", ""))
            entry_year = entry_year or parsed_year
            entry_month = entry_month or parsed_month
        if entry_year != year or not entry_month:
            continue
        existing = edd_entries.get(entry_month)
        if not existing or entry.get("uploaded_at", "") > existing.get("uploaded_at", ""):
            edd_entries[entry_month] = entry

    labels = MONTH_NAMES[:]
    values = [None] * 12
    percents = [None] * 12

    def derive_system_loss_from_purchase(data):
        purchase = data.get("edd_purchase") or {}
        labels_list = purchase.get("labels") or []
        values_list = purchase.get("values") or []
        value_candidate = None
        percent_candidate = None
        for idx, label in enumerate(labels_list):
            text = str(label or "").strip().lower()
            if not text:
                continue
            if "system loss" in text or "systemloss" in text or text == "sl":
                raw_value = values_list[idx] if idx < len(values_list) else None
                parsed = parse_numeric_cell(raw_value)
                if parsed is None:
                    continue
                if "%" in text or "percent" in text:
                    percent_candidate = normalize_percent_value(parsed)
                else:
                    value_candidate = parsed
        return value_candidate, percent_candidate

    for month in range(1, 13):
        entry = edd_entries.get(month)
        if not entry:
            continue
        data = get_entry_data(entry)
        value = parse_numeric_cell(data.get("system_loss_value"))
        percent = normalize_percent_value(data.get("system_loss_percent"))
        if value is None or percent is None:
            fallback_value, fallback_percent = derive_system_loss_from_purchase(data)
            if value is None and fallback_value is not None:
                value = fallback_value
            if percent is None and fallback_percent is not None:
                percent = fallback_percent
        if value is not None:
            values[month - 1] = float(value)
        if percent is not None:
            percents[month - 1] = float(percent)

    if all(val is None for val in values) and all(val is None for val in percents):
        return None

    return {
        "labels": labels,
        "values": values,
        "percents": percents,
        "value_metric": "System Loss",
        "percent_metric": "System Loss (%)",
        "year": year
    }


def build_hourly_year_payload(entries, year):
    month_entries = {}
    for entry in entries:
        if not is_hourly_kwh_entry(entry):
            continue
        entry_year = entry.get("year")
        entry_month = entry.get("month")
        if not entry_year or not entry_month:
            parsed_year, parsed_month = parse_year_month(entry.get("original_name", ""))
            entry_year = entry_year or parsed_year
            entry_month = entry_month or parsed_month
        if entry_year != year or not entry_month:
            continue
        existing = month_entries.get(entry_month)
        if not existing or entry.get("uploaded_at", "") > existing.get("uploaded_at", ""):
            month_entries[entry_month] = entry

    datasets = []
    labels = None
    for month in sorted(month_entries.keys()):
        entry = month_entries[month]
        hourly = normalize_hourly_payload(entry)
        cp_payload = hourly.get("cp") or {}
        month_avg = cp_payload.get("month_avg")
        if not month_avg:
            continue
        if labels is None:
            labels = build_hour_labels()
        datasets.append({
            "label": MONTH_NAMES[month - 1],
            "values": month_avg
        })

    if not datasets or not labels:
        return None

    return {
        "labels": labels,
        "datasets": datasets,
        "metric": "Energy (kWh)",
        "year": year
    }


def build_kw_annual_payload(entries, year, peak_type="highest"):
    month_entries = {}
    for entry in entries:
        if not is_hourly_kw_entry(entry):
            continue
        entry_year = entry.get("year")
        entry_month = entry.get("month")
        if not entry_year or not entry_month:
            parsed_year, parsed_month = parse_year_month(entry.get("original_name", ""))
            entry_year = entry_year or parsed_year
            entry_month = entry_month or parsed_month
        if entry_year != year or not entry_month:
            continue
        existing = month_entries.get(entry_month)
        if not existing or entry.get("uploaded_at", "") > existing.get("uploaded_at", ""):
            month_entries[entry_month] = entry

    values = [None] * 12
    normalized_peak = (peak_type or "highest").strip().lower()
    if normalized_peak not in ("lowest", "highest"):
        normalized_peak = "highest"

    for month in sorted(month_entries.keys()):
        entry = month_entries[month]
        hourly = normalize_hourly_payload(entry)
        kw_payload = hourly.get("kw") or {}
        month_max = kw_payload.get("month_max") or []
        numeric = [val for val in month_max if isinstance(val, (int, float))]
        if not numeric:
            continue
        peak_value = min(numeric) if normalized_peak == "lowest" else max(numeric)
        if 1 <= month <= 12:
            values[month - 1] = peak_value

    if all(value is None for value in values):
        return None

    return {
        "labels": MONTH_NAMES[:],
        "values": values,
        "metric": "Load (kW)",
        "year": year,
        "peak": normalized_peak
    }


def build_kw_month_series_payload(entries, year, month, peak_type="highest"):
    if not year or not month:
        return None
    month = int(month)
    if month < 1 or month > 12:
        return None
    selected = None
    for entry in entries:
        if not is_hourly_kw_entry(entry):
            continue
        entry_year = entry.get("year")
        entry_month = entry.get("month")
        if not entry_year or not entry_month:
            parsed_year, parsed_month = parse_year_month(entry.get("original_name", ""))
            entry_year = entry_year or parsed_year
            entry_month = entry_month or parsed_month
        if entry_year != year or entry_month != month:
            continue
        if not selected or entry.get("uploaded_at", "") > selected.get("uploaded_at", ""):
            selected = entry

    if not selected:
        return None

    hourly = normalize_hourly_payload(selected)
    kw_payload = hourly.get("kw") or {}
    days_map = kw_payload.get("days") or {}
    if not isinstance(days_map, dict) or not days_map:
        return None

    normalized_peak = (peak_type or "highest").strip().lower()
    if normalized_peak not in ("lowest", "highest"):
        normalized_peak = "highest"

    peak_day, peak_hour, peak_value = find_peak_day_hour(days_map, normalized_peak)
    if not peak_day or peak_hour is None:
        return None
    series = days_map.get(peak_day)
    if not isinstance(series, list) or len(series) != 24:
        return None

    return {
        "labels": build_hour_labels(),
        "values": series,
        "metric": "Load (kW)",
        "year": year,
        "month": month,
        "peak": normalized_peak,
        "label": MONTH_NAMES[month - 1],
        "day": peak_day,
        "peak_hour_index": peak_hour,
        "peak_value": peak_value
    }


def build_year_options(entries, category=None):
    years = set()
    for entry in entries:
        if category and not entry_matches_category(entry, category):
            continue
        entry_year = entry.get("year")
        if not entry_year:
            parsed_year, _ = parse_year_month(entry.get("original_name", ""))
            entry_year = parsed_year
        if entry_year:
            years.add(int(entry_year))
    return sorted(years, reverse=True)


@app.route("/")
def index():
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if get_current_user():
        return redirect(url_for("dashboard"))

    error = None
    if request.method == "POST":
        email = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if not email or not password:
            error = "Email and password are required."
        elif not supabase_enabled():
            error = SUPABASE_CONFIG_MESSAGE
        else:
            try:
                result = get_supabase().auth.sign_in_with_password({
                    "email": email,
                    "password": password
                })
                session["access_token"] = result.session.access_token
                session["refresh_token"] = result.session.refresh_token
                session["user_email"] = result.user.email
                session["user_id"] = result.user.id
                return redirect(url_for("dashboard"))
            except Exception as exc:
                error = format_auth_error(exc)

    return render_template("login.html", error=error)


@app.route("/dashboard")
def dashboard():
    if not get_current_user():
        return redirect(url_for("login"))

    uploads = load_manifest()
    upload_groups = build_upload_groups(uploads)
    recent_uploads = build_recent_uploads(uploads)
    upload_months = build_upload_months(uploads)
    upload_months_hourly = build_upload_months(uploads, category="hourly_kwh")
    upload_error = request.args.get("upload_error", "")
    return render_template(
        "dashboard.html",
        username=session.get("user_email", ""),
        upload_groups=upload_groups,
        recent_uploads=recent_uploads,
        upload_months=upload_months,
        upload_months_hourly=upload_months_hourly,
        upload_error=upload_error
    )


@app.route("/upload", methods=["POST"])
def upload_file():
    user = get_current_user()
    if not user:
        if wants_json_response():
            return jsonify({"error": "Unauthorized"}), 401
        return redirect(url_for("login"))
    if not supabase_enabled():
        if wants_json_response():
            return jsonify({"error": SUPABASE_CONFIG_MESSAGE}), 500
        return redirect(url_for("dashboard", upload_error="supabase") + "#section-uploads")

    files = request.files.getlist("uploadFiles")
    if not files:
        if wants_json_response():
            return jsonify({"error": "No files uploaded."}), 400
        return redirect(url_for("dashboard") + "#section-uploads")

    selected_category = request.form.get("uploadCategory", "other").strip().lower()
    if selected_category not in CATEGORY_OPTIONS:
        selected_category = "other"

    added = 0
    for file in files:
        if not file or not file.filename:
            continue
        original_name = file.filename.strip()
        if not allowed_file(original_name):
            continue
        safe_name = secure_filename(original_name)
        if not safe_name:
            continue

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:8]
        stored_name = f"{timestamp}_{unique_id}_{safe_name}"
        payload = read_upload_payload(file)
        data_json, data_error = precompute_upload_data(payload, original_name, selected_category)
        if data_error:
            if wants_json_response():
                return jsonify({"error": data_error}), 400
            return redirect(url_for("dashboard", upload_error="processing") + "#section-uploads")
        _, json_error = write_upload_json(stored_name, data_json)
        if json_error:
            if wants_json_response():
                return jsonify({"error": json_error}), 500
            return redirect(url_for("dashboard", upload_error="processing") + "#section-uploads")

        year, month = parse_year_month(original_name)
        insert_upload({
            "id": str(uuid.uuid4()),
            "original_name": original_name,
            "stored_name": stored_name,
            "uploaded_at": datetime.now().isoformat(timespec="seconds"),
            "year": year,
            "month": month,
            "category": selected_category,
            "uploaded_by": getattr(user, "id", None),
            "data_json": data_json,
            "data_version": 2
        })
        added += 1

    if added == 0:
        if wants_json_response():
            return jsonify({"error": "No valid files were uploaded."}), 400
        return redirect(url_for("dashboard", upload_error="no_files") + "#section-uploads")
    if wants_json_response():
        payload = build_bootstrap_payload()
        payload["uploaded"] = added
        return jsonify(payload)
    return redirect(url_for("dashboard") + "#section-uploads")


@app.route("/upload/delete/<upload_id>", methods=["POST"])
def delete_upload(upload_id):
    if not get_current_user():
        return redirect(url_for("login"))

    entry = fetch_upload(upload_id)
    if not entry:
        return redirect(url_for("dashboard") + "#section-uploads")
    delete_upload_entry(upload_id)
    return redirect(url_for("dashboard") + "#section-uploads")


@app.route("/delete/<upload_id>", methods=["DELETE", "POST"])
def delete_upload_api(upload_id):
    if not get_current_user():
        if wants_json_response():
            return jsonify({"error": "Unauthorized"}), 401
        return redirect(url_for("login"))

    entry = fetch_upload(upload_id)
    if not entry:
        if wants_json_response():
            return jsonify({"error": "File not found."}), 404
        return redirect(url_for("dashboard") + "#section-uploads")

    delete_upload_entry(upload_id)
    if wants_json_response():
        return jsonify({"ok": True})
    return redirect(url_for("dashboard") + "#section-uploads")


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or request.form
    email = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400
    if not supabase_enabled():
        return jsonify({"error": SUPABASE_CONFIG_MESSAGE}), 500
    try:
        result = get_supabase().auth.sign_in_with_password({
            "email": email,
            "password": password
        })
        session["access_token"] = result.session.access_token
        session["refresh_token"] = result.session.refresh_token
        session["user_email"] = result.user.email
        session["user_id"] = result.user.id
        return jsonify({
            "ok": True,
            "username": result.user.email,
            "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token
        })
    except Exception as exc:
        return jsonify({"error": format_auth_error(exc)}), 401


@app.route("/api/logout", methods=["POST"])
def api_logout():
    clear_session()
    return jsonify({"ok": True})


@app.route("/api/bootstrap")
def api_bootstrap():
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401
    payload = build_bootstrap_payload()
    payload["username"] = session.get("user_email", "")
    return jsonify(payload)


@app.route("/data")
def data_endpoint():
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entries_meta = load_manifest()
    entries_full = load_manifest(include_data=True)

    items = []
    for entry in entries_full:
        items.append({
            "id": entry.get("id"),
            "name": entry.get("original_name") or entry.get("stored_name") or "",
            "original_name": entry.get("original_name") or "",
            "created_at": entry.get("uploaded_at") or "",
            "uploaded_at": entry.get("uploaded_at") or "",
            "year": entry.get("year"),
            "month": entry.get("month"),
            "category": entry.get("category"),
            "json_data": get_entry_data(entry)
        })

    payload = {
        "items": items,
        "upload_groups": build_upload_groups(entries_meta),
        "recent_uploads": build_recent_uploads(entries_meta),
        "upload_months": build_upload_months(entries_meta),
        "upload_months_hourly": build_upload_months(entries_meta, category="hourly_kwh")
    }
    payload["username"] = session.get("user_email", "")
    return jsonify(payload)


@app.route("/api/upload", methods=["POST"])
def api_upload():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    if not supabase_enabled():
        return jsonify({"error": SUPABASE_CONFIG_MESSAGE}), 500

    files = request.files.getlist("uploadFiles")
    if not files:
        return jsonify({"error": "No files uploaded."}), 400

    selected_category = request.form.get("uploadCategory", "other").strip().lower()
    if selected_category not in CATEGORY_OPTIONS:
        selected_category = "other"

    added = 0
    for file in files:
        if not file or not file.filename:
            continue
        original_name = file.filename.strip()
        if not allowed_file(original_name):
            continue
        safe_name = secure_filename(original_name)
        if not safe_name:
            continue

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:8]
        stored_name = f"{timestamp}_{unique_id}_{safe_name}"
        payload = read_upload_payload(file)
        data_json, data_error = precompute_upload_data(payload, original_name, selected_category)
        if data_error:
            return jsonify({"error": data_error}), 400
        _, json_error = write_upload_json(stored_name, data_json)
        if json_error:
            return jsonify({"error": json_error}), 500

        year, month = parse_year_month(original_name)
        insert_upload({
            "id": str(uuid.uuid4()),
            "original_name": original_name,
            "stored_name": stored_name,
            "uploaded_at": datetime.now().isoformat(timespec="seconds"),
            "year": year,
            "month": month,
            "category": selected_category,
            "uploaded_by": getattr(user, "id", None),
            "data_json": data_json,
            "data_version": 2
        })
        added += 1

    if added == 0:
        return jsonify({"error": "No valid files were uploaded."}), 400
    payload = build_bootstrap_payload()
    payload["uploaded"] = added
    return jsonify(payload)


@app.route("/api/upload/delete/<upload_id>", methods=["POST"])
def api_delete_upload(upload_id):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401
    entry = fetch_upload(upload_id)
    if not entry:
        return jsonify({"error": "File not found."}), 404
    delete_upload_entry(upload_id)

    payload = build_bootstrap_payload()
    return jsonify(payload)


@app.route("/api/edd-purchases/<upload_id>")
def edd_purchases(upload_id):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entry = fetch_upload(upload_id)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    data = get_entry_data(entry)
    payload = data.get("edd_purchase")
    if not payload:
        return jsonify({"error": "No purchase data found."}), 400

    response = dict(payload)
    response["label"] = entry.get("original_name", "")
    return jsonify(response)


@app.route("/api/edd-hourly/<upload_id>")
def edd_hourly(upload_id):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entry = fetch_upload(upload_id)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    hourly = normalize_hourly_payload(entry)
    cp_payload = hourly.get("cp") or {}
    values = cp_payload.get("month_avg")
    if not values:
        return jsonify({"error": "No hourly data found."}), 400

    return jsonify({
        "labels": build_hour_labels(),
        "values": values,
        "metric": "Energy (kWh)",
        "label": entry.get("original_name", "")
    })


@app.route("/api/edd-hourly-year/<int:year>")
def edd_hourly_year(year):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest(include_data=True)
    payload = build_hourly_year_payload(entries, year)
    if not payload:
        return jsonify({"error": "No hourly data found for that year."}), 400

    return jsonify(payload)


@app.route("/api/edd-hourly-kw-years")
def edd_hourly_kw_years():
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401
    entries = load_manifest()
    years = build_year_options(entries, category="hourly_kw")
    return jsonify({"years": years})


@app.route("/api/edd-system-loss-years")
def edd_system_loss_years():
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401
    entries = load_manifest()
    years = build_year_options(entries, category="edd")
    return jsonify({"years": years})


@app.route("/api/edd-hourly-kw-annual/<int:year>")
def edd_hourly_kw_annual(year):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest(include_data=True)
    peak_type = request.args.get("peak", "highest")
    payload = build_kw_annual_payload(entries, year, peak_type)
    if not payload:
        return jsonify({"error": "No hourly kW data found for that year."}), 400

    return jsonify(payload)


@app.route("/api/edd-hourly-kw-month-series/<int:year>/<int:month>")
def edd_hourly_kw_month_series(year, month):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest(include_data=True)
    peak_type = request.args.get("peak", "highest")
    payload = build_kw_month_series_payload(entries, year, month, peak_type)
    if not payload:
        return jsonify({"error": "No hourly kW data found for that month."}), 400

    return jsonify(payload)


@app.route("/api/edd-hourly-days/<upload_id>")
def edd_hourly_days(upload_id):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entry = fetch_upload(upload_id)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    start_date = parse_iso_date(request.args.get("start"))
    end_date = parse_iso_date(request.args.get("end"))
    hourly = normalize_hourly_payload(entry)
    cp_payload = hourly.get("cp") or {}
    days_map = cp_payload.get("days") or {}
    if not days_map:
        return jsonify({"error": "No cached data found for this file. Please re-upload it."}), 400

    filtered = filter_days_map(days_map, start_date, end_date)
    dates = sorted(filtered.keys())
    if not dates:
        return jsonify({"error": "No matching dates found."}), 400

    return jsonify({
        "dates": dates,
        "start": format_date_ymd(start_date) if start_date else "",
        "end": format_date_ymd(end_date) if end_date else ""
    })


@app.route("/api/edd-hourly-day/<upload_id>/<int:day>")
def edd_hourly_day(upload_id, day):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entry = fetch_upload(upload_id)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    query_year = request.args.get("year")
    query_month = request.args.get("month")
    entry_year = int(query_year) if query_year and query_year.isdigit() else None
    entry_month = int(query_month) if query_month and query_month.isdigit() else None
    if not entry_year or not entry_month:
        parsed_year, parsed_month = parse_year_month(entry.get("original_name", ""))
        entry_year = entry_year or parsed_year
        entry_month = entry_month or parsed_month

    if not entry_year or not entry_month:
        return jsonify({"error": "Unable to detect month for this file."}), 400
    hourly = normalize_hourly_payload(entry)
    cp_payload = hourly.get("cp") or {}
    days_map = cp_payload.get("days") or {}
    if not days_map:
        return jsonify({"error": "No cached data found for this file. Please re-upload it."}), 400
    date_key = f"{entry_year:04d}-{entry_month:02d}-{day:02d}"
    values = days_map.get(date_key)
    if not values:
        return jsonify({"error": "Selected day not found in the file."}), 400

    return jsonify({
        "labels": build_hour_labels(),
        "values": values,
        "metric": "Energy (kWh)",
        "label": entry.get("original_name", "")
    })


@app.route("/api/edd-hourly-day/<upload_id>")
def edd_hourly_day_by_date(upload_id):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entry = fetch_upload(upload_id)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    date_str = request.args.get("date")
    target_date = parse_iso_date(date_str)
    if not target_date:
        return jsonify({"error": "Date is required in YYYY-MM-DD format."}), 400
    hourly = normalize_hourly_payload(entry)
    cp_payload = hourly.get("cp") or {}
    days_map = cp_payload.get("days") or {}
    if not days_map:
        return jsonify({"error": "No cached data found for this file. Please re-upload it."}), 400
    date_key = format_date_ymd(target_date)
    values = days_map.get(date_key)
    if not values:
        return jsonify({"error": "Selected day not found in the file."}), 400

    return jsonify({
        "labels": build_hour_labels(),
        "values": values,
        "metric": "Energy (kWh)",
        "label": entry.get("original_name", "")
    })


@app.route("/api/edd-hourly-month/<upload_id>")
def edd_hourly_month(upload_id):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entry = fetch_upload(upload_id)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    start_date = parse_iso_date(request.args.get("start"))
    end_date = parse_iso_date(request.args.get("end"))
    query_year = request.args.get("year")
    query_month = request.args.get("month")
    entry_year = int(query_year) if query_year and query_year.isdigit() else None
    entry_month = int(query_month) if query_month and query_month.isdigit() else None

    hourly = normalize_hourly_payload(entry)
    cp_payload = hourly.get("cp") or {}
    days_map = cp_payload.get("days") or {}
    if not days_map:
        return jsonify({"error": "No cached data found for this file. Please re-upload it."}), 400

    filtered = filter_days_map(days_map, start_date, end_date) if start_date and end_date else days_map
    values = cp_payload.get("month_max") if not (start_date and end_date) else compute_hourly_max(filtered)
    if not values:
        return jsonify({"error": "No usable data found for that month."}), 400

    return jsonify({
        "labels": build_hour_labels(),
        "values": values,
        "metric": "Energy (kWh)",
        "label": entry.get("original_name", "")
    })


@app.route("/api/edd-hourly-months")
def edd_hourly_months():
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest(include_data=True)
    items = []
    for entry in entries:
        if not is_hourly_kwh_entry(entry):
            continue
        hourly = normalize_hourly_payload(entry)
        cp_payload = hourly.get("cp") or {}
        days_map = cp_payload.get("days") or {}
        if not days_map:
            continue
        date_values = [parse_iso_date(key) for key in days_map.keys()]
        date_values = [val for val in date_values if val]
        if not date_values:
            continue
        start_date = min(date_values)
        end_date = max(date_values)
        items.append({
            "id": entry.get("id"),
            "year": end_date.year,
            "month": end_date.month,
            "start": format_date_ymd(start_date),
            "end": format_date_ymd(end_date),
            "label": format_billing_label(start_date, end_date)
        })

    items.sort(key=lambda item: (item.get("year", 0), item.get("month", 0), item.get("start", "")))

    return jsonify({"items": items})


@app.route("/api/edd-hourly-kw-months")
def edd_hourly_kw_months():
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest(include_data=True)
    items = []
    for entry in entries:
        if not is_hourly_kw_entry(entry):
            continue
        days_map, error = get_kw_days_map(entry)
        if error:
            continue
        date_values = [parse_iso_date(key) for key in days_map.keys()]
        date_values = [val for val in date_values if val]
        if not date_values:
            continue
        start_date = min(date_values)
        end_date = max(date_values)
        items.append({
            "id": entry.get("id"),
            "year": end_date.year,
            "month": end_date.month,
            "start": format_date_ymd(start_date),
            "end": format_date_ymd(end_date),
            "label": format_billing_label(start_date, end_date)
        })

    items.sort(key=lambda item: (item.get("year", 0), item.get("month", 0), item.get("start", "")))

    return jsonify({"items": items})


@app.route("/api/edd-hourly-kw-days/<upload_id>")
def edd_hourly_kw_days(upload_id):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entry = fetch_upload(upload_id)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    start_date = parse_iso_date(request.args.get("start"))
    end_date = parse_iso_date(request.args.get("end"))
    days_map, error = get_kw_days_map(entry)
    if error:
        return jsonify({"error": error}), 400
    filtered = filter_days_map(days_map, start_date, end_date)
    dates = sorted(filtered.keys())
    if not dates:
        return jsonify({"error": "No matching dates found."}), 400

    return jsonify({
        "dates": dates,
        "start": format_date_ymd(start_date) if start_date else "",
        "end": format_date_ymd(end_date) if end_date else ""
    })


@app.route("/api/edd-hourly-kw-day/<upload_id>/<int:day>")
def edd_hourly_kw_day(upload_id, day):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entry = fetch_upload(upload_id)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    query_year = request.args.get("year")
    query_month = request.args.get("month")
    entry_year = int(query_year) if query_year and query_year.isdigit() else None
    entry_month = int(query_month) if query_month and query_month.isdigit() else None
    if not entry_year or not entry_month:
        parsed_year, parsed_month = parse_year_month(entry.get("original_name", ""))
        entry_year = entry_year or parsed_year
        entry_month = entry_month or parsed_month

    if not entry_year or not entry_month:
        return jsonify({"error": "Unable to detect month for this file."}), 400
    days_map, error = get_kw_days_map(entry)
    if error:
        return jsonify({"error": error}), 400
    date_key = f"{entry_year:04d}-{entry_month:02d}-{day:02d}"
    values = days_map.get(date_key)
    if not values:
        return jsonify({"error": "Selected day not found in the file."}), 400

    return jsonify({
        "labels": build_hour_labels(),
        "values": values,
        "metric": "Load (kW)",
        "label": entry.get("original_name", "")
    })


@app.route("/api/edd-hourly-kw-day/<upload_id>")
def edd_hourly_kw_day_by_date(upload_id):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entry = fetch_upload(upload_id)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    date_str = request.args.get("date")
    target_date = parse_iso_date(date_str)
    if not target_date:
        return jsonify({"error": "Date is required in YYYY-MM-DD format."}), 400
    days_map, error = get_kw_days_map(entry)
    if error:
        return jsonify({"error": error}), 400
    date_key = format_date_ymd(target_date)
    values = days_map.get(date_key)
    if not values:
        return jsonify({"error": "Selected day not found in the file."}), 400

    return jsonify({
        "labels": build_hour_labels(),
        "values": values,
        "metric": "Load (kW)",
        "label": entry.get("original_name", "")
    })


@app.route("/api/edd-hourly-kw-month/<upload_id>")
def edd_hourly_kw_month(upload_id):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entry = fetch_upload(upload_id)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    start_date = parse_iso_date(request.args.get("start"))
    end_date = parse_iso_date(request.args.get("end"))
    query_year = request.args.get("year")
    query_month = request.args.get("month")
    entry_year = int(query_year) if query_year and query_year.isdigit() else None
    entry_month = int(query_month) if query_month and query_month.isdigit() else None

    hourly = normalize_hourly_payload(entry)
    kw_payload = hourly.get("kw") or {}
    days_map, error = get_kw_days_map(entry)
    if error:
        return jsonify({"error": error}), 400

    filtered = filter_days_map(days_map, start_date, end_date) if start_date and end_date else days_map
    values = kw_payload.get("month_max") if not (start_date and end_date) else compute_hourly_max(filtered)
    if not values:
        return jsonify({"error": "No usable data found for that month."}), 400

    return jsonify({
        "labels": build_hour_labels(),
        "values": values,
        "metric": "Load (kW)",
        "label": entry.get("original_name", "")
    })


@app.route("/api/edd-peak-load-year/<int:year>")
def edd_peak_load_year(year):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest(include_data=True)
    payload = build_peak_load_year_payload(entries, year)
    if not payload:
        return jsonify({"error": "No Peak Load data found for that year."}), 400

    return jsonify(payload)


@app.route("/api/edd-system-loss-year/<int:year>")
def edd_system_loss_year(year):
    if not get_current_user():
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest(include_data=True)
    payload = build_system_loss_year_payload(entries, year)
    if not payload:
        return jsonify({"error": "No System Loss data found for that year."}), 400

    return jsonify(payload)


@app.route("/logout")
def logout():
    clear_session()
    return redirect(url_for("login"))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
