# ML 대출심사 모델 설명

> 관련 파일: `loan_model.py`, `loan_model_wrapper.py`, `loan_inference_server.py`,  
> `app/api/loan-applications/[id]/screen/route.ts`

---

## 1. 개요

LendingClub(미국 P2P 대출 플랫폼)의 실제 대출 데이터를 학습한 **부도 예측 이진 분류 모델**이다.  
신청자의 재무 정보를 입력받아 **"이 사람이 대출을 갚지 못할 확률"** 을 계산하고, 확률을 점수(0~1000)로 환산해 승인/거절 판정을 내린다.

```
신청자 정보 입력
    ↓
FastAPI ML 서버 (loan_inference_server.py, port 8001)
    ↓
PyTorch MLP 신경망 → 부도 확률 (0.0 ~ 1.0)
    ↓
점수 환산 + 임계값 비교
    ↓
승인 / 거절 / 직원 검토
```

---

## 2. 학습 데이터

| 항목 | 내용 |
|------|------|
| 출처 | Kaggle — LendingClub 2007~2018년 실제 대출 데이터 |
| 타겟 | 부도 여부 (1 = 부도·상각·채무불이행, 0 = 정상상환) |
| 부도 케이스 | `Charged Off`, `Default`, `Does not meet credit policy (Charged Off)` |
| 정상 케이스 | `Fully Paid`, `Does not meet credit policy (Fully Paid)` |

데이터 특성상 부도 비율이 낮아 **클래스 불균형**이 존재한다.  
이를 보정하기 위해 손실 함수에 `pos_weight`(정상:부도 비율)를 적용해 부도 케이스를 더 중요하게 학습한다.

---

## 3. 사용하는 피처 (입력 지표) 15개

신청자의 신용 프로필을 4가지 범주로 나눌 수 있다.

### 대출 조건 (2개)

| 피처 | 의미 | 왜 중요한가 |
|------|------|------------|
| `loan_amnt` | 대출 신청 금액 | 금액이 클수록 상환 부담 증가 |
| `term` | 상환 기간 (36 or 60개월) | 장기일수록 상환 리스크 누적 |

### 신용도 지표 (4개)

| 피처 | 의미 | 왜 중요한가 |
|------|------|------------|
| `fico_avg` | FICO 신용점수 (300~850) | 신용 이력을 종합한 핵심 지표. 높을수록 우량 |
| `int_rate` | 대출 금리 (%) | 금리는 리스크를 반영 — 고금리 = 고위험 신청자 |
| `delinq_2yrs` | 최근 2년 연체 횟수 | 과거 연체 이력은 미래 부도의 강한 예측 변수 |
| `pub_rec` | 공공 기록 건수 (파산·압류 등) | 법적 채무 불이행 이력 |

### 재무 상태 지표 (4개)

| 피처 | 의미 | 왜 중요한가 |
|------|------|------------|
| `annual_inc` | 연 소득 (원) | 상환 능력의 기본 척도 |
| `dti` | 부채 대비 소득 비율 (%) | 소득 대비 부채 수준. 높을수록 상환 여력 감소 |
| `revol_util` | 신용카드 한도 대비 사용률 (%) | 높으면 자금 압박 신호 |
| `inq_last_6mths` | 최근 6개월 신용 조회 횟수 | 빈번한 조회 = 자금 수요 급증 신호 |

### 신용 이력 지표 (3개)

| 피처 | 의미 | 왜 중요한가 |
|------|------|------------|
| `emp_length` | 현 직장 근속 연수 (0~10+) | 소득 안정성 지표 |
| `open_acc` | 현재 개설된 신용 계좌 수 | 신용 다양성 반영 |
| `total_acc` | 전체 신용 계좌 수 (역사) | 신용 이력의 깊이 |

### 범주형 지표 (2개)

| 피처 | 의미 | 값 예시 |
|------|------|--------|
| `home_ownership` | 주거 형태 | OWN / MORTGAGE / RENT / OTHER |
| `purpose` | 대출 목적 | debt_consolidation / credit_card / home_improvement / other 등 |

---

## 4. 모델 구조

**PyTorch MLP (다층 퍼셉트론)** — 4개 레이어의 신경망.

```
입력 (15개 피처)
    ↓
Linear(15 → 256) + BatchNorm + ReLU + Dropout(0.3)
    ↓
Linear(256 → 128) + BatchNorm + ReLU + Dropout(0.2)
    ↓
Linear(128 → 64) + BatchNorm + ReLU
    ↓
Linear(64 → 1)  →  Sigmoid  →  부도 확률 (0.0 ~ 1.0)
```

**전처리:**
- 숫자 피처: `StandardScaler`로 평균 0, 표준편차 1로 정규화 (신경망 학습 안정화)
- 범주형 피처 (`home_ownership`, `purpose`): 정수 인코딩 후 학습 시 저장된 매핑 재사용

**학습 설정:**

| 항목 | 값 |
|------|---|
| 손실 함수 | BCEWithLogitsLoss + pos_weight (클래스 불균형 보정) |
| 최적화 | Adam (lr=0.001, weight_decay=1e-4) |
| 학습률 스케줄 | ReduceLROnPlateau — AUC 개선 없으면 lr × 0.5 |
| 배치 크기 | 4,096 |
| 최대 에포크 | 30 (조기 종료 patience=5) |
| 분할 | Train 80% / Test 20% (stratified) |

---

## 5. 모델 비교 실험 결과

LendingClub 실데이터(134만 건, 부도율 19.98%)로 4개 모델을 동일한 Train/Test(80/20, stratified) 조건에서 학습·평가한 결과.

### 학습 환경

| 항목 | 값 |
|------|---|
| 데이터 | LendingClub 2007~2018 유효 레코드 1,348,099건 |
| 부도율 | 19.98% (클래스 불균형 → `scale_pos_weight` / `pos_weight` 보정) |
| 분할 | Train 1,078,479건 / Test 269,620건 (stratified) |
| 디바이스 | CUDA GPU (MLP), CPU (나머지) |

### 성능 비교표

| 모델 | AUC-ROC | KS 통계량 | 판정 임계값 | F1 (부도) | 학습 시간 |
|------|:-------:|:--------:|:---------:|:--------:|:--------:|
| Logistic Regression | 0.7053 | 0.2984 | 0.1930 | 0.4246 | 3.3s |
| LightGBM | 0.7012 | 0.2903 | 0.2426 | 0.4198 | 3.8s |
| **XGBoost** | **0.7184** | **0.3177** | 0.5094 | **0.4358** | 29.3s |
| PyTorch MLP | 0.7142 | 0.3091 | 0.4963 | 0.4300 | 272.6s |

### 혼동행렬 (Test 269,620건)

**Logistic Regression**
```
              실제 정상    실제 부도
예측 정상승인   137,360     18,221
예측 부도거절    78,388     35,651
```

**LightGBM**
```
              실제 정상    실제 부도
예측 정상승인   133,095     17,597
예측 부도거절    82,653     36,275
```

**XGBoost**
```
              실제 정상    실제 부도
예측 정상승인   143,003     18,591
예측 부도거절    72,745     35,281
```

**PyTorch MLP**
```
              실제 정상    실제 부도
예측 정상승인   137,383     17,650
예측 부도거절    78,365     36,222
```

### 피처 중요도 Top 10

**LightGBM** (분기 횟수 기준):

| 순위 | 피처 | 중요도 |
|------|------|--------|
| 1 | `int_rate` (대출 금리) | 49 |
| 2 | `home_ownership` (주거 형태) | 32 |
| 3 | `annual_inc` (연 소득) | 28 |
| 4 | `loan_amnt` / `term` | 18 |
| 5 | `dti` (부채 대비 소득) | 16 |
| 6 | `fico_avg` (신용점수) | 13 |

**XGBoost** (gain 기준):

| 순위 | 피처 | 중요도 |
|------|------|--------|
| 1 | `term` (상환 기간) | 0.296 |
| 2 | `int_rate` (대출 금리) | 0.281 |
| 3 | `home_ownership` (주거 형태) | 0.105 |
| 4 | `fico_avg` (신용점수) | 0.044 |
| 5 | `dti` (부채 대비 소득) | 0.034 |
| 6 | `inq_last_6mths` (최근 조회 수) | 0.032 |

### 해석 및 모델 선택

**XGBoost가 전체 지표에서 가장 우수** (AUC 0.7184, KS 0.3177, F1 0.4358).

- **LightGBM이 Logistic Regression보다 낮은 이유**: LendingClub 데이터는 피처가 15개로 적고, 결측치 대체 후 거의 정형화된 상태다. 이 경우 LightGBM의 `num_leaves=63` 트리 설정이 과적합 방향으로 작용해 일반화 성능이 오히려 낮아질 수 있다.
- **MLP가 준수한 이유**: CUDA GPU 학습으로 대용량 데이터를 30 epoch 학습해 비선형 패턴을 잘 포착하지만, 하이퍼파라미터 튜닝 없이는 XGBoost에 미치지 못한다.
- **학습 효율**: XGBoost는 29초, LightGBM은 3.8초로 MLP(272초) 대비 훨씬 빠르다.

**→ FIN-Mate 현재 구현은 PyTorch MLP 사용** (딥러닝 파이프라인 시연 목적). 성능만 보면 XGBoost가 최적 선택.

---

## 7. 모델 평가 및 임계값 결정

학습 후 두 가지 지표로 모델을 평가하고, 이 결과에서 **판정 임계값**을 자동으로 결정한다.

### AUC-ROC

- **ROC 곡선**: 임계값을 바꿔가며 진짜 부도 탐지율(TPR) vs 정상인 오탐율(FPR) 관계를 그린 곡선
- **AUC**: 곡선 아래 면적. 1.0이 완벽, 0.5는 무작위 수준
- 모델이 **부도와 정상을 얼마나 잘 구별하는가**를 측정

### KS 통계량 (Kolmogorov-Smirnov)

- `KS = max(TPR - FPR)` — 모든 임계값 중 부도/정상 구분력이 가장 높은 지점
- **KS가 최대가 되는 임계값을 판정 기준**으로 채택
- 금융 신용 모델에서 임계값을 주관적으로 설정하는 대신 **데이터로 최적점을 자동 도출**하는 방식

```
예) KS 통계량 최대 지점 = 임계값 0.32
  → 부도확률 ≥ 0.32 이면 "거절"
  → 부도확률 < 0.32 이면 "승인"
```

### 피처 중요도 (Permutation Importance)

학습 완료 후 각 피처를 무작위로 섞어 AUC 하락폭을 측정한다.  
하락폭이 클수록 그 피처가 예측에 중요하다는 의미.

일반적으로 **FICO 점수, DTI, 금리, 연소득** 순으로 중요도가 높게 나타난다.

---

## 8. 출력 결과

ML 서버(`POST /predict`)가 반환하는 값:

| 필드 | 의미 | 예시 |
|------|------|------|
| `default_prob` | 부도 확률 (0.0 ~ 1.0) | `0.2341` |
| `score` | 신용 점수 (0 ~ 1000) | `766` |
| `decision` | 판정 결과 | `"승인"` / `"거절"` |
| `threshold` | 적용된 임계값 | `0.32` |

**점수 계산 방식:**

```
score = 1000 - (부도확률 × 1000)

부도확률 0.0  → 점수 1000 (최우량)
부도확률 0.5  → 점수  500
부도확률 1.0  → 점수    0 (최악)
```

---

## 9. 하이브리드 심사 흐름

ML 단독 결정이 아닌 **ML + 직원 검토** 3단계 구조.

```
ML 점수 ≥ 800  →  자동 승인 (우량 신청자)
ML 점수 < 300  →  자동 거절 (고위험 신청자)
300 ≤ 점수 < 800  →  applicationStatus = PENDING_REVIEW
                         → 직원이 최종 승인/거절 결정
```

이 결과는 `loan_application` 테이블에 저장된다:

| DB 필드 | 내용 |
|---------|------|
| `ml_score` | 신용 점수 (0~1000) |
| `ml_decision` | ML 판정 (`승인` / `거절`) |
| `ml_default_prob` | 부도 확률 |
| `ml_screened_at` | 심사 시각 |
| `application_status` | `AUTO_APPROVED` / `AUTO_REJECTED` / `PENDING_REVIEW` |

---

## 10. 관측성

ML 추론 서버는 **Arize Phoenix**와 연동되어 모든 추론 요청을 OTel 스팬으로 기록한다.

Phoenix에서 확인 가능한 정보:
- 입력 피처 전체 (loan_amnt, fico_score, dti 등)
- 출력 결과 (decision, prob, score)
- 추론 지연 시간

→ `http://localhost:6006` 의 `fin-mate-ml` 프로젝트에서 조회

---

## 11. 실행 방법

```bash
# 1. 모델 학습 (최초 1회 — Kaggle 데이터 필요)
python loan_model.py
# → loan_model.pkl 생성

# 2. 추론 서버 실행
uvicorn loan_inference_server:app --port 8001 --reload
# 또는
npm run loan:ml
```

헬스체크:
```bash
curl http://localhost:8001/health
# → {"status": "ok", "model_loaded": true}
```

```bash
# 3. 모델 성능 비교 실험 (LR / LightGBM / XGBoost / MLP 동시 학습)
python3 loan_model_compare.py
# → model_compare_results.json 저장
```
