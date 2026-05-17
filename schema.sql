-- ============================================================
-- 금융상품 DB 스키마 (PostgreSQL)
-- 작성일: 2026-05-11
-- 대상 DBMS: PostgreSQL 14+
-- ============================================================

CREATE TABLE common_code_group (
    group_id       VARCHAR(50) PRIMARY KEY,
    group_name     VARCHAR(100) NOT NULL,
    description    TEXT,
    use_yn         CHAR(1) DEFAULT 'Y',
    created_by     UUID,
    updated_by     UUID,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE common_code (
    code_id        BIGSERIAL PRIMARY KEY,
    group_id       VARCHAR(50) NOT NULL,
    code           VARCHAR(50) NOT NULL,
    code_name      VARCHAR(100) NOT NULL,
    code_value     VARCHAR(100),
    sort_order     INTEGER DEFAULT 0,
    use_yn         CHAR(1) DEFAULT 'Y',
    created_by     UUID,
    updated_by     UUID,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_common_code_group
        FOREIGN KEY (group_id)
        REFERENCES common_code_group(group_id),

    CONSTRAINT uq_common_code
        UNIQUE(group_id, code)
);

INSERT INTO common_code_group
(group_id, group_name, description)
VALUES
('ACCOUNT_STATUS', '계좌 상태', '계좌 활성/정지 상태'),
('BANK_CODE', '은행 코드', '은행 목록'),
('TX_TYPE', '거래 유형', '입출금 거래 유형');
('PROD_TYPE', '상품 유형', '상품 유형');

INSERT INTO common_code
(group_id, code, code_name, sort_order)
VALUES
('PROD_TYPE', 'DEPOSIT', '예금성 상품', 1),
('PROD_TYPE', 'LOAN', '대출성 상품', 2);


-- ============================================================
-- 2. 고객 마스터 공통 (party)
-- ============================================================
CREATE TABLE party (
    party_id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    party_name              VARCHAR(100) NOT NULL
    party_role              VARCHAR(20)  NOT NULL CHECK (party_role IN ('INDIVIDUAL', 'CORPORATE')),
    party_status            VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                                CHECK (party_status IN ('ACTIVE', 'SUSPENDED', 'DORMANT', 'WITHDRAWN')),
                                -- ACTIVE=정상, SUSPENDED=거래정지, DORMANT=휴면, WITHDRAWN=탈퇴
    party_status_reason     VARCHAR(200),                -- 상태 변경 사유
    party_status_changed_at TIMESTAMPTZ,             -- 상태 변경 일시

    created_by              UUID,
    updated_by              UUID,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2-1. 개인 고객 상세 (Subtype)
-- ============================================================
CREATE TABLE individual (
    individual_id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id                UUID     NOT NULL UNIQUE REFERENCES party(party_id),
    individual_phone        VARCHAR(20),                 -- 휴대폰 번호 (예: 010-1234-5678)
    individual_email        VARCHAR(200),                -- 이메일 주소
    indivisual_ci           VARCHAR(50) NOT NULL,        -- 주민번호 정보

    -- 이체한도 (고객 기본값 — 계좌별 한도가 없으면 이 값 적용)
    transfer_limit_per_transaction  NUMERIC(15,2),     -- 1회 이체한도
    transfer_limit_per_day          NUMERIC(15,2),     -- 1일 이체한도

    -- 주소 (도로명주소 기준)
    zip_code                VARCHAR(5),                    -- 우편번호 (5자리)
    address                 VARCHAR(200),                  -- 도로명주소 (예: 서울특별시 강남구 테헤란로 152)
    address_detail          VARCHAR(100),                  -- 상세주소 (동/호수 등)

    -- 직장 정보 (여신 심사 및 소득 확인용)
    employment_type         VARCHAR(20)   CHECK (employment_type IN ('EMPLOYED', 'SELF_EMPLOYED', 'CONTRACT', 'UNEMPLOYED', 'RETIRED')),
                                          -- EMPLOYED=정규직, SELF_EMPLOYED=자영업, CONTRACT=계약직, UNEMPLOYED=무직, RETIRED=은퇴
    employer_name           VARCHAR(100),              -- 직장명
    job_title               VARCHAR(50),               -- 직위
    industry_code           VARCHAR(10),               -- 업종 코드 (KSIC 표준산업분류)
    employment_start_date   VARCHAR(10),                      -- 입사일
    annual_income           NUMERIC(15,2),             -- 연간 소득 (여신 심사 기준)

    individual_status        VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                            CHECK (individual_status IN ('ACTIVE', 'SUSPENDED', 'DORMANT', 'WITHDRAWN')),
                            -- ACTIVE=정상, SUSPENDED=거래정지, DORMANT=휴면, WITHDRAWN=탈퇴

    created_by              UUID,
    updated_by              UUID,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_individual_ci ON individual (indivisual_ci);


-- ============================================================
-- 2-2. 법인 고객 상세 (Subtype)
-- ============================================================
CREATE TABLE corporate (
    corporate_id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id             UUID          NOT NULL UNIQUE REFERENCES party(party_id),

    -- 기업 식별
    business_reg_no         VARCHAR(20)   NOT NULL,    -- 사업자등록번호
    corporation_reg_no      VARCHAR(20),               -- 법인등록번호 (사업자등록번호와 별개)

    -- 기업 기본 정보
    company_type            VARCHAR(20)   CHECK (company_type IN ('STOCK', 'LIMITED', 'COOPERATIVE', 'PUBLIC', 'OTHER')),
                                                       -- STOCK=주식회사, LIMITED=유한회사, COOPERATIVE=협동조합, PUBLIC=공기업
    industry_code           VARCHAR(10),               -- 표준산업분류코드 (KSIC)
    established_date        VARCHAR(10),                      -- 설립일
    fiscal_year_end_month   SMALLINT      CHECK (fiscal_year_end_month BETWEEN 1 AND 12),  -- 결산월
    representative_name     VARCHAR(100),              -- 대표자명
    capital_amount          NUMERIC(15,2),             -- 자본금

    -- 사업장 주소
    biz_zip_code            VARCHAR(5),                -- 우편번호 (5자리)
    biz_address             VARCHAR(200),              -- 사업장 도로명주소
    biz_address_detail      VARCHAR(100),              -- 사업장 상세주소

    -- 등기주소 (법인등기부등본 기준 — 사업장 주소와 다를 경우 입력)
    reg_zip_code            VARCHAR(5),                -- 우편번호 (5자리)
    reg_address             VARCHAR(200),              -- 등기 도로명주소
    reg_address_detail      VARCHAR(100),              -- 등기 상세주소

    -- 기업 신용등급
    credit_grade            VARCHAR(10),               -- 신용등급 (AAA ~ D)
    credit_rating_agency    VARCHAR(50),               -- 신용평가 기관 (NICE, KCB, KIS, SCI 등)
    credit_rated_at         VARCHAR(10),                      -- 신용평가 기준일

    -- 실소유자 확인 (자금세탁방지법 대응)
    beneficial_owner_verified     BOOLEAN   NOT NULL DEFAULT FALSE,
    beneficial_owner_verified_at  TIMESTAMPTZ,

    created_by              UUID,
    updated_by              UUID,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 2-3. 고객 로그인 인증 정보
-- ============================================================
CREATE TABLE party_auth (
    auth_id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id             UUID         NOT NULL UNIQUE REFERENCES party(party_id),

    login_id                VARCHAR(100) NOT NULL UNIQUE,
    password_hash           VARCHAR(255) NOT NULL,          -- bcrypt / argon2 해시 (평문 저장 금지)
    password_salt           VARCHAR(255),                   -- salt (bcrypt/argon2는 해시에 내장, 별도 알고리즘 사용 시 활용)

    -- 비밀번호 만료 관리 (금융기관 주기적 변경 권고)
    password_changed_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    password_expires_at     TIMESTAMPTZ,

    -- 계정 상태 및 잠금
    party_auth_status                  VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                                CHECK (party_auth_status IN ('ACTIVE', 'LOCKED', 'DISABLED')),
    failed_attempt_count    INT          NOT NULL DEFAULT 0,
    locked_at               TIMESTAMPTZ,                   -- 잠금 발생 시각

    last_login_at           TIMESTAMPTZ,

    created_by              UUID,
    updated_by              UUID,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_party_auth_login_id ON party_auth (login_id);


-- ============================================================
-- 3. 상품 마스터 (공통)
-- ============================================================
CREATE TABLE product (
    product_id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name                        VARCHAR(200) NOT NULL,
    product_type_code                   VARCHAR(20)  NOT NULL REFERENCES common_code(type_code),
    product_status                      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                                            CHECK (product_status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    launch_date                         DATE         NOT NULL,
    expiry_date                         VARCHAR(10),

    -- 계약기간
    period_type                         VARCHAR(20)  NOT NULL DEFAULT 'UNLIMITED'
                                            CHECK (period_type IN ('UNLIMITED', 'FIXED', 'FLEXIBLE')),
                                        -- UNLIMITED=제한없음, FIXED=고정(상품에 기간이 지정됨), FLEXIBLE=선택(가입 시 고객이 결정)
    contract_period_months              INTEGER,     -- FIXED일 때 상품 고정 기간, FLEXIBLE일 때 선택 가능한 기본값 (개월)

    -- 판매 대상
    sales_target                        VARCHAR(20)  NOT NULL DEFAULT 'ALL'
                                            CHECK (sales_target IN ('ALL', 'INDIVIDUAL', 'CORPORATE')),

    -- 예금자 보호 (예금보험공사, 1인당 5천만원 한도)
    is_deposit_insured                  BOOLEAN      NOT NULL DEFAULT FALSE,
    deposit_insurance_limit             NUMERIC(15,2),         -- 통상 50,000,000

    -- 감사 공통 필드
    created_by                          UUID         NOT NULL,
    updated_by                          UUID         NOT NULL,
    created_at                          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_type   ON product (product_type_code);
CREATE INDEX idx_product_status ON product (product_status);


-- ============================================================
-- 4. 약관 버전 관리
-- ============================================================
CREATE TABLE product_terms (
    terms_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID        NOT NULL REFERENCES product(product_id),
    terms_type      VARCHAR(30) NOT NULL CHECK (terms_type IN ('BASIC', 'TYPE_SPECIFIC')),
    version         VARCHAR(20) NOT NULL,
    effective_date  VARCHAR(10) NOT NULL,  -- 시행일
    expiry_date     VARCHAR(10),           -- 종료일 (NULL=현재 유효)
    changed_at      TIMESTAMPTZ,           -- 변경일시
    content_url     TEXT,
    change_reason   TEXT,                  -- 버전 변경 사유 (예: 법령 개정, 약관 개선 등)

    -- 담당 부서·직원
    responsible_department  VARCHAR(100),
    responsible_employee_id UUID REFERENCES employee(employee_id),

    created_by      UUID,
    updated_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (product_id, terms_type, version)
);


-- ============================================================
-- 5. 금리 관리
-- ============================================================

-- 5-1. 기본금리 / 가산금리 이력
CREATE TABLE product_rate (
    product_rate_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID         NOT NULL REFERENCES product(product_id),

    rate_type       VARCHAR(20)  NOT NULL CHECK (rate_type IN ('BASE', 'SPREAD')),
                    -- BASE=기본금리, SPREAD=가산금리(대출 전용)
    rate_structure  VARCHAR(20)  NOT NULL DEFAULT 'FIXED'
                        CHECK (rate_structure IN ('FIXED', 'VARIABLE', 'CONFIRMED')),
                    -- FIXED=고정금리, VARIABLE=변동금리, CONFIRMED=확정금리(약정 시점 확정)
    rate            NUMERIC(7,4) NOT NULL,              -- 예: 0.0350 = 3.50%
    effective_from  DATE         NOT NULL,              -- 적용 시작일
    effective_to    VARCHAR(10),                               -- 적용 종료일 (NULL=현재 적용 중)

    created_by      UUID         NOT NULL,
    updated_by      UUID,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_product_rate_period CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX idx_product_rate_product ON product_rate (product_id);


-- 5-2. 구간별 금리
CREATE TABLE product_rate_tier (
    rate_tier_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID         NOT NULL REFERENCES product(product_id),

    tier_type       VARCHAR(20)  NOT NULL CHECK (tier_type IN ('AMOUNT', 'PERIOD')),
                    -- AMOUNT=금액 구간(원), PERIOD=기간 구간(개월)
    min_value       NUMERIC(15,2),                      -- 구간 하한 (NULL=하한 없음)
    max_value       NUMERIC(15,2),                      -- 구간 상한 (NULL=상한 없음)
    rate            NUMERIC(7,4) NOT NULL,

    effective_from  DATE         NOT NULL,
    effective_to    VARCHAR(10),                               -- NULL=현재 적용 중

    created_by      UUID,
    updated_by      UUID,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_rate_tier_period CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX idx_product_rate_tier_product ON product_rate_tier (product_id);


-- 5-3. 우대금리
CREATE TABLE product_rate_benefit (
    rate_benefit_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id            UUID         NOT NULL REFERENCES product(product_id),

    benefit_name          VARCHAR(100) NOT NULL,        -- 우대 조건명 (예: 급여이체 고객)
    benefit_rate          NUMERIC(7,4) NOT NULL,        -- 우대 금리 (예: 0.002 = +0.2%)
    condition_description TEXT,                         -- 조건 상세

    effective_from        DATE         NOT NULL,
    effective_to          VARCHAR(10),                         -- NULL=현재 적용 중

    created_by            UUID,
    updated_by            UUID,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_rate_benefit_period CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX idx_product_rate_benefit_product ON product_rate_benefit (product_id);


-- ============================================================
-- 5-4. 수수료 정책
-- ============================================================
CREATE TABLE product_fee (
    fee_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID         NOT NULL REFERENCES product(product_id),

    fee_type        VARCHAR(30)  NOT NULL
                        CHECK (fee_type IN ('TRANSFER', 'WITHDRAWAL', 'DEPOSIT', 'EARLY_REPAYMENT', 'OTHER')),
                    -- TRANSFER=이체, WITHDRAWAL=출금, DEPOSIT=입금, EARLY_REPAYMENT=중도상환, OTHER=기타

    channel         VARCHAR(20)  NOT NULL DEFAULT 'ALL'
                        CHECK (channel IN ('ALL', 'APP', 'ATM', 'TELLER', 'INTERNET')),

    min_amount      NUMERIC(15,2),                       -- 적용 구간 하한 (NULL=하한 없음)
    max_amount      NUMERIC(15,2),                       -- 적용 구간 상한 (NULL=상한 없음)

    fee_amount      NUMERIC(15,2),                       -- 고정 수수료 (원)
    fee_rate        NUMERIC(7,4),                        -- 비율 수수료 (예: 0.001 = 0.1%)
    waiver_condition TEXT,                               -- 면제 조건 설명 (예: 급여계좌, VIP 등)

    effective_from  VARCHAR(10)  NOT NULL,
    effective_to    VARCHAR(10),                         -- NULL=현재 적용 중

    created_by      UUID,
    updated_by      UUID,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_product_fee_amount CHECK (fee_amount IS NOT NULL OR fee_rate IS NOT NULL),
    CONSTRAINT chk_product_fee_period  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX idx_product_fee_product ON product_fee (product_id);


-- ============================================================
-- 6. 예금 상세
-- ============================================================
CREATE TABLE deposit_detail (
    deposit_detail_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id                    UUID        NOT NULL UNIQUE REFERENCES product(product_id),

    -- 금리 체계
    interest_type                 VARCHAR(10) NOT NULL CHECK (interest_type IN ('SIMPLE', 'COMPOUND')),   -- 단리/복리
    rate_type                     VARCHAR(10) NOT NULL CHECK (rate_type IN ('FIXED', 'VARIABLE')),        -- 고정/변동

    -- 거래 방식 (계약 성질)
    transaction_type              VARCHAR(20) NOT NULL
                                      CHECK (transaction_type IN ('TIME_DEPOSIT', 'SAVINGS', 'DEMAND')),
                                      -- TIME_DEPOSIT=거치식(정기예금)
                                      -- SAVINGS=적립식(정기적금)
                                      -- DEMAND=입출금자유(보통예금)

    min_amount                    NUMERIC(15,2),
    max_amount                    NUMERIC(15,2),
    min_period_months             INT,
    max_period_months             INT,
    early_withdrawal_penalty_rate NUMERIC(7,4),           -- 중도해지 페널티율

    created_by                    UUID,
    updated_by                    UUID,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 7. 대출 상세
-- ============================================================
CREATE TABLE loan_detail (
    loan_detail_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID        NOT NULL UNIQUE REFERENCES product(product_id),

    -- 금리 산정 기준 (실제 금리 값은 product_rate 참조)
    base_rate_type      VARCHAR(20) NOT NULL
                            CHECK (base_rate_type IN ('COFIX', 'CD91', 'BASE_RATE', 'PRIME')),
                            -- COFIX=코픽스(변동), CD91=CD91일물(변동), BASE_RATE=한국은행기준금리, PRIME=우대금리형
    interest_type       VARCHAR(10) NOT NULL CHECK (interest_type IN ('SIMPLE', 'COMPOUND')),
                            -- SIMPLE=단리, COMPOUND=복리

    -- 규제 한도
    max_ltv_ratio       NUMERIC(5,4),                     -- LTV 예: 0.7000 = 70%
    max_dti_ratio       NUMERIC(5,4),                     -- DTI

    -- 담보
    collateral_required BOOLEAN      NOT NULL DEFAULT FALSE,
    collateral_type     VARCHAR(30)  CHECK (collateral_type IN ('REAL_ESTATE', 'DEPOSIT', 'SECURITIES', 'NONE')),
    lien_available      BOOLEAN      NOT NULL DEFAULT FALSE,  -- 질권 설정 여부

    -- 대출 한도 및 기간
    min_loan_amount        NUMERIC(15,2),
    max_loan_amount        NUMERIC(15,2),
    max_loan_period_months INT,

    -- 상환 방식
    repayment_method    VARCHAR(25)  NOT NULL
                            CHECK (repayment_method IN ('BULLET', 'EQUAL_PRINCIPAL', 'EQUAL_INSTALLMENT', 'FLEXIBLE')),
                            -- BULLET=만기일시상환
                            -- EQUAL_PRINCIPAL=원금균등분할
                            -- EQUAL_INSTALLMENT=원리금균등분할
                            -- FLEXIBLE=자유상환

    -- 중도상환
    early_repayment_allowed     BOOLEAN      NOT NULL DEFAULT FALSE,
    early_repayment_fee_rate    NUMERIC(7,4),   -- 중도상환수수료율 (예: 0.014 = 1.4%)

    -- 연체
    overdue_interest_rate       NUMERIC(7,4),   -- 지연이자율 (연체 시 적용, 예: 0.15 = 15%)

    created_by          UUID,
    updated_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. 계약 (고객 ↔ 상품)
-- ============================================================
CREATE TABLE contract (
    contract_id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id                      UUID        NOT NULL REFERENCES party(party_id),
    product_id                       UUID        NOT NULL REFERENCES product(product_id),
    contract_date                    VARCHAR(10) NOT NULL,  -- 계약 체결일
    execution_date                   VARCHAR(10),           -- 실행일자 (대출 실행일, 예금 개시일 등. NULL=즉시 실행)
    maturity_date                    VARCHAR(10),           -- 만기일 (contract_date + 기간을 스냅샷으로 저장)
    end_date                         VARCHAR(10),           -- 종료일자 (실제 종료일. 중도해지 시 maturity_date와 다름)
    contract_period_months           SMALLINT,              -- 계약기간 (개월), 수시입출금 등 기간 없는 상품은 NULL
    contract_amount                  NUMERIC(15,2),
    stamp_duty                       NUMERIC(15,2),  -- 인지세 (대출 계약 시 납부, 대출금액 구간별 차등)
    contract_status                  VARCHAR(25) NOT NULL DEFAULT 'ACTIVE'
                                         CHECK (contract_status IN ('ACTIVE', 'CLOSED', 'WITHDRAWN', 'ILLEGALLY_TERMINATED')),

    -- 계약 시점 확정 금리 (product_rate는 변동되므로 계약 당시 적용 금리를 스냅샷으로 저장)
    applied_rate                     NUMERIC(7,4) NOT NULL,                        -- 최종 적용 금리 (기준금리 + 가산금리 - 우대금리)

    -- 계약 체결 채널 정보
    branch_id                        UUID        REFERENCES branch(branch_id),    -- NULL=비대면(앱·인터넷)
    employee_id                      UUID        REFERENCES employee(employee_id), -- 담당직원
    employee_name                    VARCHAR(100),                                 -- 담당직원명 (스냅샷)
    contract_document_url            TEXT,                                         -- 계약서 파일 이미지 URL

    created_by                       UUID,
    updated_by                       UUID,
    created_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contract_party ON contract (party_id);
CREATE INDEX idx_contract_product  ON contract (product_id);
CREATE INDEX idx_contract_status   ON contract (contract_status);
CREATE INDEX idx_contract_branch_id   ON contract (branch_id);


-- ============================================================
-- 12. 약관 동의 이력 (계약별 동의한 약관 버전 기록)
-- ============================================================
CREATE TABLE contract_terms_agreement (
    contract_id        UUID        NOT NULL REFERENCES contract(contract_id),
    terms_id           UUID        NOT NULL REFERENCES product_terms(terms_id),

    agreed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    agreement_method   VARCHAR(20) NOT NULL
                           CHECK (agreement_method IN ('APP', 'PAPER', 'KIOSK')),
                           -- APP=모바일/인터넷, PAPER=서면, KIOSK=무인창구

    created_by         UUID,
    updated_by         UUID,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (contract_id, terms_id)
);

CREATE INDEX idx_cta_contract ON contract_terms_agreement (contract_id);

-- ============================================================
-- 12-2. 적용 우대금리 이력 (계약별 우대금리 근거 기록)
-- ============================================================
CREATE TABLE contract_rate_benefit (
    contract_id     UUID         NOT NULL REFERENCES contract(contract_id),
    rate_benefit_id UUID         NOT NULL REFERENCES product_rate_benefit(rate_benefit_id),

    applied_rate    NUMERIC(7,4) NOT NULL,  -- 계약 당시 실제 적용된 우대금리 값 스냅샷

    created_by      UUID,
    updated_by      UUID,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    PRIMARY KEY (contract_id, rate_benefit_id)
);

CREATE INDEX idx_crb_contract ON contract_rate_benefit (contract_id);

-- ============================================================
-- 13. 계좌 (고객 계좌 마스터)
-- ============================================================
CREATE TABLE account (
    account_id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    account_number          VARCHAR(30)   NOT NULL UNIQUE,
    account_password_hash   VARCHAR(50)   NOT NULL,
    party_id             UUID          NOT NULL REFERENCES party(party_id),
    contract_id             UUID          REFERENCES contract(contract_id),
    account_type            VARCHAR(20)   NOT NULL
                                CHECK (account_type IN ('DEPOSIT', 'LOAN', 'OVERDRAFT')),
                                -- DEPOSIT=예금, LOAN=대출, OVERDRAFT=마이너스통장
    account_status          VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE'
                                CHECK (account_status IN ('ACTIVE', 'DORMANT', 'SUSPENDED', 'CLOSED', 'FROZEN')),
    balance                 NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency_code           CHAR(3)       NOT NULL DEFAULT 'KRW',
    opened_date             VARCHAR(10)   NOT NULL,
    closed_date             VARCHAR(10),
    last_transaction_at     TIMESTAMPTZ,

    account_purpose         VARCHAR(20)   CHECK (account_purpose IN ('GENERAL', 'SALARY', 'SAVINGS', 'UTILITY', 'BUSINESS', 'INVESTMENT')),
                                          -- GENERAL=일반, SALARY=급여, SAVINGS=저축, UTILITY=공과금, BUSINESS=사업, INVESTMENT=투자

    -- 해지 권한
    is_third_party_closure_allowed  BOOLEAN   NOT NULL DEFAULT FALSE,  -- 본인 외 해지 허용 여부 (대리인, 법정대리인 등)

    -- 표시 설정
    is_hidden                   BOOLEAN       NOT NULL DEFAULT FALSE,
    display_order               SMALLINT      NOT NULL DEFAULT 0,

    -- 보안
    is_locked                   BOOLEAN       NOT NULL DEFAULT FALSE,
    password_fail_count         SMALLINT      NOT NULL DEFAULT 0,
    locked_at                   TIMESTAMPTZ,           -- 잠금 발생 시각

    -- 이체한도 (계좌별 — NULL이면 individual_party의 기본값 적용)
    transfer_limit_per_transaction  NUMERIC(15,2),     -- 1회 이체한도
    transfer_limit_per_day          NUMERIC(15,2),     -- 1일 이체한도

    created_by              UUID,
    updated_by              UUID,
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_account_balance CHECK (balance >= 0),
    CONSTRAINT chk_account_closed  CHECK (closed_date IS NULL OR closed_date >= opened_date)
);

CREATE INDEX idx_account_party_id ON account (party_id);
CREATE INDEX idx_account_contract_id ON account (contract_id);
CREATE INDEX idx_account_status      ON account (account_status);


-- ============================================================
-- 14. 거래 내역
-- ============================================================
CREATE TABLE transaction (
    transaction_id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id                 UUID          NOT NULL REFERENCES account(account_id),

    transaction_type           VARCHAR(20)   NOT NULL
                                   CHECK (transaction_type IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER_OUT', 'TRANSFER_IN', 'INTEREST', 'FEE')),
                                   -- DEPOSIT=입금, WITHDRAWAL=출금
                                   -- TRANSFER_OUT=이체출금, TRANSFER_IN=이체입금
                                   -- INTEREST=이자, FEE=수수료

    amount                     NUMERIC(15,2) NOT NULL,
    balance_before             NUMERIC(15,2) NOT NULL,  -- 거래 전 잔액
    balance_after              NUMERIC(15,2) NOT NULL,  -- 거래 후 잔액

    transaction_status                     VARCHAR(20)   NOT NULL DEFAULT 'COMPLETED'
                                   CHECK (transaction_status IN ('COMPLETED', 'PENDING', 'FAILED', 'CANCELLED')),

    channel                    VARCHAR(20)   CHECK (channel IN ('APP', 'ATM', 'TELLER', 'INTERNET', 'AUTO', 'SCHEDULED')),
                                   -- AUTO=자동이체, SCHEDULED=예약이체

    -- 이체 상대방 정보 (이체 거래 시 기록)
    counterpart_account_number VARCHAR(30),             -- 상대방 계좌번호
    counterpart_bank_code      VARCHAR(10),             -- 상대방 은행 코드
    counterpart_name           VARCHAR(100),            -- 상대방 이름 (수취인 / 송금인)
    counterparty_party_id      UUID          REFERENCES party(party_id),      -- 상대방 party 연결 (내부 고객인 경우)
    counterparty_account_id    UUID          REFERENCES account(account_id),  -- 상대방 계좌 연결 (동행 이체)
    bank_code                  VARCHAR(10),                                   -- 송금인 은행 코드 (counterpart_bank_code=수취인 은행과 구분)
    transferer                 VARCHAR(20),             -- 받는사람표시
    remitter                   VARCHAR(20),             -- 보내는사람표시

    -- 거래 식별 및 추적
    transaction_no             VARCHAR(30)   UNIQUE,                          -- 고객용 거래번호 (영수증·명세서 표시, 예: 20260515-000123)
    transaction_key            VARCHAR(50)   UNIQUE,                          -- 외부 시스템 통합용 고유 거래 키 (외부송금 등)
    reference_no               VARCHAR(50),                                   -- 금융결제원 거래 참조번호
    batch_id                   UUID,                                          -- 대량처리/정산 배치 그룹 ID (정기이체, 자동상환 등)

    -- 수수료 및 세금
    fee_amount                 NUMERIC(15,2),
    tax_amount                 NUMERIC(15,2),                                 -- 거래 세금 (이자소득세 등)

    -- 이체 상세
    transfer_method            VARCHAR(20)   CHECK (transfer_method IN ('REALTIME', 'AGGREGATE', 'NIGHT', 'SAME_DAY')),
    settlement_date            VARCHAR(10),                                          -- 결제일 (거래일자와 결제일 차이 반영)

    -- 상태 및 승인 추적
    approved_by                UUID          REFERENCES employee(employee_id),
    approved_at                TIMESTAMPTZ,
    rejected_reason            VARCHAR(200),

    -- 보안 및 컴플라이언스
    risk_score                 DECIMAL(5,2),
    risk_flag                  BOOLEAN       NOT NULL DEFAULT FALSE,
    ip_address                 INET,
    device_fingerprint         VARCHAR(100),

    remark                     VARCHAR(200),            -- 적요
    memo                       TEXT,                    -- 고객 입력 메모 (적요보다 긴 메모용)

    transaction_date           VARCHAR(10)   NOT NULL,
    transacted_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    created_by                 UUID,
    updated_by                 UUID,
    created_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_transaction_amount CHECK (amount > 0)
);

CREATE INDEX idx_transaction_account_id    ON transaction (account_id);
CREATE INDEX idx_transaction_transacted_at ON transaction (transacted_at DESC);
CREATE INDEX idx_transaction_type          ON transaction (transaction_type);
CREATE UNIQUE INDEX idx_transaction_key    ON transaction (transaction_key) WHERE transaction_key IS NOT NULL;
CREATE INDEX idx_transaction_reference_no  ON transaction (reference_no)    WHERE reference_no IS NOT NULL;
CREATE INDEX idx_transaction_batch_id      ON transaction (batch_id)         WHERE batch_id IS NOT NULL;
CREATE INDEX idx_transaction_risk_flag     ON transaction (risk_flag)         WHERE risk_flag = TRUE;
CREATE INDEX idx_transaction_settlement    ON transaction (settlement_date)   WHERE settlement_date IS NOT NULL;


-- ============================================================
-- 15. 적금 납입 회차 관리
-- ============================================================
CREATE TABLE savings_payment (
    savings_payment_id  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id          UUID          NOT NULL REFERENCES account(account_id),

    installment_no      SMALLINT      NOT NULL CHECK (installment_no >= 1),  -- 납입 회차 (1부터 시작)
    scheduled_date      DATE          NOT NULL,          -- 예정 납입일
    scheduled_amount    NUMERIC(15,2) NOT NULL,          -- 약정 납입금액

    paid_date           VARCHAR(10),                            -- 실제 납입일
    paid_amount         NUMERIC(15,2),                   -- 실제 납입금액
    transaction_id      UUID          REFERENCES transaction(transaction_id),
                                                         -- 실제 거래 연결 (NULL이면 미납)

    savings_payment_status              VARCHAR(20)   NOT NULL DEFAULT 'SCHEDULED'
                            CHECK (savings_payment_status IN ('SCHEDULED', 'PAID', 'PARTIAL', 'MISSED')),
                            -- SCHEDULED=납입 예정, PAID=완납, PARTIAL=일부 납입, MISSED=미납

    created_by          UUID,
    updated_by          UUID,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    UNIQUE (account_id, installment_no)
);

CREATE INDEX idx_savings_payment_account ON savings_payment (account_id);
CREATE INDEX idx_savings_payment_status  ON savings_payment (savings_payment_status);


-- ============================================================
-- 16. 내부 원장 계좌 (은행 내부 관리용)
-- ============================================================
CREATE TABLE internal_account (
    internal_account_id     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    internal_account_number VARCHAR(30)   NOT NULL UNIQUE,
    contract_id             UUID          REFERENCES contract(contract_id),
    internal_type           VARCHAR(30)   NOT NULL
                                CHECK (internal_type IN ('DEPOSIT', 'OVERDRAFT_LOAN', 'SEIZED_DEPOSIT', 'LOAN')),
    internal_account_status                  VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE'
                                CHECK (internal_account_status IN ('ACTIVE', 'SUSPENDED', 'CLOSED', 'FROZEN')),
    credit_limit            NUMERIC(15,2),                -- 한도 (OVERDRAFT_LOAN 전용, NULL=해당없음)
    balance                 NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency_code           CHAR(3)       NOT NULL DEFAULT 'KRW',
    opened_date             VARCHAR(10)   NOT NULL,
    closed_date             VARCHAR(10),

    created_by              UUID,
    updated_by              UUID,
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_internal_account_balance CHECK (balance >= -COALESCE(credit_limit, 0)),
                                            -- OVERDRAFT_LOAN: 잔액이 한도 초과 인출 불가, 나머지: 0 이상
    CONSTRAINT chk_internal_account_closed  CHECK (closed_date IS NULL OR closed_date >= opened_date)
);

CREATE INDEX idx_internal_account_contract ON internal_account (contract_id);
CREATE INDEX idx_internal_account_status   ON internal_account (internal_account_status);


-- ============================================================
-- 16. 계좌 매핑 (대표계좌 1 : 내부계좌 N)
-- ============================================================
CREATE TABLE account_mapping (
    mapping_id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    rep_account_id          UUID         NOT NULL REFERENCES account(account_id),
    internal_account_id     UUID         NOT NULL REFERENCES internal_account(internal_account_id),
    map_type                VARCHAR(30)  NOT NULL
                                CHECK (map_type IN ('GENERAL_DEPOSIT', 'OVERDRAFT_LOAN', 'SEIZED_DEPOSIT', 'LOAN')),
    status_code             VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                                CHECK (status_code IN ('ACTIVE', 'PAYMENT_SUSPENDED', 'SEIZED', 'CLOSED')),
    priority                SMALLINT     NOT NULL DEFAULT 1,  -- 1이 최우선 (출금·상계 처리 순서)
    eff_dtm                 TIMESTAMPTZ,                      -- 효력 발생 일시 (압류 명령 송달 시간 등)

    created_by              UUID,
    updated_by              UUID,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_mapping_priority CHECK (priority > 0),
    UNIQUE (rep_account_id, internal_account_id)
);

CREATE INDEX idx_account_mapping_rep      ON account_mapping (rep_account_id);
CREATE INDEX idx_account_mapping_internal ON account_mapping (internal_account_id);
CREATE INDEX idx_account_mapping_status   ON account_mapping (status_code);


-- ============================================================
-- 17. 기업 역할 정책 (역할별 권한·한도)
-- ============================================================
CREATE TABLE corporate_role_policy (
    role                    VARCHAR(30)   PRIMARY KEY
                                CHECK (role IN ('VIEWER', 'TRANSFER_REQUESTER', 'APPROVER', 'ADMIN')),
    can_transfer            BOOLEAN       NOT NULL DEFAULT FALSE,  -- 이체 요청 가능 여부
    can_approve             BOOLEAN       NOT NULL DEFAULT FALSE,  -- 이체 승인 가능 여부
    transfer_limit_per_tx   NUMERIC(15,2),                        -- 1회 이체한도 (NULL=무제한)
    transfer_limit_per_day  NUMERIC(15,2),                        -- 1일 이체한도 (NULL=무제한)

    created_by              UUID,
    updated_by              UUID,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO corporate_role_policy
(role, can_transfer, can_approve, transfer_limit_per_tx, transfer_limit_per_day)
VALUES
('VIEWER',             FALSE, FALSE, NULL,          NULL),
('TRANSFER_REQUESTER', TRUE,  FALSE, 10000000.00,   30000000.00),
('APPROVER',           TRUE,  TRUE,  50000000.00,   100000000.00),
('ADMIN',              TRUE,  TRUE,  NULL,          NULL);


-- ============================================================
-- 18. 기업 사용자 (기업뱅킹 접속 계정)
-- ============================================================
CREATE TABLE corporate_user (
    corporate_user_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    corporate_id            UUID         NOT NULL REFERENCES corporate(corporate_id),
    corporate_user_email    VARCHAR(255) NOT NULL UNIQUE,

    corporate_user_name                VARCHAR(100) NOT NULL,
    corporate_user_department          VARCHAR(100),                   -- 부서
    corporate_user_position            VARCHAR(100),                   -- 직위
    corporate_user_role                VARCHAR(30)  NOT NULL DEFAULT 'VIEWER'
                            REFERENCES corporate_role_policy(role),
    corporate_user_status              VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                            CHECK (corporate_user_status IN ('ACTIVE', 'LOCKED', 'DISABLED')),

    failed_attempt_count INT         NOT NULL DEFAULT 0,
    locked_at           TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ,

    created_by          UUID,
    updated_by          UUID,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_corporate_user_corp  ON corporate_user (corporate_id);
CREATE INDEX idx_corporate_user_email ON corporate_user (corporate_user_email);

-- ============================================================
-- 23. 지점
-- ============================================================
CREATE TABLE branch (
    branch_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_code     VARCHAR(10)  NOT NULL,               -- 점포코드 (금융결제원 기준)
    branch_name     VARCHAR(100) NOT NULL,
    branch_type     VARCHAR(20)  NOT NULL
                    CHECK (branch_type IN ('HEAD_OFFICE', 'BRANCH', 'SUB_BRANCH')),
                    -- HEAD_OFFICE=본점, BRANCH=지점, SUB_BRANCH=출장소
    branch_status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                    CHECK (branch_status IN ('ACTIVE', 'CLOSED', 'SUSPENDED')),

    -- 주소
    branch_zip_code        VARCHAR(5),
    branch_address         VARCHAR(200),
    branch_address_detail  VARCHAR(100),

    -- 연락처
    branch_phone           VARCHAR(20),
    branch_fax             VARCHAR(20),

    -- 영업시간
    open_time       TIME,                                -- 영업 시작 (예: '09:00')
    close_time      TIME,                                -- 영업 종료 (예: '16:00')

    opened_date     VARCHAR(10),
    closed_date     VARCHAR(10),

    created_by      UUID,
    updated_by      UUID,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT branch_code_ukey UNIQUE (branch_code)
);

CREATE INDEX idx_branch_status ON branch (branch_status);
CREATE INDEX idx_branch_type   ON branch (branch_type);


-- ============================================================
-- 24. 은행 직원
-- ============================================================
CREATE TABLE employee (
    employee_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id           UUID         NOT NULL REFERENCES branch(branch_id),
    party_id            UUID         REFERENCES party(party_id),              -- NULL=은행 고객이 아닌 직원

    employee_no         VARCHAR(20)  NOT NULL UNIQUE,   -- 사번
    employee_name       VARCHAR(100) NOT NULL,
    department          VARCHAR(100),                   -- 부서
    position            VARCHAR(50),                    -- 직위 (예: 과장, 팀장)

    employee_email               VARCHAR(200),
    employee_phone               VARCHAR(20),

    employee_status              VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                            CHECK (employee_status IN ('ACTIVE', 'ON_LEAVE', 'RESIGNED')),
    hired_date          DATE         NOT NULL,
    resigned_date       VARCHAR(10),

    created_by          UUID,
    updated_by          UUID,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employee_branch ON employee (branch_id);
CREATE INDEX idx_employee_no     ON employee (employee_no);


-- ============================================================
-- 25. 대출 신청 프로세스
-- ============================================================

CREATE TABLE loan_application (
    application_id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id                UUID          NOT NULL REFERENCES party(party_id),
    product_id              UUID          NOT NULL REFERENCES product(product_id),

    -- 신청 내용
    requested_amount        NUMERIC(15,2) NOT NULL,
    requested_period_months INT,
    loan_purpose            VARCHAR(100),

    -- 진행 상태
    application_status      VARCHAR(20)   NOT NULL DEFAULT 'DRAFT'
                                CHECK (application_status IN ('DRAFT', 'SUBMITTED', 'REVIEWING', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED')),
                                -- DRAFT=임시저장, SUBMITTED=제출, REVIEWING=심사중, APPROVED=승인, REJECTED=거절, EXECUTED=실행완료, CANCELLED=취소

    -- 심사 결과
    approved_amount         NUMERIC(15,2),  -- 승인 금액 (신청과 다를 수 있음)
    approved_rate           NUMERIC(7,4),   -- 승인 금리
    rejection_reason        VARCHAR(500),

    -- 계약 연결 (실행 후)
    contract_id             UUID          REFERENCES contract(contract_id),

    -- 신청 채널
    channel                 VARCHAR(20)   CHECK (channel IN ('APP', 'INTERNET', 'BRANCH', 'PHONE')),
    branch_id               UUID          REFERENCES branch(branch_id),
    employee_id             UUID          REFERENCES employee(employee_id),

    submitted_at            TIMESTAMPTZ,
    decided_at              TIMESTAMPTZ,

    created_by              UUID,
    updated_by              UUID,
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loan_application_party   ON loan_application (party_id);
CREATE INDEX idx_loan_application_product ON loan_application (product_id);
CREATE INDEX idx_loan_application_status  ON loan_application (application_status);


-- 25-1. 다단계 심사 승인선
CREATE TABLE loan_approval_step (
    step_id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id      UUID         NOT NULL REFERENCES loan_application(application_id),

    step_no             SMALLINT     NOT NULL,   -- 승인 순서 (1부터)
    employee_id         UUID         NOT NULL REFERENCES employee(employee_id),

    step_status         VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                            CHECK (step_status IN ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED')),
    comment             TEXT,
    decided_at          TIMESTAMPTZ,

    created_by          UUID,
    updated_by          UUID,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_loan_approval_step UNIQUE (application_id, step_no)
);

CREATE INDEX idx_loan_approval_step_application ON loan_approval_step (application_id);


-- 25-2. 제출 서류
CREATE TABLE loan_document (
    document_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id      UUID         NOT NULL REFERENCES loan_application(application_id),

    document_type       VARCHAR(50)  NOT NULL
                            CHECK (document_type IN ('ID_CARD', 'INCOME_PROOF', 'EMPLOYMENT_CERT', 'PROPERTY_CERT', 'TAX_RETURN', 'BANK_STATEMENT', 'OTHER')),
                            -- 신분증, 소득증빙, 재직증명서, 부동산등기부, 세금신고서, 거래내역, 기타
    file_name           VARCHAR(255),
    file_url            TEXT,

    verified            BOOLEAN      NOT NULL DEFAULT FALSE,
    verified_by         UUID         REFERENCES employee(employee_id),
    verified_at         TIMESTAMPTZ,

    created_by          UUID,
    updated_by          UUID,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loan_document_application ON loan_document (application_id);


-- 25-3. 담보물
CREATE TABLE loan_collateral (
    collateral_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id      UUID          NOT NULL REFERENCES loan_application(application_id),

    collateral_type     VARCHAR(30)   NOT NULL
                            CHECK (collateral_type IN ('REAL_ESTATE', 'DEPOSIT', 'SECURITIES', 'VEHICLE', 'OTHER')),

    -- 부동산 담보
    property_address    VARCHAR(300),  -- 소재지
    property_reg_no     VARCHAR(30),   -- 부동산 등기번호

    -- 공통
    appraised_value     NUMERIC(15,2), -- 감정가
    appraised_at        VARCHAR(10),          -- 감정 기준일
    appraiser           VARCHAR(100),  -- 감정기관명
    lien_amount         NUMERIC(15,2), -- 설정 근저당 금액

    created_by          UUID,
    updated_by          UUID,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loan_collateral_application ON loan_collateral (application_id);


-- 25-4. 연체 이력
CREATE TABLE loan_delinquency (
    delinquency_id      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id         UUID          NOT NULL REFERENCES contract(contract_id),

    delinquency_status  VARCHAR(20)   NOT NULL
                            CHECK (delinquency_status IN ('OVERDUE', 'DEFAULT', 'RECOVERED')),
                            -- OVERDUE=연체, DEFAULT=부도/채무불이행, RECOVERED=정상화

    overdue_principal   NUMERIC(15,2) NOT NULL DEFAULT 0,  -- 연체 원금
    overdue_interest    NUMERIC(15,2) NOT NULL DEFAULT 0,  -- 연체 이자
    overdue_days        INT           NOT NULL,             -- 연체일수

    started_at          DATE          NOT NULL,             -- 연체 시작일
    recovered_at        VARCHAR(10),                               -- 정상화일 (NULL=현재 연체 중)

    created_by          UUID,
    updated_by          UUID,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_loan_delinquency_dates CHECK (recovered_at IS NULL OR recovered_at >= started_at)
);

CREATE INDEX idx_loan_delinquency_contract ON loan_delinquency (contract_id);
CREATE INDEX idx_loan_delinquency_status   ON loan_delinquency (delinquency_status);


-- ============================================================
-- 26. 감사 로그 (Audit Trail) — 모든 테이블 변경 이력
-- ============================================================
CREATE TABLE audit_log (
    audit_id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name              VARCHAR(100) NOT NULL,
    record_id               UUID         NOT NULL,
    operation               VARCHAR(10)  NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    old_values              JSONB,
    new_values              JSONB,
    changed_by              UUID         NOT NULL,
    changed_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- 내부통제: 준법감시인 승인 필요 여부
    compliance_required     BOOLEAN      NOT NULL DEFAULT FALSE,
    compliance_approved     BOOLEAN,
    compliance_approved_by  UUID,
    compliance_approved_at  TIMESTAMPTZ,

    ip_address              INET,
    session_id              VARCHAR(100),

    created_by              UUID,
    updated_by              UUID,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_table_record ON audit_log (table_name, record_id);
CREATE INDEX idx_audit_changed_at   ON audit_log (changed_at DESC);
