"""
인터넷뱅킹 대출심사 ML 분류 모델 (LendingClub 데이터 기반)
타겟: 대출 부도 여부 예측 (0=정상상환, 1=부도)
백엔드: PyTorch MLP + GPU (CUDA 사용 가능 시 자동 선택)
"""

import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings("ignore")

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score, classification_report, confusion_matrix, roc_curve
from loan_model_wrapper import LoanMLP, TorchLoanWrapper

# ── 디바이스 선택 ──────────────────────────────────────────────────────────────
if torch.cuda.is_available():
    DEVICE = torch.device("cuda")
    print(f"GPU: {torch.cuda.get_device_name(0)}")
elif torch.backends.mps.is_available():
    DEVICE = torch.device("mps")
    print("GPU: Apple MPS")
else:
    DEVICE = torch.device("cpu")
    print("GPU 없음 → CPU 학습")

# ── 1. 데이터 로드 ──────────────────────────────────────────────────────────────
# Kaggle에서 수동 다운로드: https://www.kaggle.com/datasets/wordsforthewise/lending-club
# 파일명: accepted_2007_to_2018Q4.csv.gz → lending_club.csv.gz 로 복사

KAGGLE_AVAILABLE = False
DATA_PATH = "lending_club.csv.gz"

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

# ── 2. 피처 정의 ────────────────────────────────────────────────────────────────
FEATURE_COLS = [
    "loan_amnt",
    "term",
    "int_rate",
    "annual_inc",
    "dti",
    "fico_range_low",
    "fico_range_high",
    "emp_length",
    "home_ownership",
    "purpose",
    "delinq_2yrs",
    "inq_last_6mths",
    "open_acc",
    "pub_rec",
    "revol_util",
    "total_acc",
]
TARGET_COL = "loan_status"

print("데이터 로드 중...")
df_raw = pd.read_csv(DATA_PATH, usecols=FEATURE_COLS + [TARGET_COL], low_memory=False)
print(f"원본 데이터: {df_raw.shape[0]:,}행 × {df_raw.shape[1]}열")

# ── 3. 타겟 이진화 ──────────────────────────────────────────────────────────────
POSITIVE_STATUS = {"Charged Off", "Default", "Does not meet the credit policy. Status:Charged Off"}
df_raw = df_raw[df_raw[TARGET_COL].isin(
    {"Fully Paid", "Does not meet the credit policy. Status:Fully Paid"} | POSITIVE_STATUS
)].copy()

df_raw["target"] = df_raw[TARGET_COL].apply(lambda x: 1 if x in POSITIVE_STATUS else 0)
df_raw.drop(columns=[TARGET_COL], inplace=True)

print(f"유효 데이터: {len(df_raw):,}행")
print(f"부도율: {df_raw['target'].mean():.2%}\n")

# ── 4. 전처리 ───────────────────────────────────────────────────────────────────
def extract_category_maps(df: pd.DataFrame) -> dict:
    maps = {}
    for col in ["home_ownership", "purpose"]:
        cat = df[col].astype("category")
        maps[col] = {v: int(c) for c, v in enumerate(cat.cat.categories)}
    return maps

category_maps = extract_category_maps(df_raw)

def preprocess(df: pd.DataFrame, cat_maps: dict | None = None) -> pd.DataFrame:
    df = df.copy()

    df["term"] = df["term"].str.extract(r"(\d+)").astype(float)

    df["emp_length"] = (
        df["emp_length"]
        .str.replace(r"\+? years?", "", regex=True)
        .str.replace("< 1", "0")
        .str.strip()
        .replace("n/a", np.nan)
        .astype(float)
    )

    df["revol_util"] = df["revol_util"].astype(str).str.replace("%", "").replace("nan", np.nan).astype(float)

    df["fico_avg"] = (df["fico_range_low"] + df["fico_range_high"]) / 2
    df.drop(columns=["fico_range_low", "fico_range_high"], inplace=True)

    for col in ["home_ownership", "purpose"]:
        if cat_maps and col in cat_maps:
            df[col] = df[col].map(cat_maps[col]).fillna(-1).astype(int)
        else:
            df[col] = df[col].astype("category").cat.codes

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

# 피처 스케일링 (신경망 필수)
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train).astype(np.float32)
X_test_scaled = scaler.transform(X_test).astype(np.float32)

# ── 6. 모델 정의 (loan_model_wrapper.py에서 import) ────────────────────────────
N_FEATURES = X_train_scaled.shape[1]

# ── 7. 학습 ─────────────────────────────────────────────────────────────────────
BATCH_SIZE = 4096
EPOCHS = 30
LR = 1e-3
PATIENCE = 5  # 조기 종료

# 클래스 불균형 보정 (부도 비율 낮으므로 pos_weight 사용)
pos_ratio = (y_train == 0).sum() / (y_train == 1).sum()
pos_weight = torch.tensor([pos_ratio], dtype=torch.float32).to(DEVICE)

train_ds = TensorDataset(
    torch.tensor(X_train_scaled).to(DEVICE),
    torch.tensor(y_train.values, dtype=torch.float32).to(DEVICE),
)
train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)

val_tensor_X = torch.tensor(X_test_scaled).to(DEVICE)
val_tensor_y = torch.tensor(y_test.values, dtype=torch.float32).to(DEVICE)

model = LoanMLP(N_FEATURES).to(DEVICE)
criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
optimizer = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=1e-4)
scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=2)

print(f"모델 학습 중 (PyTorch MLP, {DEVICE})...")
best_auc = 0.0
best_state = None
no_improve = 0

for epoch in range(1, EPOCHS + 1):
    model.train()
    total_loss = 0.0
    for X_batch, y_batch in train_loader:
        optimizer.zero_grad()
        logits = model(X_batch)
        loss = criterion(logits, y_batch)
        loss.backward()
        optimizer.step()
        total_loss += loss.item()

    # 검증
    model.eval()
    with torch.no_grad():
        val_logits = model(val_tensor_X)
        val_probs = torch.sigmoid(val_logits).cpu().numpy()
    val_auc = roc_auc_score(y_test, val_probs)
    scheduler.step(val_auc)

    avg_loss = total_loss / len(train_loader)
    lr_now = optimizer.param_groups[0]["lr"]
    print(f"  Epoch {epoch:2d}/{EPOCHS}  loss={avg_loss:.4f}  val_AUC={val_auc:.4f}  lr={lr_now:.2e}")

    if val_auc > best_auc:
        best_auc = val_auc
        best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
        no_improve = 0
    else:
        no_improve += 1
        if no_improve >= PATIENCE:
            print(f"  조기 종료 (patience={PATIENCE})")
            break

model.load_state_dict(best_state)
model.eval()
print(f"\n학습 완료 — best val AUC: {best_auc:.4f}\n")

# ── 8. 평가 ─────────────────────────────────────────────────────────────────────
with torch.no_grad():
    y_prob = torch.sigmoid(model(val_tensor_X)).cpu().numpy()

auc = roc_auc_score(y_test, y_prob)
fpr, tpr, thresholds = roc_curve(y_test, y_prob)
ks_stat = max(tpr - fpr)
ks_threshold = float(thresholds[np.argmax(tpr - fpr)])

print("=" * 50)
print(f"  AUC-ROC  : {auc:.4f}")
print(f"  KS 통계량 : {ks_stat:.4f}  (임계값={ks_threshold:.4f})")
print("=" * 50)
y_pred = (y_prob >= ks_threshold).astype(int)
print(f"\n[ 분류 리포트 (threshold={ks_threshold:.2f}) ]")
print(classification_report(y_test, y_pred, target_names=["정상상환", "부도"]))

cm = confusion_matrix(y_test, y_pred)
print("[ 혼동행렬 ]")
print(f"  정상→정상승인: {cm[0,0]:,}   정상→부도거절(FP): {cm[0,1]:,}")
print(f"  부도→정상승인(FN): {cm[1,0]:,}   부도→부도거절: {cm[1,1]:,}")

# ── 9. 피처 중요도 (Permutation) ───────────────────────────────────────────────
print("\n[ 피처 중요도 Top 10 — Permutation Importance ]")
base_auc = auc
importances = {}
for i, col in enumerate(X.columns):
    X_perm = X_test_scaled.copy()
    np.random.shuffle(X_perm[:, i])
    with torch.no_grad():
        perm_prob = torch.sigmoid(model(torch.tensor(X_perm).to(DEVICE))).cpu().numpy()
    importances[col] = base_auc - roc_auc_score(y_test, perm_prob)

imp_series = pd.Series(importances).sort_values(ascending=False)
print(imp_series.head(10).to_string())

# ── 10. sklearn 호환 래퍼 (loan_model_wrapper.py에서 import) ───────────────────

# ── 11. 심사 예측 함수 (로컬 테스트용) ────────────────────────────────────────
wrapper = TorchLoanWrapper(model, scaler, list(X.columns), DEVICE)

def predict_loan(applicant: dict, threshold: float = ks_threshold) -> dict:
    df_input = pd.DataFrame([applicant])
    df_input = preprocess(df_input, category_maps)
    for col in X.columns:
        if col not in df_input.columns:
            df_input[col] = 0
    prob = wrapper.predict_proba(df_input)[0][1]
    score = int(1000 - prob * 1000)
    return {
        "decision": "거절" if prob >= threshold else "승인",
        "default_prob": round(float(prob), 4),
        "score": score,
    }


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

# ── 12. 모델 저장 ──────────────────────────────────────────────────────────────
import joblib
joblib.dump({
    "model": wrapper,          # TorchLoanWrapper (predict_proba 인터페이스)
    "threshold": ks_threshold,
    "features": list(X.columns),
    "category_maps": category_maps,
}, "loan_model.pkl")
print("\n모델 저장 완료: loan_model.pkl")
