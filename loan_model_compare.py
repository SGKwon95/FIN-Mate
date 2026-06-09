"""
대출심사 모델 성능 비교
비교 대상: Logistic Regression, LightGBM, XGBoost, PyTorch MLP
지표: AUC-ROC, KS 통계량, Precision/Recall/F1 (KS 임계값 기준)
"""

import json
import time
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, roc_curve, classification_report, confusion_matrix
import lightgbm as lgb
import xgboost as xgb
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from loan_model_wrapper import LoanMLP

# ── 1. 데이터 로드 ─────────────────────────────────────────────────────────────
FEATURE_COLS = [
    "loan_amnt", "term", "int_rate", "annual_inc", "dti",
    "fico_range_low", "fico_range_high", "emp_length",
    "home_ownership", "purpose", "delinq_2yrs", "inq_last_6mths",
    "open_acc", "pub_rec", "revol_util", "total_acc",
]
TARGET_COL = "loan_status"

print("데이터 로드 중...")
df_raw = pd.read_csv("lending_club.csv.gz", usecols=FEATURE_COLS + [TARGET_COL], low_memory=False)
print(f"원본 데이터: {df_raw.shape[0]:,}행")

# ── 2. 타겟 이진화 ──────────────────────────────────────────────────────────────
POSITIVE_STATUS = {"Charged Off", "Default", "Does not meet the credit policy. Status:Charged Off"}
df_raw = df_raw[df_raw[TARGET_COL].isin(
    {"Fully Paid", "Does not meet the credit policy. Status:Fully Paid"} | POSITIVE_STATUS
)].copy()
df_raw["target"] = df_raw[TARGET_COL].apply(lambda x: 1 if x in POSITIVE_STATUS else 0)
df_raw.drop(columns=[TARGET_COL], inplace=True)
print(f"유효 데이터: {len(df_raw):,}행  부도율: {df_raw['target'].mean():.2%}\n")

# ── 3. 전처리 ───────────────────────────────────────────────────────────────────
def preprocess(df: pd.DataFrame) -> pd.DataFrame:
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
        df[col] = df[col].astype("category").cat.codes
    num_cols = df.select_dtypes(include="number").columns.difference(["target"])
    df[num_cols] = df[num_cols].fillna(df[num_cols].median())
    return df

df = preprocess(df_raw)
X = df.drop(columns=["target"])
y = df["target"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
print(f"Train: {len(X_train):,}  Test: {len(X_test):,}\n")

# ── 4. 공통 평가 함수 ─────────────────────────────────────────────────────────
def evaluate(name: str, y_true, y_prob, elapsed: float) -> dict:
    auc = roc_auc_score(y_true, y_prob)
    fpr, tpr, thresholds = roc_curve(y_true, y_prob)
    ks_idx = np.argmax(tpr - fpr)
    ks_stat = float(tpr[ks_idx] - fpr[ks_idx])
    ks_thresh = float(thresholds[ks_idx])

    y_pred = (y_prob >= ks_thresh).astype(int)
    report = classification_report(y_true, y_pred, output_dict=True)
    cm = confusion_matrix(y_true, y_pred)

    precision_1 = report["1"]["precision"]
    recall_1    = report["1"]["recall"]
    f1_1        = report["1"]["f1-score"]
    accuracy    = report["accuracy"]

    print(f"\n{'='*55}")
    print(f"  {name}")
    print(f"{'='*55}")
    print(f"  AUC-ROC    : {auc:.4f}")
    print(f"  KS 통계량   : {ks_stat:.4f}  (임계값={ks_thresh:.4f})")
    print(f"  학습 시간   : {elapsed:.1f}s")
    print(f"  정확도      : {accuracy:.4f}")
    print(f"  부도 Precision: {precision_1:.4f}")
    print(f"  부도 Recall   : {recall_1:.4f}")
    print(f"  부도 F1       : {f1_1:.4f}")
    print(f"  혼동행렬 (test set):")
    print(f"    정상→정상승인: {cm[0,0]:,}   정상→부도(FP): {cm[0,1]:,}")
    print(f"    부도→정상(FN): {cm[1,0]:,}   부도→부도거절: {cm[1,1]:,}")

    return {
        "model": name,
        "auc": round(auc, 4),
        "ks": round(ks_stat, 4),
        "ks_threshold": round(ks_thresh, 4),
        "accuracy": round(accuracy, 4),
        "precision_default": round(precision_1, 4),
        "recall_default": round(recall_1, 4),
        "f1_default": round(f1_1, 4),
        "train_sec": round(elapsed, 1),
        "cm": cm.tolist(),
    }

results = []

# ── 5. Logistic Regression (baseline) ──────────────────────────────────────────
print("\n[1/4] Logistic Regression 학습 중...")
scaler_lr = StandardScaler()
X_train_s = scaler_lr.fit_transform(X_train)
X_test_s  = scaler_lr.transform(X_test)

t0 = time.time()
lr = LogisticRegression(max_iter=1000, C=0.1, solver="lbfgs", n_jobs=-1, random_state=42)
lr.fit(X_train_s, y_train)
elapsed = time.time() - t0

y_prob_lr = lr.predict_proba(X_test_s)[:, 1]
results.append(evaluate("Logistic Regression", y_test, y_prob_lr, elapsed))

# ── 6. LightGBM ────────────────────────────────────────────────────────────────
print("\n[2/4] LightGBM 학습 중...")
pos_ratio = (y_train == 0).sum() / (y_train == 1).sum()

t0 = time.time()
lgb_model = lgb.LGBMClassifier(
    n_estimators=1000,
    learning_rate=0.05,
    num_leaves=63,
    max_depth=-1,
    min_child_samples=100,
    scale_pos_weight=pos_ratio,
    subsample=0.8,
    colsample_bytree=0.8,
    reg_alpha=0.1,
    reg_lambda=0.1,
    random_state=42,
    n_jobs=-1,
    verbose=-1,
)
lgb_model.fit(
    X_train, y_train,
    eval_set=[(X_test, y_test)],
    callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(period=-1)],
)
elapsed = time.time() - t0

y_prob_lgb = lgb_model.predict_proba(X_test)[:, 1]
results.append(evaluate("LightGBM", y_test, y_prob_lgb, elapsed))

# LightGBM 피처 중요도 저장
lgb_importance = pd.Series(
    lgb_model.feature_importances_,
    index=X_train.columns
).sort_values(ascending=False)

# ── 7. XGBoost ─────────────────────────────────────────────────────────────────
print("\n[3/4] XGBoost 학습 중...")
t0 = time.time()
xgb_model = xgb.XGBClassifier(
    n_estimators=1000,
    learning_rate=0.05,
    max_depth=6,
    min_child_weight=5,
    scale_pos_weight=pos_ratio,
    subsample=0.8,
    colsample_bytree=0.8,
    reg_alpha=0.1,
    reg_lambda=1.0,
    eval_metric="auc",
    early_stopping_rounds=50,
    random_state=42,
    n_jobs=-1,
    verbosity=0,
)
xgb_model.fit(
    X_train, y_train,
    eval_set=[(X_test, y_test)],
    verbose=False,
)
elapsed = time.time() - t0

y_prob_xgb = xgb_model.predict_proba(X_test)[:, 1]
results.append(evaluate("XGBoost", y_test, y_prob_xgb, elapsed))

xgb_importance = pd.Series(
    xgb_model.feature_importances_,
    index=X_train.columns
).sort_values(ascending=False)

# ── 8. PyTorch MLP ─────────────────────────────────────────────────────────────
print("\n[4/4] PyTorch MLP 학습 중...")
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"  디바이스: {DEVICE}")

scaler_mlp = StandardScaler()
X_train_mlp = scaler_mlp.fit_transform(X_train).astype(np.float32)
X_test_mlp  = scaler_mlp.transform(X_test).astype(np.float32)

pos_weight_t = torch.tensor([pos_ratio], dtype=torch.float32).to(DEVICE)
train_ds = TensorDataset(
    torch.tensor(X_train_mlp).to(DEVICE),
    torch.tensor(y_train.values, dtype=torch.float32).to(DEVICE),
)
train_loader = DataLoader(train_ds, batch_size=4096, shuffle=True)
val_X = torch.tensor(X_test_mlp).to(DEVICE)
val_y = torch.tensor(y_test.values, dtype=torch.float32).to(DEVICE)

model = LoanMLP(X_train_mlp.shape[1]).to(DEVICE)
criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight_t)
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=2)

best_auc, best_state, no_improve = 0.0, None, 0
t0 = time.time()
for epoch in range(1, 31):
    model.train()
    for X_b, y_b in train_loader:
        optimizer.zero_grad()
        loss = criterion(model(X_b), y_b)
        loss.backward()
        optimizer.step()
    model.eval()
    with torch.no_grad():
        val_prob = torch.sigmoid(model(val_X)).cpu().numpy()
    val_auc = roc_auc_score(y_test, val_prob)
    scheduler.step(val_auc)
    print(f"  Epoch {epoch:2d}/30  val_AUC={val_auc:.4f}")
    if val_auc > best_auc:
        best_auc = val_auc
        best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
        no_improve = 0
    else:
        no_improve += 1
        if no_improve >= 5:
            print("  조기 종료")
            break
elapsed = time.time() - t0

model.load_state_dict(best_state)
model.eval()
with torch.no_grad():
    y_prob_mlp = torch.sigmoid(model(val_X)).cpu().numpy()
results.append(evaluate("PyTorch MLP", y_test, y_prob_mlp, elapsed))

# ── 9. 최종 비교표 출력 ──────────────────────────────────────────────────────────
print("\n\n" + "="*65)
print("  최종 모델 성능 비교")
print("="*65)
print(f"{'모델':<22} {'AUC':>6} {'KS':>6} {'임계값':>7} {'F1(부도)':>9} {'시간(s)':>8}")
print("-"*65)
for r in results:
    print(f"{r['model']:<22} {r['auc']:>6.4f} {r['ks']:>6.4f} {r['ks_threshold']:>7.4f} {r['f1_default']:>9.4f} {r['train_sec']:>8.1f}")
print("="*65)

# ── 10. LightGBM 피처 중요도 Top 10 ────────────────────────────────────────────
print("\n[ LightGBM 피처 중요도 Top 10 ]")
print(lgb_importance.head(10).to_string())

print("\n[ XGBoost 피처 중요도 Top 10 ]")
print(xgb_importance.head(10).to_string())

# ── 11. 결과 JSON 저장 ─────────────────────────────────────────────────────────
output = {
    "results": results,
    "lgb_feature_importance": lgb_importance.head(10).to_dict(),
    "xgb_feature_importance": xgb_importance.head(10).to_dict(),
}
with open("model_compare_results.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
print("\n결과 저장: model_compare_results.json")
