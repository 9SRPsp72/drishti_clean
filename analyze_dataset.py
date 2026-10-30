import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer


# ==========================================
# 1. LOAD DATASET
# ==========================================

DATASET_PATH = "data/flood_risk_dataset_india.csv"

df = pd.read_csv(DATASET_PATH)

print("\n======================================")
print("DRISHTI FLOOD DATASET ANALYSIS")
print("======================================")

print("\nDataset shape:")
print(df.shape)


# ==========================================
# 2. TARGET DISTRIBUTION
# ==========================================

target = "Flood Occurred"

print("\n======================================")
print("TARGET DISTRIBUTION")
print("======================================")

print(df[target].value_counts())

print("\nPercentage:")

print(
    df[target]
    .value_counts(normalize=True)
    .mul(100)
    .round(2)
)


# ==========================================
# 3. MISSING VALUES
# ==========================================

print("\n======================================")
print("MISSING VALUES")
print("======================================")

missing = df.isnull().sum()

print(
    missing[
        missing > 0
    ]
)


# ==========================================
# 4. DUPLICATES
# ==========================================

print("\n======================================")
print("DUPLICATE RECORDS")
print("======================================")

print(
    "Duplicate rows:",
    df.duplicated().sum()
)


# ==========================================
# 5. UNIQUE VALUES
# ==========================================

print("\n======================================")
print("UNIQUE VALUES")
print("======================================")

for column in df.columns:

    print(
        f"{column}: "
        f"{df[column].nunique()} unique"
    )


# ==========================================
# 6. NUMERIC CORRELATION WITH TARGET
# ==========================================

print("\n======================================")
print("NUMERIC FEATURE CORRELATION")
print("======================================")

numeric_df = df.select_dtypes(
    include="number"
)

correlation = (
    numeric_df
    .corr()[target]
    .sort_values(
        ascending=False
    )
)

print(correlation)


# ==========================================
# 7. BASIC STATISTICS
# ==========================================

print("\n======================================")
print("NUMERIC STATISTICS")
print("======================================")

print(
    numeric_df.describe().round(2)
)


# ==========================================
# 8. PREPARE DATA FOR FEATURE IMPORTANCE
# ==========================================

X = df.drop(
    columns=[target]
)

y = pd.to_numeric(
    df[target],
    errors="coerce"
)

valid = y.notna()

X = X.loc[valid]

y = y.loc[valid].astype(int)


numeric_features = X.select_dtypes(
    include=["int64", "float64", "int32", "float32"]
).columns.tolist()


categorical_features = X.select_dtypes(
    include=["object"]
).columns.tolist()


# ==========================================
# 9. PREPROCESSING
# ==========================================

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


# ==========================================
# 10. RANDOM FOREST
# ==========================================

model = RandomForestClassifier(
    n_estimators=300,
    random_state=42,
    class_weight="balanced",
    n_jobs=-1
)


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


# ==========================================
# 11. TRAIN
# ==========================================

X_train, X_test, y_train, y_test = train_test_split(

    X,
    y,

    test_size=0.20,

    random_state=42,

    stratify=y
)


print("\n======================================")
print("TRAINING")
print("======================================")

pipeline.fit(
    X_train,
    y_train
)


# ==========================================
# 12. FEATURE IMPORTANCE
# ==========================================

rf = pipeline.named_steps["model"]

pre = pipeline.named_steps[
    "preprocessing"
]


feature_names = (
    pre
    .get_feature_names_out()
)


importance = rf.feature_importances_


feature_importance = pd.DataFrame({

    "Feature": feature_names,

    "Importance": importance

})


feature_importance = (
    feature_importance
    .sort_values(
        "Importance",
        ascending=False
    )
)


print("\n======================================")
print("TOP FEATURE IMPORTANCE")
print("======================================")

print(
    feature_importance
    .head(20)
    .to_string(index=False)
)


print("\n======================================")
print("ANALYSIS COMPLETE")
print("======================================")
# ==========================================
# 13. CATEGORICAL FEATURE ANALYSIS
# ==========================================

print("\n======================================")
print("CATEGORICAL FEATURE VS FLOOD OUTCOME")
print("======================================")


for column in categorical_features:

    print(f"\n--- {column} ---")

    table = pd.crosstab(

        df[column],

        df[target],

        normalize="index"

    ) * 100

    print(
        table.round(2)
    )


# ==========================================
# 14. BINARY FEATURE ANALYSIS
# ==========================================

binary_features = [
    "Infrastructure",
    "Historical Floods"
]


print("\n======================================")
print("BINARY FEATURE VS FLOOD OUTCOME")
print("======================================")


for column in binary_features:

    if column in df.columns:

        table = pd.crosstab(

            df[column],

            df[target],

            normalize="index"

        ) * 100


        print(f"\n--- {column} ---")

        print(
            table.round(2)
        )


print("\n======================================")
print("FINAL DATASET CHECK COMPLETE")
print("======================================")