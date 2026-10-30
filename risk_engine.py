# ============================================================
# DRISHTI - FLOOD RISK & EARLY WARNING ENGINE
# ============================================================

import pandas as pd
import numpy as np


# ------------------------------------------------------------
# DATASET
# ------------------------------------------------------------

DATASET_PATH = "data/flood_risk_dataset_india.csv"

df = pd.read_csv(DATASET_PATH)


# ------------------------------------------------------------
# PERCENTILE HELPER
# ------------------------------------------------------------

def percentile(value, series):
    """
    Returns the approximate percentile of a value
    within the dataset.
    """

    return float(
        (series <= value).mean() * 100
    )


# ------------------------------------------------------------
# INDICATOR LEVEL
# ------------------------------------------------------------

def indicator_level(p):

    if p >= 90:
        return "CRITICAL"

    elif p >= 75:
        return "HIGH"

    elif p >= 50:
        return "MEDIUM"

    else:
        return "LOW"


# ------------------------------------------------------------
# EARLY WARNING MESSAGE
# ------------------------------------------------------------

def generate_warning(risk_level, indicators, score):

    reasons = []


    # Rainfall

    rainfall_level = \
        indicators["rainfall"]["level"]

    if rainfall_level in ["HIGH", "CRITICAL"]:

        reasons.append(
            "elevated rainfall conditions"
        )


    # Water level

    water_level = \
        indicators["water_level"]["level"]

    if water_level in ["HIGH", "CRITICAL"]:

        reasons.append(
            "elevated water level"
        )


    # River discharge

    river_level = \
        indicators["river_discharge"]["level"]

    if river_level in ["HIGH", "CRITICAL"]:

        reasons.append(
            "high river discharge"
        )


    # Historical floods

    history_level = \
        indicators["historical_floods"]["level"]

    if history_level == "CRITICAL":

        reasons.append(
            "historical flood activity"
        )


    # --------------------------------------------------------
    # WARNING LEVEL
    # --------------------------------------------------------

    if risk_level == "CRITICAL":

        title = "🚨 CRITICAL FLOOD WARNING"

        message = (
            "Critical flood-risk conditions detected. "
            "Immediate attention is recommended."
        )

        action = (
            "Move toward a verified safe location "
            "and follow official emergency guidance."
        )


    elif risk_level == "HIGH":

        title = "⚠️ HIGH FLOOD RISK"

        message = (
            "High-risk flood conditions detected. "
            "Stay alert and prepare for possible flooding."
        )

        action = (
            "Monitor updates closely and prepare "
            "for possible evacuation."
        )


    elif risk_level == "MEDIUM":

        title = "🟡 FLOOD WATCH"

        message = (
            "Moderate flood-risk conditions detected. "
            "Continue monitoring the situation."
        )

        action = (
            "Stay alert and keep emergency information "
            "and safe-location details available."
        )


    else:

        title = "🟢 NORMAL MONITORING"

        message = (
            "Current simulated indicators are "
            "relatively low."
        )

        action = (
            "Continue normal monitoring."
        )


    # --------------------------------------------------------
    # REASON
    # --------------------------------------------------------

    if reasons:

        reason_text = ", ".join(reasons)

    else:

        reason_text = (
            "No major elevated indicator detected."
        )


    return {

        "title": title,

        "message": message,

        "reasons": reasons,

        "reason_text": reason_text,

        "recommended_action": action,

        "score": round(score, 2),

        "level": risk_level
    }


# ------------------------------------------------------------
# MAIN RISK CALCULATION
# ------------------------------------------------------------

def calculate_risk(row):

    # --------------------------------------------------------
    # CURRENT VALUES
    # --------------------------------------------------------

    rainfall = float(
        row["Rainfall (mm)"]
    )

    water_level = float(
        row["Water Level (m)"]
    )

    river_discharge = float(
        row["River Discharge (m³/s)"]
    )

    humidity = float(
        row["Humidity (%)"]
    )

    historical_floods = float(
        row["Historical Floods"]
    )


    # --------------------------------------------------------
    # DATASET PERCENTILES
    # --------------------------------------------------------

    rainfall_p = percentile(
        rainfall,
        df["Rainfall (mm)"]
    )

    water_p = percentile(
        water_level,
        df["Water Level (m)"]
    )

    river_p = percentile(
        river_discharge,
        df["River Discharge (m³/s)"]
    )

    humidity_p = percentile(
        humidity,
        df["Humidity (%)"]
    )

    historical_p = percentile(
        historical_floods,
        df["Historical Floods"]
    )


    # --------------------------------------------------------
    # INDICATOR LEVELS
    # --------------------------------------------------------

    indicators = {

        "rainfall": {

            "value": rainfall,

            "percentile": round(
                rainfall_p,
                2
            ),

            "level": indicator_level(
                rainfall_p
            )
        },


        "water_level": {

            "value": water_level,

            "percentile": round(
                water_p,
                2
            ),

            "level": indicator_level(
                water_p
            )
        },


        "river_discharge": {

            "value": river_discharge,

            "percentile": round(
                river_p,
                2
            ),

            "level": indicator_level(
                river_p
            )
        },


        "humidity": {

            "value": humidity,

            "percentile": round(
                humidity_p,
                2
            ),

            "level": indicator_level(
                humidity_p
            )
        },


        "historical_floods": {

            "value": historical_floods,

            "percentile": round(
                historical_p,
                2
            ),

            "level": indicator_level(
                historical_p
            )
        }
    }


    # --------------------------------------------------------
    # WEIGHTED RISK SCORE
    # --------------------------------------------------------

    score = (

        rainfall_p * 0.30 +

        water_p * 0.30 +

        river_p * 0.20 +

        humidity_p * 0.10 +

        historical_p * 0.10

    )


    score = float(
        np.clip(score, 0, 100)
    )


    # --------------------------------------------------------
    # OVERALL RISK LEVEL
    # --------------------------------------------------------

    if score >= 80:

        risk_level = "CRITICAL"

    elif score >= 65:

        risk_level = "HIGH"

    elif score >= 40:

        risk_level = "MEDIUM"

    else:

        risk_level = "LOW"


    # --------------------------------------------------------
    # EARLY WARNING
    # --------------------------------------------------------

    warning = generate_warning(
        risk_level,
        indicators,
        score
    )


    # --------------------------------------------------------
    # RECOMMENDATION
    # --------------------------------------------------------

    recommendation = \
        warning["recommended_action"]


    # --------------------------------------------------------
    # FINAL RESPONSE
    # --------------------------------------------------------

    return {

        "risk_score": round(
            score,
            2
        ),

        "risk_level": risk_level,

        "indicators": indicators,

        "warning": warning,

        "recommendation": recommendation,

        "location": {

            "latitude": float(
                row["Latitude"]
            ),

            "longitude": float(
                row["Longitude"]
            )
        }
    }


# ============================================================
# TEST
# ============================================================

if __name__ == "__main__":

    print()
    print("=" * 55)
    print("DRISHTI FLOOD RISK ENGINE")
    print("=" * 55)

    print(
        f"Loaded {len(df)} flood records."
    )

    print()


    # Test first record

    result = calculate_risk(
        df.iloc[0]
    )


    print(
        "TEST RECORD #0"
    )

    print("-" * 55)

    print(
        "Risk:",
        result["risk_level"]
    )

    print(
        "Score:",
        result["risk_score"]
    )

    print(
        "Warning:",
        result["warning"]["title"]
    )

    print(
        "Reason:",
        result["warning"]["reason_text"]
    )

    print(
        "Action:",
        result["warning"]["recommended_action"]
    )

    print("-" * 55)