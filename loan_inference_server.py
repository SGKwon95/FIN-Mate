"""
대출심사 ML 추론 FastAPI 서버
실행: uvicorn loan_inference_server:app --port 8001 --reload
"""

import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

MODEL_PATH = os.getenv("LOAN_MODEL_PATH", "loan_model.pkl")

app = FastAPI(title="FIN-Mate 대출심사 ML API")

# 서버 시작 시 모델 로드
_artifact: dict | None = None

def get_artifact() -> dict:
    global _artifact
    if _artifact is None:
        if not Path(MODEL_PATH).exists():
            raise RuntimeError(
                f"모델 파일 없음: {MODEL_PATH}\n"
                "먼저 'python loan_model.py'를 실행해 loan_model.pkl을 생성하세요."
            )
        _artifact = joblib.load(MODEL_PATH)
    return _artifact


class ApplicantInput(BaseModel):
    # DB에서 자동 추출되는 피처
    loan_amnt: float
    term: float               # 개월 수 (36 or 60)
    int_rate: float           # 소수 (예: 0.1245)
    annual_inc: float
    emp_length: float         # 연 단위 (0~10+)
    open_acc: float
    total_acc: float
    delinq_2yrs: float
    revol_util: float         # % 값 (예: 35.0)
    # 신청 폼에서 사용자가 직접 입력하는 피처
    fico_score: float         # 300~1000 (fico_avg로 변환)
    home_ownership: str       # OWN / MORTGAGE / RENT / OTHER
    dti: float                # % 값 (예: 18.5)
    inq_last_6mths: float
    pub_rec: float
    purpose: str              # debt_consolidation / credit_card / home_improvement / other 등


class PredictionResponse(BaseModel):
    decision: str
    default_prob: float
    score: int
    threshold: float


def preprocess_input(data: ApplicantInput, artifact: dict) -> pd.DataFrame:
    cat_maps: dict = artifact.get("category_maps", {})

    row = {
        "loan_amnt": data.loan_amnt,
        "term": data.term,
        "int_rate": data.int_rate * 100 if data.int_rate <= 1 else data.int_rate,  # % 변환
        "annual_inc": data.annual_inc,
        "dti": data.dti,
        "fico_avg": data.fico_score,
        "emp_length": data.emp_length,
        "home_ownership": data.home_ownership.upper(),
        "purpose": data.purpose.lower().replace(" ", "_"),
        "delinq_2yrs": data.delinq_2yrs,
        "inq_last_6mths": data.inq_last_6mths,
        "open_acc": data.open_acc,
        "pub_rec": data.pub_rec,
        "revol_util": data.revol_util,
        "total_acc": data.total_acc,
    }

    df = pd.DataFrame([row])

    # 범주형 인코딩
    for col in ["home_ownership", "purpose"]:
        if col in cat_maps:
            df[col] = df[col].map(cat_maps[col]).fillna(-1).astype(int)
        else:
            df[col] = df[col].astype("category").cat.codes

    # 수치형 결측치 → 0
    num_cols = df.select_dtypes(include="number").columns
    df[num_cols] = df[num_cols].fillna(0)

    return df


@app.get("/health")
def health():
    try:
        get_artifact()
        return {"status": "ok", "model_loaded": True}
    except RuntimeError as e:
        return {"status": "error", "message": str(e)}


@app.post("/predict", response_model=PredictionResponse)
def predict(data: ApplicantInput):
    try:
        artifact = get_artifact()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    model = artifact["model"]
    threshold: float = artifact["threshold"]
    features: list[str] = artifact["features"]

    df = preprocess_input(data, artifact)

    # 모델이 기대하는 피처 순서로 정렬, 없는 컬럼은 0으로 채움
    for col in features:
        if col not in df.columns:
            df[col] = 0
    df = df[features]

    prob: float = float(model.predict_proba(df)[0][1])
    score = int(1000 - prob * 1000)

    return PredictionResponse(
        decision="거절" if prob >= threshold else "승인",
        default_prob=round(prob, 4),
        score=score,
        threshold=round(threshold, 4),
    )
