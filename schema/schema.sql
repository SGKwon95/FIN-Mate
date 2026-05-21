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
('USER_ROLE', '사용자 권한', '회원 권한 관리'),
('ACCOUNT_STATUS', '계좌 상태', '계좌 활성/정지 상태'),
('BANK_CODE', '은행 코드', '은행 목록'),
('TX_TYPE', '거래 유형', '입출금 거래 유형');
('PROD_TYPE', '상품 유형', '상품 유형');

INSERT INTO common_code
(group_id, code, code_name, sort_order)
VALUES
('USER_ROLE', 'INDIVIDUAL', '일반회원', 1),
('USER_ROLE', 'VIP', 'VIP회원', 2),
('USER_ROLE', 'ADMIN', '관리자', 3),
('USER_ROLE', 'EMPLOYEE', '은행직원', 4),
('PROD_TYPE', 'DEPOSIT', '예금성 상품', 1),
('PROD_TYPE', 'LOAN', '대출성 상품', 2);


-- ============================================================
-- 2. 고객 마스터 공통 (party)
-- ============================================================
CREATE TABLE party (
    party_id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- 화면 표시 및 대고객 서비스용 고유 번호 (Unique 인덱스)
    -- 예: 'IND-2026-0001', 'COR-2026-0002' 형태로 Next.js 백엔드에서 생성해서 삽입
    party_no                VARCHAR(30)  NOT NULL UNIQUE,
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
    employment_start_date   VARCHAR(8),                      -- 입사일
    annual_income           NUMERIC(15,2),             -- 연간 소득 (여신 심사 기준)

    individual_status        VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                            CHECK (individual_status IN ('ACTIVE', 'SUSPENDED', 'DORMANT', 'WITHDRAWN')),
                            -- ACTIVE=정상, SUSPENDED=거래정지, DORMANT=휴면, WITHDRAWN=탈퇴

    -- 기업뱅킹 (법인 소속 시만 사용, 나머지는 NULL)
    corp_id                     UUID         REFERENCES corporate(corporate_id),
    corp_department             VARCHAR(100),                -- 소속 부서
    corp_position               VARCHAR(100),                -- 기업 내 직급
    corp_role                   VARCHAR(30)  CHECK (corp_role IN ('VIEWER', 'TRANSFER_REQUESTER', 'APPROVER', 'ADMIN')),
    corp_status                 VARCHAR(20)  CHECK (corp_status IN ('ACTIVE', 'LOCKED', 'DISABLED')),
    corp_failed_attempt_count   INT,
    corp_locked_at              TIMESTAMPTZ,
    corp_last_login_at          TIMESTAMPTZ,

    created_by              UUID,
    updated_by              UUID,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_individual_ci   ON individual (indivisual_ci);
CREATE INDEX idx_individual_corp ON individual (corp_id) WHERE corp_id IS NOT NULL;


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
    industry_code           VARCHAR(10),               -- 업종코드 (KSIC 세세분류 5자리, 예: 47111=슈퍼마켓)
    business_type_code      VARCHAR(10),               -- 업태코드 (KSIC 대분류 1자리, 예: G=도소매업)
    established_date        VARCHAR(8),                      -- 설립일
    fiscal_year_end_month   SMALLINT      CHECK (fiscal_year_end_month BETWEEN 1 AND 12),  -- 결산월
    representative_name          VARCHAR(100),              -- 대표자명
    representative_phone         VARCHAR(20),               -- 대표자 전화번호
    representative_email         VARCHAR(100),              -- 대표자 이메일
    representative_nationality   VARCHAR(3),                -- 대표자 국적 (ISO 3166-1 alpha-3, 예: KOR)
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
    credit_rated_at         VARCHAR(8),                      -- 신용평가 기준일

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
    expiry_date                         VARCHAR(8),

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
    description                         TEXT,

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
    effective_date  VARCHAR(8) NOT NULL,  -- 시행일
    expiry_date     VARCHAR(8),           -- 종료일 (NULL=현재 유효)
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
    effective_to    VARCHAR(8),                               -- 적용 종료일 (NULL=현재 적용 중)

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
    effective_to    VARCHAR(8),                               -- NULL=현재 적용 중

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
    effective_to          VARCHAR(8),                         -- NULL=현재 적용 중

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

    effective_from  VARCHAR(8)  NOT NULL,
    effective_to    VARCHAR(8),                         -- NULL=현재 적용 중

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
    prepayment_allowed            BOOLEAN      NOT NULL DEFAULT FALSE,  -- 선납 가능 여부 (SAVINGS 전용)
    deferral_allowed              BOOLEAN      NOT NULL DEFAULT FALSE,  -- 이연 가능 여부 (SAVINGS 전용)

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
    contract_date                    VARCHAR(8) NOT NULL,  -- 계약 체결일
    execution_date                   VARCHAR(8),           -- 실행일자 (대출 실행일, 예금 개시일 등. NULL=즉시 실행)
    maturity_date                    VARCHAR(8),           -- 만기일 (contract_date + 기간을 스냅샷으로 저장)
    end_date                         VARCHAR(8),           -- 종료일자 (실제 종료일. 중도해지 시 maturity_date와 다름)
    contract_period_months           SMALLINT,              -- 계약기간 (개월), 수시입출금 등 기간 없는 상품은 NULL
    contract_amount                  NUMERIC(15,2),         -- 대출=대출원금 / 적금=총납입목표액 / 정기예금=예치원금 / 보통예금=NULL
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
    contract_method    VARCHAR(20) NOT NULL
                           CHECK (contract_method IN ('REMOTE', 'IN_PERSON', 'HYBRID')),
                           -- REMOTE=원격(앱·인터넷), IN_PERSON=대면(지점), HYBRID=하이브리드(원격 신청 + 대면 완료)
    ip_address         INET,                                  -- 약관 동의 시점 IP (비대면 채널)

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
    credit_limit            NUMERIC(15,2),                       -- 마이너스 통장 한도 (OVERDRAFT 전용, NULL=해당없음)
    balance                 NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency_code           CHAR(3)       NOT NULL DEFAULT 'KRW',
    opened_date             VARCHAR(8)   NOT NULL,
    closed_date             VARCHAR(8),
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

    CONSTRAINT chk_account_balance CHECK (balance >= -COALESCE(credit_limit, 0)),
    CONSTRAINT chk_account_closed  CHECK (closed_date IS NULL OR closed_date >= opened_date)
);

CREATE INDEX idx_account_party_id ON account (party_id);
CREATE INDEX idx_account_contract_id ON account (contract_id);
CREATE INDEX idx_account_status      ON account (account_status);


-- ============================================================
-- 14. 실행지시 (대량이체 / 공동망 이체 지시)
-- ============================================================
CREATE TABLE transfer_instruction (
    instruction_id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

    instruction_type        VARCHAR(30)   NOT NULL
                              CHECK (instruction_type IN (
                                'BULK_TRANSFER',    -- 대량이체 (기업뱅킹)
                                'NETWORK_INBOUND',  -- 공동망 수신 지시
                                'NETWORK_OUTBOUND', -- 공동망 송신 지시
                                'AUTO_DEBIT',       -- CMS 자동이체
                                'SCHEDULED'         -- 예약이체 배치
                              )),

    -- 공동망 정보
    transfer_scope          VARCHAR(10)   CHECK (transfer_scope IN ('INTERBANK', 'INTRABANK')),
                              -- INTERBANK=타행이체, INTRABANK=당행이체
    clearing_network        VARCHAR(20)   CHECK (clearing_network IN ('KFTC', 'CD_NETWORK', 'CMS', 'GIRO', 'INTERNAL')),
                              -- KFTC=타행이체, CD_NETWORK=CD/ATM공동망, CMS=기업자동이체, GIRO=지로
    network_seq_no          VARCHAR(50),              -- 공동망 전문 일련번호
    network_response_code   VARCHAR(10),              -- 게이트웨이 응답코드 (오픈뱅킹: A0000, 기존망: 00)
    bank_response_code      VARCHAR(10),              -- 수취은행 응답코드 (오픈뱅킹: bank_rsp_code, 기존망 동일값)

    -- 실행 집계
    instruction_status      VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
                              CHECK (instruction_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED')),
    total_count             INT,                      -- 총 거래 건수
    success_count           INT           NOT NULL DEFAULT 0,
    failed_count            INT           NOT NULL DEFAULT 0,
    total_amount            NUMERIC(15,2),            -- 총 지시 금액

    -- 기업뱅킹 승인 워크플로우
    submitted_by            UUID          REFERENCES party(party_id),
    approved_by             UUID          REFERENCES party(party_id),
    approved_at             TIMESTAMPTZ,

    scheduled_at            TIMESTAMPTZ,              -- 예정 실행 시각
    executed_at             TIMESTAMPTZ,              -- 실제 실행 시각

    remark                  VARCHAR(200),

    created_by              UUID,
    updated_by              UUID,
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transfer_instruction_type    ON transfer_instruction (instruction_type);
CREATE INDEX idx_transfer_instruction_status  ON transfer_instruction (instruction_status);
CREATE INDEX idx_transfer_instruction_network ON transfer_instruction (clearing_network) WHERE clearing_network IS NOT NULL;


-- ============================================================
-- 14-1. KFTC 수신이력 (오픈뱅킹 API 응답 수신 이력)
-- ============================================================
CREATE TABLE kftc_receipt (
    receipt_id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    instruction_id      UUID          NOT NULL REFERENCES transfer_instruction(instruction_id),

    rsp_code            VARCHAR(10)   NOT NULL,    -- 오픈뱅킹 응답코드 (A0000=정상)
    rsp_message         VARCHAR(200),              -- 응답메시지
    bank_rsp_code       VARCHAR(10),               -- 수취은행 응답코드
    bank_rsp_message    VARCHAR(200),              -- 수취은행 응답메시지
    fintech_use_num     VARCHAR(30),               -- 핀테크이용번호
    bank_tran_id        VARCHAR(30),               -- 은행거래고유번호 (KFTC 채번, 예: M202607010001)

    received_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    created_by          UUID,
    updated_by          UUID,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kftc_receipt_instruction ON kftc_receipt (instruction_id);
CREATE INDEX idx_kftc_receipt_bank_tran   ON kftc_receipt (bank_tran_id) WHERE bank_tran_id IS NOT NULL;


-- ============================================================
-- 15. 거래 내역
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
    instruction_id             UUID          REFERENCES transfer_instruction(instruction_id),  -- 실행지시 연결

    -- 세금
    tax_amount                 NUMERIC(15,2),                                 -- 거래 세금 (이자소득세 등)

    -- 이체 상세
    transfer_method            VARCHAR(20)   CHECK (transfer_method IN ('REALTIME', 'AGGREGATE', 'NIGHT', 'SAME_DAY')),
    settlement_date            VARCHAR(8),                                          -- 결제일 (거래일자와 결제일 차이 반영)

    -- 상태 및 승인 추적
    approved_by                UUID          REFERENCES employee(employee_id),
    approved_at                TIMESTAMPTZ,
    rejected_reason            VARCHAR(200),

    retry_count                SMALLINT      NOT NULL DEFAULT 0,       -- 재시도 횟수

    -- 보안 및 컴플라이언스
    risk_score                 DECIMAL(5,2),
    risk_flag                  BOOLEAN       NOT NULL DEFAULT FALSE,
    ip_address                 INET,
    device_fingerprint         VARCHAR(100),

    remark                     VARCHAR(200),            -- 적요
    memo                       TEXT,                    -- 고객 입력 메모 (적요보다 긴 메모용)

    transaction_date           VARCHAR(8)   NOT NULL,
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
CREATE INDEX idx_transaction_instruction_id ON transaction (instruction_id)   WHERE instruction_id IS NOT NULL;
CREATE INDEX idx_transaction_risk_flag     ON transaction (risk_flag)         WHERE risk_flag = TRUE;
CREATE INDEX idx_transaction_settlement    ON transaction (settlement_date)   WHERE settlement_date IS NOT NULL;


-- ============================================================
-- 16. 적금 납입 회차 관리
-- ============================================================
CREATE TABLE savings_payment (
    savings_payment_id  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id         UUID          NOT NULL REFERENCES contract(contract_id),
    account_id          UUID          NOT NULL REFERENCES account(account_id),

    installment_no      SMALLINT      NOT NULL CHECK (installment_no >= 1),  -- 납입 회차 (1부터 시작)
    scheduled_date      DATE          NOT NULL,          -- 예정 납입일
    scheduled_amount    NUMERIC(15,2) NOT NULL,          -- 약정 납입금액

    paid_date           VARCHAR(8),                            -- 실제 납입일
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

CREATE INDEX idx_savings_payment_contract ON savings_payment (contract_id);
CREATE INDEX idx_savings_payment_account  ON savings_payment (account_id);
CREATE INDEX idx_savings_payment_status   ON savings_payment (savings_payment_status);




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

    opened_date     VARCHAR(8),
    closed_date     VARCHAR(8),

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
    resigned_date       VARCHAR(8),

    created_by          UUID,
    updated_by          UUID,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employee_branch ON employee (branch_id);
CREATE INDEX idx_employee_no     ON employee (employee_no);


-- ============================================================
-- 25. 문서 (파일 저장 + 범용 첨부 문서 — 대출·계약·KYC 등)
-- ============================================================
CREATE TABLE document (
    document_id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 파일 저장 정보
    original_name       VARCHAR(255)  NOT NULL,              -- 업로드 원본 파일명
    stored_name         VARCHAR(255),                        -- 저장 파일명 (UUID 기반 등)
    file_url            TEXT          NOT NULL,              -- 스토리지 경로 (S3 등)
    file_size           BIGINT,                              -- 파일 크기 (bytes)
    mime_type           VARCHAR(100),                        -- MIME 타입 (예: application/pdf)

    upload_status       VARCHAR(20)   NOT NULL DEFAULT 'COMPLETED'
                            CHECK (upload_status IN ('PENDING', 'COMPLETED', 'FAILED')),

    uploaded_by         UUID          REFERENCES party(party_id),
    uploaded_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- 연결 대상 (폴리모픽)
    entity_type         VARCHAR(30)   NOT NULL
                            CHECK (entity_type IN ('LOAN_APPLICATION', 'CONTRACT', 'ACCOUNT', 'KYC', 'OTHER')),
    entity_id           UUID          NOT NULL,              -- 연결 대상 PK (FK 없음, entity_type 따라 참조 대상 다름)

    document_type       VARCHAR(50)   NOT NULL
                            CHECK (document_type IN ('ID_CARD', 'LOAN_APPLICATION_FORM', 'DEBT_STATEMENT', 'INCOME_PROOF',
                                                     'CREDIT_INFO_CONSENT', 'EMPLOYMENT_CERT', 'PROPERTY_CERT',
                                                     'TAX_RETURN', 'BANK_STATEMENT', 'CONTRACT_COPY', 'OTHER')),
                            -- 신분증, 융자상담신청서, 부채현황표, 소득증빙, 신용정보조회동의서,
                            -- 재직증명서, 부동산등기부, 세금신고서, 거래내역, 계약서사본, 기타

    verified            BOOLEAN       NOT NULL DEFAULT FALSE,
    verified_by         UUID          REFERENCES employee(employee_id),
    verified_at         TIMESTAMPTZ,

    submitted_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    submitter_party_id  UUID          REFERENCES party(party_id),

    created_by          UUID,
    updated_by          UUID,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_entity      ON document (entity_type, entity_id);
CREATE INDEX idx_document_uploaded_by ON document (uploaded_by) WHERE uploaded_by IS NOT NULL;
CREATE INDEX idx_document_submitter   ON document (submitter_party_id) WHERE submitter_party_id IS NOT NULL;


-- ============================================================
-- 27. 대출 신청 프로세스
-- ============================================================

CREATE TABLE loan_application (
    application_id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id                UUID          NOT NULL REFERENCES party(party_id),
    product_id              UUID          NOT NULL REFERENCES product(product_id),

    -- 신청 내용
    requested_amount        NUMERIC(15,2) NOT NULL,
    requested_period_months INT,
    loan_purpose            VARCHAR(100),

    -- 본인 확인
    applicant_verified      BOOLEAN       NOT NULL DEFAULT FALSE,     -- 실명 확인 여부
    agent_authorization     BOOLEAN       DEFAULT FALSE,               -- 대리 신청 시 대리권 유무
    agent_id                UUID,                                      -- 대리인 party_id (본인 신청 시 NULL)
    credit_check_delegated  BOOLEAN       NOT NULL DEFAULT FALSE,      -- 신용조사 심사부서 위탁 여부 (FALSE=영업점 자체, TRUE=심사부서)

    -- 진행 상태
    application_status      VARCHAR(20)   NOT NULL DEFAULT 'DRAFT'
                                CHECK (application_status IN ('DRAFT', 'SUBMITTED', 'CREDIT_CHECK', 'REVIEWING', 'APPROVED', 'PRE_EXECUTION', 'REJECTED', 'EXECUTED', 'CANCELLED')),
                                -- DRAFT=임시저장, SUBMITTED=제출, CREDIT_CHECK=신용조사중, REVIEWING=심사중, APPROVED=승인, PRE_EXECUTION=실행전확인, REJECTED=거절, EXECUTED=실행완료, CANCELLED=취소

    -- 심사 결과
    approved_amount         NUMERIC(15,2),  -- 승인 금액 (신청과 다를 수 있음)
    approved_rate           NUMERIC(7,4),   -- 승인 금리
    rejection_reason        VARCHAR(500),

    -- 심사 검토 항목
    credit_review_result    TEXT,            -- 차주 적격성 심사 결과 (자격, 신용상태, 거래상황)
    fund_necessity_review   TEXT,            -- 소요자금 적정성 검토
    collateral_review       TEXT,            -- 채권보전 방법 검토 (보증인, 담보)
    profitability_review    TEXT,            -- 기여도 및 금리 검토
    credit_grade            VARCHAR(10),     -- 여신 등급 (예: A, B, C, D)

    -- 전결권자
    approval_authority_id   UUID            REFERENCES employee(employee_id),  -- 전결권자
    approved_at             TIMESTAMPTZ,

    -- 계약 연결 (실행 후)
    contract_id             UUID          REFERENCES contract(contract_id),

    -- 신청 채널
    channel                 VARCHAR(20)   CHECK (channel IN ('APP', 'INTERNET', 'BRANCH', 'PHONE')),
    branch_id               UUID          REFERENCES branch(branch_id),
    employee_id             UUID          REFERENCES employee(employee_id),

    -- 상담 기록
    consultation_date       DATE,            -- 여신 상담일
    consultation_memo       TEXT,            -- 상담 메모

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


-- 27-1. 다단계 심사 승인선
CREATE TABLE loan_approval_step (
    step_id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id      UUID         NOT NULL REFERENCES loan_application(application_id),

    step_no             SMALLINT     NOT NULL,   -- 승인 순서 (1부터)
    employee_id         UUID         NOT NULL REFERENCES employee(employee_id),

    step_status         VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                            CHECK (step_status IN ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED')),
    comment             TEXT,
    decided_at          TIMESTAMPTZ,

    -- 전결 권한
    authority_level     INTEGER,                -- 전결 권한 레벨 (높을수록 상위 결재권자)
    authority_name      VARCHAR(100),           -- 전결권자 직급/직위 (스냅샷)

    created_by          UUID,
    updated_by          UUID,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_loan_approval_step UNIQUE (application_id, step_no)
);

CREATE INDEX idx_loan_approval_step_application ON loan_approval_step (application_id);


-- 27-2. 담보물
CREATE TABLE loan_collateral (
    collateral_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id      UUID          NOT NULL REFERENCES loan_application(application_id),

    collateral_type     VARCHAR(30)   NOT NULL
                            CHECK (collateral_type IN ('REAL_ESTATE', 'DEPOSIT', 'SECURITIES', 'VEHICLE', 'OTHER')),

    -- 부동산 담보
    property_address    VARCHAR(300),  -- 소재지
    property_reg_no     VARCHAR(30),   -- 부동산 등기번호

    -- 담보 평가
    appraised_value     NUMERIC(15,2), -- 감정가
    appraised_at        DATE,          -- 감정 기준일
    appraiser           VARCHAR(100),  -- 감정기관명
    self_appraised          BOOLEAN       NOT NULL DEFAULT FALSE,  -- 담보 자체평가 여부 (FALSE=집중화센터 위탁, TRUE=영업점 자체)
    appraisal_requested_at  TIMESTAMPTZ,  -- 감정 요청일
    appraisal_completed_at  TIMESTAMPTZ,  -- 감정 완료일
    lien_amount         NUMERIC(15,2), -- 설정 근저당 금액
    lien_registered_at      DATE,        -- 저당권 설정 등기일
    lien_reg_no           VARCHAR(50),   -- 저당권 등기번호
    lien_confirmed          BOOLEAN       NOT NULL DEFAULT FALSE,  -- 채권보전(저당권설정) 완료 확인 여부 — 여신실행 전 TRUE여야 함

    created_by          UUID,
    updated_by          UUID,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loan_collateral_application ON loan_collateral (application_id);


-- 27-3. 연체 이력
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
    recovered_at        DATE,                               -- 정상화일 (NULL=현재 연체 중)

    -- 사후관리
    fund_misuse_flag      BOOLEAN       NOT NULL DEFAULT FALSE,   -- 용도 외 유용 여부
    fund_misuse_detail    TEXT,                                     -- 유용 내용
    collection_method     VARCHAR(20),                            -- 회수 방식 (SELF=자기회수, GUARANTEE=보증인회수, LEGAL=법적회수, WRITE_OFF=파산정리)
    extension_history     JSONB,                                  -- 기간 연장 이력 (예: [{"ext_date": "2026-12-01", "ext_months": 12}])

    created_by          UUID,
    updated_by          UUID,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_loan_delinquency_dates CHECK (recovered_at IS NULL OR recovered_at >= started_at)
);

CREATE INDEX idx_loan_delinquency_contract ON loan_delinquency (contract_id);
CREATE INDEX idx_loan_delinquency_status   ON loan_delinquency (delinquency_status);


-- ============================================================
-- 28. 알림
-- ============================================================
CREATE TABLE notification (
    notification_id     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id            UUID          NOT NULL REFERENCES party(party_id),

    notification_type                VARCHAR(50)   NOT NULL
                            CHECK (notification_type IN (
                                'TRANSFER_OUT', 'TRANSFER_IN', 'LOW_BALANCE', 'ACCOUNT_LOCKED',
                                'SAVINGS_DUE', 'SAVINGS_PAID', 'SAVINGS_MATURITY', 'RISK_ALERT'
                            )),
    notification_title               VARCHAR(200)  NOT NULL,
    notification_body                VARCHAR(500)  NOT NULL,
    is_read             BOOLEAN       NOT NULL DEFAULT FALSE,
    linked_entity_id    UUID,

    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_party_read ON notification (party_id, is_read);
CREATE INDEX idx_notification_created_at ON notification (created_at DESC);


-- ============================================================
-- 29. 감사 로그 (Audit Trail) — 모든 테이블 변경 이력
-- -- ============================================================
-- CREATE TABLE audit_log (
--     audit_id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
--     table_name              VARCHAR(100) NOT NULL,
--     record_id               UUID         NOT NULL,
--     operation               VARCHAR(10)  NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
--     old_values              JSONB,
--     new_values              JSONB,
--     changed_by              UUID         NOT NULL,
--     changed_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

--     -- 내부통제: 준법감시인 승인 필요 여부
--     compliance_required     BOOLEAN      NOT NULL DEFAULT FALSE,
--     compliance_approved     BOOLEAN,
--     compliance_approved_by  UUID,
--     compliance_approved_at  TIMESTAMPTZ,

--     ip_address              INET,
--     session_id              VARCHAR(100),

--     created_by              UUID,
--     updated_by              UUID,
--     created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
--     updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
-- );

-- CREATE INDEX idx_audit_table_record ON audit_log (table_name, record_id);
-- CREATE INDEX idx_audit_changed_at   ON audit_log (changed_at DESC);
