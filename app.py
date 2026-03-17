import json
import os
import re
import uuid
from datetime import datetime, time

import pandas as pd
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_bcrypt import Bcrypt
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = "supersecretkey"

bcrypt = Bcrypt(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
MANIFEST_PATH = os.path.join(UPLOAD_DIR, "manifest.json")
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
    "hourly": "Hourly Loading",
    "other": "Other"
}

users = {
    "admin": bcrypt.generate_password_hash("admin").decode("utf-8")
}


def ensure_upload_storage():
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    if not os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, "w", encoding="utf-8") as handle:
            json.dump([], handle)


def load_manifest():
    ensure_upload_storage()
    try:
        with open(MANIFEST_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
            return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def save_manifest(entries):
    ensure_upload_storage()
    with open(MANIFEST_PATH, "w", encoding="utf-8") as handle:
        json.dump(entries, handle, indent=2)


def allowed_file(filename):
    ext = os.path.splitext(filename)[1].lower()
    return ext in ALLOWED_EXTENSIONS


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
        return f"{month_name} ({format_date_mdy(start_date)} -> {format_date_mdy(end_date)})"
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


def build_recent_uploads(entries, limit=6):
    enriched = []
    for entry in entries:
        item = dict(entry)
        original = item.get("original_name", "")
        item["display_name"] = os.path.splitext(original)[0] if original else item.get("stored_name", "")
        item["uploaded_at_display"] = format_timestamp(item.get("uploaded_at", ""))
        enriched.append(item)
    enriched.sort(key=lambda item: item.get("uploaded_at", ""), reverse=True)
    return enriched[:limit]


def infer_category_from_name(name):
    lowered = str(name or "").lower()
    if "edd" in lowered:
        return "edd"
    if "energy" in lowered or "cp" in lowered or "kw" in lowered:
        return "hourly"
    return "other"


def get_entry_category(entry):
    category = (entry.get("category") or "").strip().lower()
    if category in CATEGORY_OPTIONS:
        return category
    return infer_category_from_name(entry.get("original_name", ""))


def build_upload_months(entries, category=None):
    enriched = []
    for entry in entries:
        if category and get_entry_category(entry) != category:
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


def format_hour_label(hour):
    if hour == 0:
        return "12:00 AM"
    if hour == 12:
        return "12:00 PM"
    if hour > 12:
        return f"{hour - 12}:00 PM"
    return f"{hour}:00 AM"


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

    header_idx = None
    for i in range(len(df)):
        row = df.iloc[i]
        if any(isinstance(x, str) and "for the month" in x.lower() for x in row.tolist() if pd.notna(x)):
            header_idx = i
            break

    month_col = None
    if header_idx is not None:
        for idx, val in enumerate(df.iloc[header_idx].tolist()):
            if isinstance(val, str) and "for the month" in val.lower():
                month_col = idx
                break

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
        value = row[month_col]
    else:
        value = None
        for val in row:
            num = pd.to_numeric(val, errors="coerce")
            if pd.notna(num):
                value = num
                break

    if value is None or pd.isna(value):
        return None, "Peak Load value not found."

    return float(value), None


def build_peak_load_year_payload(entries, year):
    month_entries = {}
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
        existing = month_entries.get(entry_month)
        if not existing or entry.get("uploaded_at", "") > existing.get("uploaded_at", ""):
            month_entries[entry_month] = entry

    labels = MONTH_NAMES[:]
    values = [None] * 12
    for month in sorted(month_entries.keys()):
        entry = month_entries[month]
        stored = entry.get("stored_name")
        if not stored:
            continue
        file_path = os.path.join(UPLOAD_DIR, stored)
        if not os.path.exists(file_path):
            continue
        peak_value, error = extract_peak_load(file_path)
        if error:
            continue
        if 1 <= month <= 12:
            values[month - 1] = peak_value

    if all(value is None for value in values):
        return None

    return {
        "labels": labels,
        "values": values,
        "metric": "Peak Load (kW)",
        "year": year
    }


def build_hourly_year_payload(entries, year):
    month_entries = {}
    for entry in entries:
        if get_entry_category(entry) != "hourly":
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
        stored = entry.get("stored_name")
        if not stored:
            continue
        file_path = os.path.join(UPLOAD_DIR, stored)
        if not os.path.exists(file_path):
            continue
        payload, error = extract_cp_hourly_data(file_path, target_year=year, target_month=month)
        if error or not payload:
            continue
        if labels is None:
            labels = payload.get("labels", [])
        datasets.append({
            "label": MONTH_NAMES[month - 1],
            "values": payload.get("values", [])
        })

    if not datasets or not labels:
        return None

    return {
        "labels": labels,
        "datasets": datasets,
        "metric": "Energy (kWh)",
        "year": year
    }


@app.route("/")
def index():
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if "user" in session:
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        if username in users and bcrypt.check_password_hash(users[username], password):
            session["user"] = username
            return redirect(url_for("dashboard"))

        return render_template("login.html", error="Invalid username or password")

    return render_template("login.html", error=None)


@app.route("/dashboard")
def dashboard():
    if "user" not in session:
        return redirect(url_for("login"))

    uploads = load_manifest()
    upload_groups = build_upload_groups(uploads)
    recent_uploads = build_recent_uploads(uploads)
    upload_months = build_upload_months(uploads)
    upload_months_hourly = build_upload_months(uploads, category="hourly")
    upload_error = request.args.get("upload_error", "")
    return render_template(
        "dashboard.html",
        username=session["user"],
        upload_groups=upload_groups,
        recent_uploads=recent_uploads,
        upload_months=upload_months,
        upload_months_hourly=upload_months_hourly,
        upload_error=upload_error
    )


@app.route("/upload", methods=["POST"])
def upload_file():
    if "user" not in session:
        return redirect(url_for("login"))

    files = request.files.getlist("uploadFiles")
    if not files:
        return redirect(url_for("dashboard") + "#section-uploads")

    entries = load_manifest()
    selected_category = request.form.get("uploadCategory", "other").strip().lower()
    if selected_category not in CATEGORY_OPTIONS:
        selected_category = "other"

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
        file_path = os.path.join(UPLOAD_DIR, stored_name)
        file.save(file_path)

        year, month = parse_year_month(original_name)
        entries.append({
            "id": uuid.uuid4().hex,
            "original_name": original_name,
            "stored_name": stored_name,
            "uploaded_at": datetime.now().isoformat(timespec="seconds"),
            "year": year,
            "month": month,
            "category": selected_category
        })

    save_manifest(entries)
    return redirect(url_for("dashboard") + "#section-uploads")


@app.route("/upload/delete/<upload_id>", methods=["POST"])
def delete_upload(upload_id):
    if "user" not in session:
        return redirect(url_for("login"))

    entries = load_manifest()
    remaining = []
    had_error = False
    for entry in entries:
        if entry.get("id") == upload_id:
            stored = entry.get("stored_name")
            if stored:
                path = os.path.join(UPLOAD_DIR, stored)
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except PermissionError:
                        had_error = True
            continue
        remaining.append(entry)

    save_manifest(remaining)
    if had_error:
        return redirect(url_for("dashboard", upload_error="in_use") + "#section-uploads")
    return redirect(url_for("dashboard") + "#section-uploads")


@app.route("/api/edd-purchases/<upload_id>")
def edd_purchases(upload_id):
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest()
    entry = next((item for item in entries if item.get("id") == upload_id), None)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    stored = entry.get("stored_name")
    if not stored:
        return jsonify({"error": "File not available"}), 404

    file_path = os.path.join(UPLOAD_DIR, stored)
    if not os.path.exists(file_path):
        return jsonify({"error": "File missing on disk"}), 404

    payload, error = extract_kwhr_purchase_data(file_path)
    if error:
        return jsonify({"error": error}), 400

    payload["label"] = entry.get("original_name", "")
    return jsonify(payload)


@app.route("/api/edd-hourly/<upload_id>")
def edd_hourly(upload_id):
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest()
    entry = next((item for item in entries if item.get("id") == upload_id), None)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    stored = entry.get("stored_name")
    if not stored:
        return jsonify({"error": "File not available"}), 404

    file_path = os.path.join(UPLOAD_DIR, stored)
    if not os.path.exists(file_path):
        return jsonify({"error": "File missing on disk"}), 404

    payload, error = extract_cp_hourly_data(
        file_path,
        target_year=entry.get("year"),
        target_month=entry.get("month")
    )
    if error:
        return jsonify({"error": error}), 400

    payload["label"] = entry.get("original_name", "")
    return jsonify(payload)


@app.route("/api/edd-hourly-year/<int:year>")
def edd_hourly_year(year):
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest()
    payload = build_hourly_year_payload(entries, year)
    if not payload:
        return jsonify({"error": "No hourly data found for that year."}), 400

    return jsonify(payload)


@app.route("/api/edd-hourly-days/<upload_id>")
def edd_hourly_days(upload_id):
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest()
    entry = next((item for item in entries if item.get("id") == upload_id), None)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    stored = entry.get("stored_name")
    if not stored:
        return jsonify({"error": "File not available"}), 404

    file_path = os.path.join(UPLOAD_DIR, stored)
    if not os.path.exists(file_path):
        return jsonify({"error": "File missing on disk"}), 404

    start_date = parse_iso_date(request.args.get("start"))
    end_date = parse_iso_date(request.args.get("end"))

    days, error = extract_cp_available_days(file_path, start_date, end_date)
    if error:
        return jsonify({"error": error}), 400

    return jsonify({
        "dates": days,
        "start": format_date_ymd(start_date) if start_date else "",
        "end": format_date_ymd(end_date) if end_date else ""
    })


@app.route("/api/edd-hourly-day/<upload_id>/<int:day>")
def edd_hourly_day(upload_id, day):
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest()
    entry = next((item for item in entries if item.get("id") == upload_id), None)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    stored = entry.get("stored_name")
    if not stored:
        return jsonify({"error": "File not available"}), 404

    file_path = os.path.join(UPLOAD_DIR, stored)
    if not os.path.exists(file_path):
        return jsonify({"error": "File missing on disk"}), 404

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

    payload, error = extract_cp_hourly_day_data(file_path, entry_year, entry_month, day)
    if error:
        return jsonify({"error": error}), 400

    payload["label"] = entry.get("original_name", "")
    return jsonify(payload)


@app.route("/api/edd-hourly-day/<upload_id>")
def edd_hourly_day_by_date(upload_id):
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest()
    entry = next((item for item in entries if item.get("id") == upload_id), None)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    stored = entry.get("stored_name")
    if not stored:
        return jsonify({"error": "File not available"}), 404

    file_path = os.path.join(UPLOAD_DIR, stored)
    if not os.path.exists(file_path):
        return jsonify({"error": "File missing on disk"}), 404

    date_str = request.args.get("date")
    target_date = parse_iso_date(date_str)
    if not target_date:
        return jsonify({"error": "Date is required in YYYY-MM-DD format."}), 400

    payload, error = extract_cp_hourly_day_data(
        file_path,
        target_date.year,
        target_date.month,
        target_date.day
    )
    if error:
        return jsonify({"error": error}), 400

    payload["label"] = entry.get("original_name", "")
    return jsonify(payload)


@app.route("/api/edd-hourly-month/<upload_id>")
def edd_hourly_month(upload_id):
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest()
    entry = next((item for item in entries if item.get("id") == upload_id), None)
    if not entry:
        return jsonify({"error": "File not found"}), 404

    stored = entry.get("stored_name")
    if not stored:
        return jsonify({"error": "File not available"}), 404

    file_path = os.path.join(UPLOAD_DIR, stored)
    if not os.path.exists(file_path):
        return jsonify({"error": "File missing on disk"}), 404

    start_date = parse_iso_date(request.args.get("start"))
    end_date = parse_iso_date(request.args.get("end"))
    query_year = request.args.get("year")
    query_month = request.args.get("month")
    entry_year = int(query_year) if query_year and query_year.isdigit() else None
    entry_month = int(query_month) if query_month and query_month.isdigit() else None

    if start_date and end_date:
        payload, error = extract_cp_hourly_month_max(file_path, start_date=start_date, end_date=end_date)
    else:
        if not entry_year or not entry_month:
            return jsonify({"error": "Year and month are required."}), 400
        payload, error = extract_cp_hourly_month_max(file_path, entry_year, entry_month)
    if error:
        return jsonify({"error": error}), 400

    payload["label"] = entry.get("original_name", "")
    return jsonify(payload)


@app.route("/api/edd-hourly-months")
def edd_hourly_months():
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest()
    items = []
    for entry in entries:
        if get_entry_category(entry) != "hourly":
            continue
        stored = entry.get("stored_name")
        if not stored:
            continue
        file_path = os.path.join(UPLOAD_DIR, stored)
        if not os.path.exists(file_path):
            continue
        dates, error = extract_cp_available_dates(file_path)
        if error or not dates:
            continue
        start_date = min(dates)
        end_date = max(dates)
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


@app.route("/api/edd-peak-load-year/<int:year>")
def edd_peak_load_year(year):
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    entries = load_manifest()
    payload = build_peak_load_year_payload(entries, year)
    if not payload:
        return jsonify({"error": "No Peak Load data found for that year."}), 400

    return jsonify(payload)


@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("login"))


if __name__ == "__main__":
    app.run(debug=True)
