"""
인터넷뱅킹 대출심사 ML 분류 모델 (LendingClub 데이터 기반)
타겟: 대출 부도 여부 예측 (0=정상상환, 1=부도)
"""

import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings("ignore")

# ── 1. 데이터 로드 ──────────────────────────────────────────────────────────────
# Kaggle에서 수동 다운로드: https://www.kaggle.com/datasets/wordsforthewise/lending-club
# 파일명: accepted_2007_to_2018Q4.csv.gz (또는 .csv)

KAGGLE_AVAILABLE = False
DATA_PATH = "lending_club.csv"

try:
    import kaggle
    print("Kaggle API로 데이터 다운로드 중...")
    kaggle.api.dataset_download_files(
        "wordsforthewise/lending-club",
        path=".",
        unzip=True,
        quiet=False,
    )
    import glob
    files = glob.glob("accepted_*.csv*")
    DATA_PATH = files[0] if files else DATA_PATH
    KAGGLE_AVAILABLE = True
except Exception:
    print(f"Kaggle API 없음 → '{DATA_PATH}' 파일을 직접 준비해 주세요.")
    print("다운로드: https://www.kaggle.com/datasets/wordsforthewise/lending-club\n")

# ── 2. 심사에 필요한 컬럼만 선택 ───────────────────────────────────────────────
FEATURE_COLS = [
    "loan_amnt",       # 신청 대출금액
    "term",            # 대출기간 (36/60 months)
    "int_rate",        # 금리
    "annual_inc",      # 연소득
    "dti",             # 부채비율 (DTI)
    "fico_range_low",  # 신용점수 하한
    "fico_range_high", # 신용점수 상한
    "emp_length",      # 고용기간
    "home_ownership",  # 주거형태
    "purpose",         # 대출목적
    "delinq_2yrs",     # 최근 2년 연체 건수
    "inq_last_6mths",  # 최근 6개월 신용조회 수
    "open_acc",        # 보유 신용계좌 수
    "pub_rec",         # 공공기록 (파산 등)
    "revol_util",      # 한도 대비 사용률
    "total_acc",       # 총 신용계좌 수
]
TARGET_COL = "loan_status"

print("데이터 로드 중...")
df_raw = pd.read_csv(DATA_PATH, usecols=FEATURE_COLS + [TARGET_COL], low_memory=False)
print(f"원본 데이터: {df_raw.shape[0]:,}행 × {df_raw.shape[1]}열")

# ── 3. 타겟 이진화 ─────────────────────────────────────────────────────────────
# 상환완료 → 0, 부도(Charged Off / Default) → 1
POSITIVE_STATUS = {"Charged Off", "Default", "Does not meet the credit policy. Status:Charged Off"}
df_raw = df_raw[df_raw[TARGET_COL].isin(
    {"Fully Paid", "Does not meet the credit policy. Status:Fully Paid"} | POSITIVE_STATUS
)].copy()

df_raw["target"] = df_raw[TARGET_COL].apply(lambda x: 1 if x in POSITIVE_STATUS else 0)
df_raw.drop(columns=[TARGET_COL], inplace=True)

print(f"유효 데이터: {len(df_raw):,}행")
print(f"부도율: {df_raw['target'].mean():.2%}\n")

# ── 4. 전처리 ──────────────────────────────────────────────────────────────────
# 훈련 전 카테고리 맵 추출 (추론 서버에서 재현할 수 있도록 pkl에 저장)
def extract_category_maps(df: pd.DataFrame) -> dict:
    maps = {}
    for col in ["home_ownership", "purpose"]:
        cat = df[col].astype("category")
        maps[col] = {v: int(c) for c, v in enumerate(cat.cat.categories)}
    return maps

category_maps = extract_category_maps(df_raw)

def preprocess(df: pd.DataFrame, cat_maps: dict | None = None) -> pd.DataFrame:
    df = df.copy()

    # term: "36 months" → 36
    df["term"] = df["term"].str.extract(r"(\d+)").astype(float)

    # emp_length: "10+ years" → 10, "< 1 year" → 0
    df["emp_length"] = (
        df["emp_length"]
        .str.replace(r"\+? years?", "", regex=True)
        .str.replace("< 1", "0")
        .str.strip()
        .replace("n/a", np.nan)
        .astype(float)
    )

    # revol_util: "54.3%" → 54.3
    df["revol_util"] = df["revol_util"].astype(str).str.replace("%", "").replace("nan", np.nan).astype(float)

    # 신용점수 평균
    df["fico_avg"] = (df["fico_range_low"] + df["fico_range_high"]) / 2
    df.drop(columns=["fico_range_low", "fico_range_high"], inplace=True)

    # 범주형 인코딩 (맵 있으면 결정론적 변환, 없으면 cat.codes)
    for col in ["home_ownership", "purpose"]:
        if cat_maps and col in cat_maps:
            df[col] = df[col].map(cat_maps[col]).fillna(-1).astype(int)
        else:
            df[col] = df[col].astype("category").cat.codes

    # 수치형 결측치 → 중앙값
    num_cols = df.select_dtypes(include="number").columns.difference(["target"])
    df[num_cols] = df[num_cols].fillna(df[num_cols].median())

    return df

df = preprocess(df_raw, category_maps)
print("전처리 완료")

# ── 5. 학습/검증 분리 ──────────────────────────────────────────────────────────
from sklearn.model_selection import train_test_split

X = df.drop(columns=["target"])
y = df["target"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
print(f"Train: {len(X_train):,}  Test: {len(X_test):,}\n")

# ── 6. 모델 학습 (LightGBM) ────────────────────────────────────────────────────
try:
    import lightgbm as lgb
    MODEL_NAME = "LightGBM"

    model = lgb.LGBMClassifier(
        n_estimators=500,
        learning_rate=0.05,
        num_leaves=63,
        max_depth=-1,
        scale_pos_weight=(y_train == 0).sum() / (y_train == 1).sum(),  # 불균형 보정
        random_state=42,
        n_jobs=-1,
        verbose=-1,
    )
except ImportError:
    from sklearn.ensemble import GradientBoostingClassifier
    MODEL_NAME = "GradientBoosting (LightGBM 없음 → fallback)"
    model = GradientBoostingClassifier(n_estimators=200, random_state=42)

print(f"모델 학습 중: {MODEL_NAME}...")
model.fit(X_train, y_train)
print("학습 완료\n")

# ── 7. 평가 ────────────────────────────────────────────────────────────────────
from sklearn.metrics import (
    roc_auc_score, classification_report, confusion_matrix, roc_curve
)

y_prob = model.predict_proba(X_test)[:, 1]
auc = roc_auc_score(y_test, y_prob)

# KS 통계량 (은행 심사에서 모델 변별력 지표로 사용)
fpr, tpr, thresholds = roc_curve(y_test, y_prob)
ks_stat = max(tpr - fpr)
ks_threshold = thresholds[np.argmax(tpr - fpr)]

print("=" * 50)
print(f"  AUC-ROC  : {auc:.4f}")
print(f"  KS 통계량 : {ks_stat:.4f}  (임계값={ks_threshold:.4f})")
print("=" * 50)
print(f"\n[ 분류 리포트 (threshold={ks_threshold:.2f}) ]")
y_pred = (y_prob >= ks_threshold).astype(int)
print(classification_report(y_test, y_pred, target_names=["정상상환", "부도"]))

cm = confusion_matrix(y_test, y_pred)
print("[ 혼동행렬 ]")
print(f"  정상→정상승인: {cm[0,0]:,}   정상→부도거절(FP): {cm[0,1]:,}")
print(f"  부도→정상승인(FN): {cm[1,0]:,}   부도→부도거절: {cm[1,1]:,}")

# ── 8. 피처 중요도 ─────────────────────────────────────────────────────────────
print("\n[ 피처 중요도 Top 10 ]")
importance = pd.Series(model.feature_importances_, index=X.columns)
print(importance.sort_values(ascending=False).head(10).to_string())

# ── 9. 심사 예측 함수 (실서비스 연동용) ───────────────────────────────────────
def predict_loan(applicant: dict, threshold: float = ks_threshold) -> dict:
    """
    applicant: 신청자 정보 dict
    반환: {"decision": "승인"/"거절", "default_prob": float, "score": int}
    """
    df_input = pd.DataFrame([applicant])
    df_input = preprocess(df_input, category_maps)

    for col in X.columns:
        if col not in df_input.columns:
            df_input[col] = 0

    prob = model.predict_proba(df_input[X.columns])[0][1]
    score = int(1000 - prob * 1000)  # 부도확률 낮을수록 점수 높음

    return {
        "decision": "거절" if prob >= threshold else "승인",
        "default_prob": round(float(prob), 4),
        "score": score,
    }


# 사용 예시
sample = {
    "loan_amnt": 15000,
    "term": "36 months",
    "int_rate": 12.5,
    "annual_inc": 60000,
    "dti": 18.5,
    "fico_range_low": 700,
    "fico_range_high": 704,
    "emp_length": "5 years",
    "home_ownership": "RENT",
    "purpose": "debt_consolidation",
    "delinq_2yrs": 0,
    "inq_last_6mths": 1,
    "open_acc": 8,
    "pub_rec": 0,
    "revol_util": "35%",
    "total_acc": 15,
}

print("\n[ 심사 예시 ]")
result = predict_loan(sample)
print(f"  판정: {result['decision']}")
print(f"  부도확률: {result['default_prob']:.2%}")
print(f"  신용점수: {result['score']}")

# ── 10. 모델 저장 ──────────────────────────────────────────────────────────────
import joblib
joblib.dump({
    "model": model,
    "threshold": ks_threshold,
    "features": list(X.columns),
    "category_maps": category_maps,
}, "loan_model.pkl")
print("\n모델 저장 완료: loan_model.pkl")
