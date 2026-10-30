# DRISHTI Flood Simulator — Phase 1

Dataset-driven flood monitoring prototype. The bundled CSV is used for simulated virtual-sensor readings; it is not a live physical sensor feed.

## Setup (VS Code)

Run commands from this folder (the folder containing `server.py` and `index.html`).

### 1. Create a fresh Python environment

Windows PowerShell:
```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

macOS/Linux:
```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 2. Start the backend

```bash
python server.py
```

Keep this terminal running. The API is at `http://127.0.0.1:5000`.

### 3. Start the frontend

Open a second terminal in the same project folder:
```bash
python -m http.server 5500
```

Open `http://127.0.0.1:5500` in your browser.

## Demo flow

1. Login as Administrator.
2. Open Virtual Sensors.
3. Click **START LIVE SIMULATION** or **NEXT READING**.
4. Open Prediction and Risk Map.
5. Logout and try Citizen/User view.

## Dataset

The bundled dataset has 10,000 rows and 14 columns. `Flood Occurred` is a historical dataset label; the heuristic risk score is not a validated real-world forecast. Treat all alerts as prototype/demo output until the model and thresholds are validated against reliable real observations.

## Notes

- Do not copy an old `venv` between machines; create a fresh `.venv`.
- `flood_model.joblib` is retained, but the existing backend's sensor endpoint currently calls the heuristic `calculate_risk()` function. Model integration and evaluation remain to be checked.
