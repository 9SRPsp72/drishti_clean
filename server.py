

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import pandas as pd
import json
import threading
from pathlib import Path
from werkzeug.utils import secure_filename
from datetime import datetime
import uuid

from risk_engine import calculate_risk


# ==========================================
# DRISHTI BACKEND
# ==========================================

app = Flask(__name__)
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    return response

import requests

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "http://localhost:5500",
                "http://127.0.0.1:5500"
            ]
        }
    }
)

import requests 

# ==========================================
# LOAD DATASET
# ==========================================

DATASET_PATH = "data/flood_risk_dataset_india.csv"

df = pd.read_csv(DATASET_PATH)

print(f"Loaded {len(df)} flood records.")

# ==========================================
# PERSISTENT INCIDENT STORE
# Incidents are stored on the backend, not only in browser localStorage.
# ==========================================
INCIDENTS_PATH = Path(__file__).resolve().parent / "drishti_incidents.json"
_incidents_lock = threading.Lock()
_VALID_STATUSES = {"NEW", "ACKNOWLEDGED", "RESPONDING", "RESOLVED"}

# Citizen-submitted photo reports are persisted locally for this prototype.
REPORTS_PATH = Path(__file__).resolve().parent / "drishti_reports.json"
REPORT_UPLOAD_DIR = Path(__file__).resolve().parent / "uploads" / "reports"
REPORT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
_reports_lock = threading.Lock()
_ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
_REPORT_STATUSES = {"NEW", "ACKNOWLEDGED", "RESPONDING", "RESOLVED"}
app.config["MAX_CONTENT_LENGTH"] = 9 * 1024 * 1024


def _read_reports():
    try:
        if not REPORTS_PATH.exists():
            return []
        value = json.loads(REPORTS_PATH.read_text(encoding="utf-8"))
        return value if isinstance(value, list) else []
    except (OSError, json.JSONDecodeError):
        app.logger.exception("Could not read citizen reports")
        return []


def _write_reports(items):
    temporary = REPORTS_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(REPORTS_PATH)


def _read_incidents():
    try:
        if not INCIDENTS_PATH.exists():
            return []
        data = json.loads(INCIDENTS_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        app.logger.exception("Could not read incident store")
        return []


def _write_incidents(items):
    temp_path = INCIDENTS_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_path.replace(INCIDENTS_PATH)


def _normalise_incident(payload):
    if not isinstance(payload, dict) or not str(payload.get("id", "")).strip():
        return None
    try:
        score = float(payload.get("score", 0) or 0)
        latitude = float(payload.get("latitude", 0) or 0)
        longitude = float(payload.get("longitude", 0) or 0)
    except (TypeError, ValueError):
        return None
    level = str(payload.get("level", "HIGH")).upper()
    if level not in {"LOW", "MODERATE", "MEDIUM", "HIGH", "CRITICAL"}:
        level = "HIGH"
    status = str(payload.get("status", "NEW")).upper()
    if status not in _VALID_STATUSES:
        status = "NEW"
    return {
        "id": str(payload["id"])[:100],
        "timestamp": str(payload.get("timestamp") or pd.Timestamp.now().isoformat()),
        "level": level,
        "score": max(0.0, min(100.0, score)),
        "type": str(payload.get("type", "COMBINED RISK"))[:100],
        "message": str(payload.get("message", "Elevated flood-risk conditions detected."))[:2000],
        "action": str(payload.get("action", "Follow official guidance."))[:2000],
        "latitude": latitude,
        "longitude": longitude,
        "status": status,
    }


# ==========================================
# HOME
# ==========================================

@app.route("/")
def home():

    return jsonify({
        "project": "DRISHTI",
        "module": "Flood Risk & Early Warning",
        "status": "Backend running",
        "records": len(df)
    })


# ==========================================
# SUMMARY
# ==========================================

@app.route("/api/summary")
def summary():

    return jsonify({
        "project": "DRISHTI",
        "records": len(df),
        "features": len(df.columns),
        "flood_occurred": int(
            df["Flood Occurred"].sum()
        ),
        "no_flood": int(
            (df["Flood Occurred"] == 0).sum()
        ),
        "backend": "online"
    })


# ==========================================
# GET RECORD
# ==========================================

@app.route("/api/record/<int:index>")
def record(index):

    if index < 0 or index >= len(df):

        return jsonify({
            "error": "Record not found"
        }), 404

    row = df.iloc[index]

    risk_result = calculate_risk(row)

    return jsonify({

        "index": index,

        "latitude": float(
            row["Latitude"]
        ),

        "longitude": float(
            row["Longitude"]
        ),

        "rainfall": float(
            row["Rainfall (mm)"]
        ),

        "temperature": float(
            row["Temperature (°C)"]
        ),

        "humidity": float(
            row["Humidity (%)"]
        ),

        "river_discharge": float(
            row["River Discharge (m³/s)"]
        ),

        "water_level": float(
            row["Water Level (m)"]
        ),

        "elevation": float(
            row["Elevation (m)"]
        ),

        "population_density": float(
            row["Population Density"]
        ),

        "infrastructure": int(
            row["Infrastructure"]
        ),

        "historical_floods": int(
            row["Historical Floods"]
        ),

        "land_cover": str(
            row["Land Cover"]
        ),

        "soil_type": str(
            row["Soil Type"]
        ),

        "flood_occurred": int(
            row["Flood Occurred"]
        ),

        "risk": risk_result
    })


# ==========================================
# VIRTUAL SENSOR
# ==========================================

@app.route("/api/sensor/<int:index>")
def sensor(index):

    if index < 0 or index >= len(df):

        return jsonify({
            "error": "Sensor reading not found"
        }), 404

    row = df.iloc[index]

    risk_result = calculate_risk(row)

    warning = risk_result.get(
        "warning",
        {}
    )

    return jsonify({

        "sensor_id": f"VIRTUAL-{index + 1:05d}",

        "record": index,

        "record_index": index,

        "timestamp": pd.Timestamp.now().isoformat(),

        "location": {

            "latitude": float(
                row["Latitude"]
            ),

            "longitude": float(
                row["Longitude"]
            )
        },

        "readings": {

            "rainfall": float(
                row["Rainfall (mm)"]
            ),

            "temperature": float(
                row["Temperature (°C)"]
            ),

            "humidity": float(
                row["Humidity (%)"]
            ),

            "river_discharge": float(
                row["River Discharge (m³/s)"]
            ),

            "water_level": float(
                row["Water Level (m)"]
            )
        },

        "risk": risk_result,

        "early_warning": {

            "level": warning.get(
                "level",
                risk_result.get(
                    "risk_level",
                    "LOW"
                )
            ),

            "title": warning.get(
                "title",
                "Flood Monitoring"
            ),

            "message": warning.get(
                "message",
                "Continue monitoring."
            ),

            "reason": warning.get(
                "reason_text",
                ""
            ),

            "reasons": warning.get(
                "reasons",
                []
            ),

            "recommended_action": warning.get(
                "recommended_action",
                risk_result.get(
                    "recommendation",
                    ""
                )
            ),

            "score": warning.get(
                "score",
                risk_result.get(
                    "risk_score",
                    0
                )
            )
        }
    })


# ==========================================
# EARLY WARNING API
# ==========================================

@app.route("/api/alert/<int:index>")
def alert(index):

    if index < 0 or index >= len(df):

        return jsonify({
            "error": "Alert record not found"
        }), 404

    row = df.iloc[index]

    risk_result = calculate_risk(row)

    warning = risk_result.get(
        "warning",
        {}
    )

    return jsonify({

        "alert_id": f"DRISHTI-ALERT-{index + 1:05d}",

        "record": index,

        "timestamp": pd.Timestamp.now().isoformat(),

        "location": {

            "latitude": float(
                row["Latitude"]
            ),

            "longitude": float(
                row["Longitude"]
            )
        },

        "risk_level": risk_result[
            "risk_level"
        ],

        "risk_score": risk_result[
            "risk_score"
        ],

        "title": warning.get(
            "title",
            "Flood Monitoring"
        ),

        "message": warning.get(
            "message",
            ""
        ),

        "reason": warning.get(
            "reason_text",
            ""
        ),

        "reasons": warning.get(
            "reasons",
            []
        ),

        "recommended_action": warning.get(
            "recommended_action",
            ""
        )
    })




# ==========================================
# INCIDENT MANAGEMENT API
# ==========================================
@app.route("/api/incidents", methods=["GET", "POST", "DELETE", "OPTIONS"])
def incidents():
    if request.method == "OPTIONS":
        return ("", 204)

    if request.method == "GET":
        with _incidents_lock:
            items = _read_incidents()
        return jsonify({"incidents": items, "count": len(items), "source": "backend-store"})

    if request.method == "POST":
        incident = _normalise_incident(request.get_json(silent=True))
        if incident is None:
            return jsonify({"error": "Invalid incident payload. An id and numeric score/location are required."}), 400
        with _incidents_lock:
            items = _read_incidents()
            items = [item for item in items if item.get("id") != incident["id"]]
            items.insert(0, incident)
            items = items[:100]
            _write_incidents(items)
        return jsonify({"ok": True, "incident": incident, "count": len(items)}), 201

    with _incidents_lock:
        _write_incidents([])
    return jsonify({"ok": True, "deleted": True})


@app.route("/api/incidents/<path:incident_id>", methods=["PATCH", "OPTIONS"])
def update_incident(incident_id):
    if request.method == "OPTIONS":
        return ("", 204)
    payload = request.get_json(silent=True) or {}
    status = str(payload.get("status", "")).upper()
    if status not in _VALID_STATUSES:
        return jsonify({"error": "Invalid status", "allowed": sorted(_VALID_STATUSES)}), 400
    with _incidents_lock:
        items = _read_incidents()
        found = False
        for item in items:
            if item.get("id") == incident_id:
                item["status"] = status
                found = True
                updated = item
                break
        if not found:
            return jsonify({"error": "Incident not found", "id": incident_id}), 404
        _write_incidents(items)
    return jsonify({"ok": True, "incident": updated})


# ==========================================
# CITIZEN PHOTO + LOCATION REPORTING API
# ==========================================
@app.route("/api/reports", methods=["GET", "POST", "OPTIONS"])
def citizen_reports():
    if request.method == "OPTIONS":
        return ("", 204)
    if request.method == "GET":
        with _reports_lock:
            reports = _read_reports()
        return jsonify({"reports": reports, "count": len(reports), "source": "backend-store"})

    title = str(request.form.get("title", "")).strip()[:120]
    hazard_type = str(request.form.get("hazard_type", "Other emergency")).strip()[:80]
    description = str(request.form.get("description", "")).strip()[:2000]
    location_text = str(request.form.get("location_text", "")).strip()[:250]
    reporter = str(request.form.get("reporter", "Citizen")).strip()[:80] or "Citizen"
    upload = request.files.get("photo")
    if not title or not description or not location_text:
        return jsonify({"error": "Title, description, and location/landmark are required."}), 400
    if upload is None or not upload.filename:
        return jsonify({"error": "Please attach a photo."}), 400
    original = secure_filename(upload.filename)
    extension = original.rsplit(".", 1)[-1].lower() if "." in original else ""
    if extension not in _ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({"error": "Unsupported image type. Use JPG, PNG, or WEBP."}), 400
    # Verify content type as an additional guard; file extension is not the only check.
    if upload.mimetype not in {"image/jpeg", "image/png", "image/webp", "application/octet-stream"}:
        return jsonify({"error": "Uploaded file must be an image."}), 400
    try:
        latitude_text = request.form.get("latitude", "").strip()
        longitude_text = request.form.get("longitude", "").strip()
        if bool(latitude_text) != bool(longitude_text):
            return jsonify({"error": "Provide both latitude and longitude, or neither."}), 400
        latitude = float(latitude_text) if latitude_text else None
        longitude = float(longitude_text) if longitude_text else None
        if latitude is not None and not (-90 <= latitude <= 90):
            raise ValueError
        if longitude is not None and not (-180 <= longitude <= 180):
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid latitude/longitude coordinates."}), 400

    report_id = "DR-" + datetime.now().strftime("%Y%m%d") + "-" + uuid.uuid4().hex[:8].upper()
    filename = f"{report_id}.{extension}"
    upload.save(REPORT_UPLOAD_DIR / filename)
    report = {
        "id": report_id,
        "created_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "reporter": reporter,
        "title": title,
        "hazard_type": hazard_type,
        "description": description,
        "location_text": location_text,
        "latitude": latitude,
        "longitude": longitude,
        "photo_filename": filename,
        "photo_url": f"http://127.0.0.1:5000/uploads/reports/{filename}",
        "status": "NEW"
    }
    with _reports_lock:
        reports = _read_reports()
        reports.insert(0, report)
        reports = reports[:500]
        _write_reports(reports)
    return jsonify({"ok": True, "report": report, "count": len(reports)}), 201


@app.route("/api/reports/<path:report_id>", methods=["PATCH", "OPTIONS"])
def update_citizen_report(report_id):
    if request.method == "OPTIONS":
        return ("", 204)
    payload = request.get_json(silent=True) or {}
    action = str(payload.get("action", "")).upper()
    status = str(payload.get("status", "")).upper()
    if action == "ACCEPT":
        volunteer_name = str(payload.get("volunteer_name", "")).strip()[:100]
        volunteer_contact = str(payload.get("volunteer_contact", "")).strip()[:100]
        if not volunteer_name or not volunteer_contact:
            return jsonify({"error": "Volunteer name and contact are required to accept a report"}), 400
        with _reports_lock:
            reports = _read_reports()
            report = next((item for item in reports if item.get("id") == report_id), None)
            if report is None:
                return jsonify({"error": "Report not found", "id": report_id}), 404
            if report.get("status") == "RESOLVED":
                return jsonify({"error": "This report is already resolved"}), 409
            if report.get("volunteer_name") and report.get("status") in {"RESPONDING", "ACKNOWLEDGED"}:
                return jsonify({"error": "A volunteer has already accepted this report"}), 409
            report["volunteer_name"] = volunteer_name
            report["volunteer_contact"] = volunteer_contact
            report["volunteer_latitude"] = payload.get("volunteer_latitude")
            report["volunteer_longitude"] = payload.get("volunteer_longitude")
            report["status"] = "RESPONDING"
            report["messages"] = report.get("messages", [])
            report["updated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
            _write_reports(reports)
        return jsonify({"ok": True, "report": report})
    if status not in _REPORT_STATUSES:
        return jsonify({"error": "Invalid status", "allowed": sorted(_REPORT_STATUSES)}), 400
    with _reports_lock:
        reports = _read_reports()
        report = next((item for item in reports if item.get("id") == report_id), None)
        if report is None:
            return jsonify({"error": "Report not found", "id": report_id}), 404
        report["status"] = status
        report["updated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
        _write_reports(reports)
    return jsonify({"ok": True, "report": report})


@app.route("/api/reports/<path:report_id>/messages", methods=["GET", "POST", "OPTIONS"])
def citizen_report_messages(report_id):
    if request.method == "OPTIONS":
        return ("", 204)
    with _reports_lock:
        reports = _read_reports()
        report = next((item for item in reports if item.get("id") == report_id), None)
        if report is None:
            return jsonify({"error": "Report not found", "id": report_id}), 404
        messages = report.get("messages", [])
        if request.method == "GET":
            return jsonify({"messages": messages, "count": len(messages)})
        payload = request.get_json(silent=True) or {}
        sender = str(payload.get("sender", "")).strip()[:100]
        message = str(payload.get("message", "")).strip()[:1000]
        if not sender or not message:
            return jsonify({"error": "sender and message are required"}), 400
        entry = {"id": str(uuid.uuid4()), "sender": sender, "message": message,
                 "created_at": datetime.now().astimezone().isoformat(timespec="seconds")}
        messages.append(entry)
        report["messages"] = messages[-100:]
        report["updated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
        _write_reports(reports)
        return jsonify({"ok": True, "message": entry}), 201


@app.route("/uploads/reports/<path:filename>")
def uploaded_report_photo(filename):
    return send_from_directory(REPORT_UPLOAD_DIR, filename, as_attachment=False)


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({"error": "Upload too large. Image must be 8 MB or smaller."}), 413


# ==========================================
# START SERVER
# ==========================================
@app.route("/api/weather")
def weather():
    lat = request.args.get("latitude", type=float)
    lon = request.args.get("longitude", type=float)

    # If coordinates are not provided, use the first dataset location.
    if lat is None or lon is None:
        lat = float(df.iloc[0]["Latitude"])
        lon = float(df.iloc[0]["Longitude"])

    try:
        url = "https://api.open-meteo.com/v1/forecast"

        params = {
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m,rain,precipitation,weather_code,wind_speed_10m",
            "hourly": "precipitation_probability,rain",
            "forecast_days": 1,
            "timezone": "auto"
        }

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        hourly = data.get("hourly", {})
        probabilities = hourly.get("precipitation_probability", [])[:6]
        rain_values = hourly.get("rain", [])[:6]

        return jsonify({
            "source": "Open-Meteo",
            "location": {
                "latitude": lat,
                "longitude": lon
            },
            "current": data.get("current", {}),
            "next_6_hours": {
                "max_rain_probability": max(probabilities) if probabilities else 0,
                "max_rain_mm": max(rain_values) if rain_values else 0
            },
            "status": "online"
        })

    except Exception as e:
        return jsonify({
            "status": "offline",
            "error": str(e)
        }), 502

# ==========================================
# VOLUNTEER NETWORK API
# These routes must remain BEFORE the __main__ app.run block.
# ==========================================

VOLUNTEERS_PATH = Path(__file__).resolve().parent / "drishti_volunteers.json"
VOLUNTEER_ALERTS_PATH = Path(__file__).resolve().parent / "drishti_volunteer_alerts.json"
VOLUNTEER_TASKS_PATH = Path(__file__).resolve().parent / "drishti_volunteer_tasks.json"
_volunteer_lock = threading.Lock()
_VOLUNTEER_STATUSES = {"ASSIGNED", "ACCEPTED", "ON_THE_WAY", "COMPLETED"}


def _read_json_list(path):
    try:
        if not path.exists():
            return []
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        app.logger.exception("Could not read %s", path.name)
        return []


def _write_json_list(path, items):
    temp_path = path.with_suffix(".tmp")
    temp_path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_path.replace(path)


@app.route("/api/volunteers", methods=["GET", "POST", "OPTIONS"])
def volunteer_directory():
    if request.method == "OPTIONS":
        return ("", 204)
    if request.method == "GET":
        with _volunteer_lock:
            items = _read_json_list(VOLUNTEERS_PATH)
        return jsonify({"volunteers": items, "count": len(items)})

    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()[:100]
    area = str(data.get("area", "")).strip()[:150]
    contact = str(data.get("contact", "")).strip()[:80]
    skills = data.get("skills", [])
    availability = str(data.get("availability", "Available")).strip()[:80]
    if not name or not area or not contact:
        return jsonify({"error": "name, area, and contact are required"}), 400
    if isinstance(skills, str):
        skills = [x.strip() for x in skills.split(",") if x.strip()]
    if not isinstance(skills, list):
        return jsonify({"error": "skills must be a list or comma-separated string"}), 400

    volunteer = {
        "id": str(uuid.uuid4()),
        "name": name,
        "area": area,
        "contact": contact,
        "skills": [str(x).strip()[:80] for x in skills if str(x).strip()][:20],
        "availability": availability or "Available",
        "created_at": datetime.now().astimezone().isoformat(timespec="seconds")
    }
    with _volunteer_lock:
        items = _read_json_list(VOLUNTEERS_PATH)
        items.append(volunteer)
        _write_json_list(VOLUNTEERS_PATH, items)
    return jsonify({"ok": True, "volunteer": volunteer}), 201


@app.route("/api/volunteer-alerts", methods=["GET", "POST", "OPTIONS"])
def volunteer_alerts():
    if request.method == "OPTIONS":
        return ("", 204)
    if request.method == "GET":
        with _volunteer_lock:
            items = _read_json_list(VOLUNTEER_ALERTS_PATH)
        return jsonify({"alerts": items, "count": len(items)})

    data = request.get_json(silent=True) or {}
    area = str(data.get("area", "")).strip()[:150]
    title = str(data.get("title", "")).strip()[:180]
    if not area or not title:
        return jsonify({"error": "area and title are required"}), 400
    alert = {
        "id": str(uuid.uuid4()),
        "area": area,
        "title": title,
        "hazard_type": str(data.get("hazard_type", "Flood")).strip()[:100] or "Flood",
        "instructions": str(data.get("instructions", "")).strip()[:2000],
        "required_help": str(data.get("required_help", "")).strip()[:500],
        "created_at": datetime.now().astimezone().isoformat(timespec="seconds")
    }
    with _volunteer_lock:
        items = _read_json_list(VOLUNTEER_ALERTS_PATH)
        items.append(alert)
        _write_json_list(VOLUNTEER_ALERTS_PATH, items)
    return jsonify({"ok": True, "alert": alert}), 201


@app.route("/api/volunteer-assignments", methods=["GET", "POST", "OPTIONS"])
def volunteer_assignments():
    if request.method == "OPTIONS":
        return ("", 204)
    if request.method == "GET":
        volunteer_id = request.args.get("volunteer_id", "").strip()
        with _volunteer_lock:
            items = _read_json_list(VOLUNTEER_TASKS_PATH)
        if volunteer_id:
            items = [x for x in items if x.get("volunteer_id") == volunteer_id]
        return jsonify({"assignments": items, "count": len(items)})

    data = request.get_json(silent=True) or {}
    volunteer_id = str(data.get("volunteer_id", "")).strip()
    alert_id = str(data.get("alert_id", "")).strip()
    if not volunteer_id or not alert_id:
        return jsonify({"error": "volunteer_id and alert_id are required"}), 400

    with _volunteer_lock:
        volunteers = _read_json_list(VOLUNTEERS_PATH)
        alerts = _read_json_list(VOLUNTEER_ALERTS_PATH)
        volunteer = next((x for x in volunteers if x.get("id") == volunteer_id), None)
        alert = next((x for x in alerts if x.get("id") == alert_id), None)
        if volunteer is None:
            return jsonify({"error": "Volunteer not found"}), 404
        if alert is None:
            return jsonify({"error": "Volunteer alert not found"}), 404

        task = {
            "id": str(uuid.uuid4()),
            "volunteer_id": volunteer["id"],
            "volunteer_name": volunteer.get("name", ""),
            "volunteer_contact": volunteer.get("contact", ""),
            "volunteer_area": volunteer.get("area", ""),
            "alert_id": alert["id"],
            "alert_title": alert.get("title", ""),
            "hazard_type": alert.get("hazard_type", "Flood"),
            "area": alert.get("area", ""),
            "rescue_team": str(data.get("rescue_team", "")).strip()[:150],
            "instructions": str(data.get("instructions", "")).strip()[:2000] or alert.get("instructions", ""),
            "required_help": alert.get("required_help", ""),
            "status": "ASSIGNED",
            "assigned_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "updated_at": datetime.now().astimezone().isoformat(timespec="seconds")
        }
        items = _read_json_list(VOLUNTEER_TASKS_PATH)
        items.append(task)
        _write_json_list(VOLUNTEER_TASKS_PATH, items)
    return jsonify({"ok": True, "assignment": task}), 201


@app.route("/api/volunteer-assignments/<task_id>", methods=["PATCH", "OPTIONS"])
def update_volunteer_assignment(task_id):
    if request.method == "OPTIONS":
        return ("", 204)
    data = request.get_json(silent=True) or {}
    status = str(data.get("status", "")).strip().upper()
    if status not in _VOLUNTEER_STATUSES:
        return jsonify({"error": "Invalid task status", "allowed": sorted(_VOLUNTEER_STATUSES)}), 400

    with _volunteer_lock:
        items = _read_json_list(VOLUNTEER_TASKS_PATH)
        task = next((x for x in items if x.get("id") == task_id), None)
        if task is None:
            return jsonify({"error": "Assignment not found", "id": task_id}), 404
        task["status"] = status
        task["updated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
        _write_json_list(VOLUNTEER_TASKS_PATH, items)
    return jsonify({"ok": True, "assignment": task})



# Rescue reports submitted by people who are stranded or need urgent help.
RESCUE_REPORTS_PATH = Path(__file__).resolve().parent / "drishti_rescue_reports.json"
_RESCUE_REPORT_STATUSES = {"OPEN", "HELP_ACCEPTED", "RESOLVED"}


@app.route("/api/rescue-reports", methods=["GET", "POST", "OPTIONS"])
def rescue_reports():
    if request.method == "OPTIONS":
        return ("", 204)
    if request.method == "GET":
        with _volunteer_lock:
            items = _read_json_list(RESCUE_REPORTS_PATH)
        status = request.args.get("status", "").strip().upper()
        if status:
            items = [item for item in items if item.get("status") == status]
        items.sort(key=lambda item: (item.get("severity_rank", 1), item.get("created_at", "")))
        return jsonify({"reports": items, "count": len(items)})

    data = request.get_json(silent=True) or {}
    reporter = str(data.get("reporter", "Anonymous")).strip()[:100] or "Anonymous"
    area = str(data.get("area", "")).strip()[:200]
    details = str(data.get("details", "")).strip()[:2000]
    people_raw = data.get("people_count", 1)
    severity = str(data.get("severity", "HIGH")).strip().upper()
    contact = str(data.get("contact", "")).strip()[:100]
    latitude = str(data.get("latitude", "")).strip()[:40]
    longitude = str(data.get("longitude", "")).strip()[:40]
    if not area or not details:
        return jsonify({"error": "area and details are required"}), 400
    if severity not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
        return jsonify({"error": "severity must be LOW, MEDIUM, HIGH, or CRITICAL"}), 400
    try:
        people_count = max(1, min(10000, int(people_raw)))
    except (TypeError, ValueError):
        return jsonify({"error": "people_count must be a whole number"}), 400
    report = {
        "id": str(uuid.uuid4()), "reporter": reporter, "area": area,
        "title": str(data.get("title", "")).strip()[:180],
        "details": details, "people_count": people_count, "severity": severity,
        "severity_rank": {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}[severity],
        "contact": contact, "latitude": latitude, "longitude": longitude,
        "status": "OPEN", "accepted_by": "", "accepted_by_id": "",
        "created_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "updated_at": datetime.now().astimezone().isoformat(timespec="seconds")
    }
    with _volunteer_lock:
        items = _read_json_list(RESCUE_REPORTS_PATH)
        items.append(report)
        _write_json_list(RESCUE_REPORTS_PATH, items)
    return jsonify({"ok": True, "report": report}), 201


@app.route("/api/rescue-reports/<report_id>", methods=["PATCH", "OPTIONS"])
def update_rescue_report(report_id):
    if request.method == "OPTIONS":
        return ("", 204)
    data = request.get_json(silent=True) or {}
    action = str(data.get("action", "")).strip().upper()
    volunteer_id = str(data.get("volunteer_id", "")).strip()
    if action not in {"ACCEPT", "RESOLVE"}:
        return jsonify({"error": "action must be ACCEPT or RESOLVE"}), 400
    with _volunteer_lock:
        reports = _read_json_list(RESCUE_REPORTS_PATH)
        report = next((item for item in reports if item.get("id") == report_id), None)
        if report is None:
            return jsonify({"error": "Rescue report not found"}), 404
        if action == "ACCEPT":
            volunteer_name = str(data.get("volunteer_name", "")).strip()[:100]
            volunteer_contact = str(data.get("volunteer_contact", "")).strip()[:100]
            if not volunteer_name or not volunteer_contact:
                return jsonify({"error": "Volunteer name and contact are required; registration is not needed"}), 400
            if report.get("status") == "RESOLVED":
                return jsonify({"error": "This report is already resolved"}), 409
            if report.get("status") == "HELP_ACCEPTED" and report.get("accepted_by") != volunteer_name:
                return jsonify({"error": "Another volunteer has already accepted this report"}), 409
            report["status"] = "HELP_ACCEPTED"
            report["accepted_by"] = volunteer_name
            report["accepted_by_id"] = ""
            report["volunteer_contact"] = volunteer_contact
            report["messages"] = report.get("messages", [])
        else:
            report["status"] = "RESOLVED"
        report["updated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
        _write_json_list(RESCUE_REPORTS_PATH, reports)
    return jsonify({"ok": True, "report": report})


@app.route("/api/rescue-reports/<report_id>/messages", methods=["GET", "POST", "OPTIONS"])
def rescue_report_messages(report_id):
    if request.method == "OPTIONS":
        return ("", 204)
    with _volunteer_lock:
        reports = _read_json_list(RESCUE_REPORTS_PATH)
        report = next((item for item in reports if item.get("id") == report_id), None)
        if report is None:
            return jsonify({"error": "Rescue report not found"}), 404
        messages = report.get("messages", [])
        if request.method == "GET":
            return jsonify({"messages": messages, "count": len(messages)})
        payload = request.get_json(silent=True) or {}
        sender = str(payload.get("sender", "")).strip()[:100]
        message = str(payload.get("message", "")).strip()[:1000]
        if not sender or not message:
            return jsonify({"error": "sender and message are required"}), 400
        entry = {"id": str(uuid.uuid4()), "sender": sender, "message": message,
                 "created_at": datetime.now().astimezone().isoformat(timespec="seconds")}
        messages.append(entry)
        report["messages"] = messages[-100:]
        report["updated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
        _write_json_list(RESCUE_REPORTS_PATH, reports)
        return jsonify({"ok": True, "message": entry}), 201


if __name__ == "__main__":

    print()
    print("======================================")
    print("DRISHTI BACKEND STARTING")
    print("======================================")

    print(f"Dataset records: {len(df)}")
    print("Risk Engine: ONLINE")
    print("Early Warning Engine: ONLINE")
    print("Sensor API: ONLINE")
    print("Alert API: ONLINE")

    print("======================================")

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
