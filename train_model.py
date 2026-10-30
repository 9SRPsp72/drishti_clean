import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.impute import SimpleImputer

from sklearn.ensemble import RandomForestClassifier

from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix
)

import joblib


# =========================================================
# 1. LOAD DATASET
# =========================================================

DATASET_PATH = "data/flood_risk_dataset_india.csv"

print("\nLoading dataset...")

df = pd.read_csv(DATASET_PATH)

print("Dataset loaded successfully!")
print("Rows:", len(df))
print("Columns:", len(df.columns))


# =========================================================
# 2. DISPLAY DATASET INFORMATION
# =========================================================

print("\nDataset columns:")

for column in df.columns:
    print("-", column)


# =========================================================
# 3. TARGET COLUMN
# =========================================================

TARGET = "Flood Occurred"


if TARGET not in df.columns:

    raise ValueError(
        f"Target column '{TARGET}' was not found."
    )


# =========================================================
# 4. REMOVE TARGET FROM FEATURES
# =========================================================

X = df.drop(columns=[TARGET])

y = df[TARGET]


# =========================================================
# 5. HANDLE TARGET VALUES
# =========================================================

y = pd.to_numeric(
    y,
    errors="coerce"
)

valid = y.notna()

X = X.loc[valid].copy()

y = y.loc[valid].astype(int)


# =========================================================
# 6. IDENTIFY COLUMN TYPES
# =========================================================

numeric_features = X.select_dtypes(
    include=["int64", "float64", "int32", "float32"]
).columns.tolist()


categorical_features = X.select_dtypes(
    include=["object"]
).columns.tolist()


print("\nNumeric features:")

for column in numeric_features:
    print("-", column)


print("\nCategorical features:")

for column in categorical_features:
    print("-", column)


# =========================================================
# 7. PREPROCESSING
# =========================================================

numeric_pipeline = Pipeline(
    steps=[

        (
            "imputer",
            SimpleImputer(
                strategy="median"
            )
        )

    ]
)


categorical_pipeline = Pipeline(
    steps=[

        (
            "imputer",
            SimpleImputer(
                strategy="most_frequent"
            )
        ),

        (
            "encoder",
            OneHotEncoder(
                handle_unknown="ignore"
            )
        )

    ]
)


preprocessor = ColumnTransformer(

    transformers=[

        (
            "numeric",
            numeric_pipeline,
            numeric_features
        ),

        (
            "categorical",
            categorical_pipeline,
            categorical_features
        )

    ]

)


# =========================================================
# 8. RANDOM FOREST MODEL
# =========================================================

model = RandomForestClassifier(

    n_estimators=200,

    random_state=42,

    class_weight="balanced",

    n_jobs=-1

)


# =========================================================
# 9. COMPLETE ML PIPELINE
# =========================================================

pipeline = Pipeline(

    steps=[

        (
            "preprocessing",
            preprocessor
        ),

        (
            "model",
            model
        )

    ]

)


# =========================================================
# 10. TRAIN / TEST SPLIT
# =========================================================

X_train, X_test, y_train, y_test = train_test_split(

    X,

    y,

    test_size=0.20,

    random_state=42,

    stratify=y

)


print("\nTraining records:", len(X_train))

print("Testing records:", len(X_test))


# =========================================================
# 11. TRAIN MODEL
# =========================================================

print("\nTraining Random Forest model...")

pipeline.fit(
    X_train,
    y_train
)

print("Training completed!")


# =========================================================
# 12. PREDICTION
# =========================================================

print("\nTesting model...")

y_pred = pipeline.predict(
    X_test
)


# =========================================================
# 13. ACCURACY
# =========================================================

accuracy = accuracy_score(

    y_test,

    y_pred

)


print("\n===================================")

print(
    f"MODEL ACCURACY: {accuracy * 100:.2f}%"
)

print("===================================")


# =========================================================
# 14. CLASSIFICATION REPORT
# =========================================================

print("\nClassification Report:")

print(
    classification_report(
        y_test,
        y_pred
    )
)


# =========================================================
# 15. CONFUSION MATRIX
# =========================================================

print("\nConfusion Matrix:")

print(
    confusion_matrix(
        y_test,
        y_pred
    )
)


# =========================================================
# 16. SAVE MODEL
# =========================================================

MODEL_PATH = "flood_model.joblib"

joblib.dump(
    pipeline,
    MODEL_PATH
)


print("\n===================================")

print(
    f"Model saved as: {MODEL_PATH}"
)

print("===================================")


# =========================================================
# 17. TEST ONE SAMPLE
# =========================================================

sample = X_test.iloc[[0]]

actual = y_test.iloc[0]

prediction = pipeline.predict(
    sample
)[0]


probability = pipeline.predict_proba(
    sample
)[0]


print("\nSample Prediction:")

print(
    "Actual Flood Occurred:",
    actual
)

print(
    "Predicted Flood Occurred:",
    prediction
)


print(
    "No Flood Probability:",
    f"{probability[0] * 100:.2f}%"
)


print(
    "Flood Probability:",
    f"{probability[1] * 100:.2f}%"
)


print("\nML model is ready.")