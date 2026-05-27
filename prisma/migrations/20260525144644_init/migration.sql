-- CreateTable
CREATE TABLE "common_code_group" (
    "group_id" VARCHAR(50) NOT NULL,
    "group_name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "use_yn" CHAR(1) NOT NULL DEFAULT 'Y',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "common_code_group_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "common_code" (
    "code_id" BIGSERIAL NOT NULL,
    "group_id" VARCHAR(50) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "code_name" VARCHAR(100) NOT NULL,
    "code_value" VARCHAR(100),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "use_yn" CHAR(1) NOT NULL DEFAULT 'Y',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "common_code_pkey" PRIMARY KEY ("code_id")
);

-- CreateTable
CREATE TABLE "party" (
    "party_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "party_no" VARCHAR(30),
    "party_name" VARCHAR(100) NOT NULL,
    "party_role" VARCHAR(20) NOT NULL,
    "party_status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "party_status_reason" VARCHAR(200),
    "party_status_changed_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "party_pkey" PRIMARY KEY ("party_id")
);

-- CreateTable
CREATE TABLE "individual" (
    "individual_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "party_id" UUID NOT NULL,
    "individual_phone" VARCHAR(20),
    "individual_email" VARCHAR(200),
    "indivisual_ci" VARCHAR(50) NOT NULL,
    "transfer_limit_per_transaction" DECIMAL(15,2),
    "transfer_limit_per_day" DECIMAL(15,2),
    "zip_code" VARCHAR(5),
    "address" VARCHAR(200),
    "address_detail" VARCHAR(100),
    "employment_type" VARCHAR(20),
    "employer_name" VARCHAR(100),
    "job_title" VARCHAR(50),
    "industry_code" VARCHAR(10),
    "employment_start_date" VARCHAR(8),
    "annual_income" DECIMAL(15,2),
    "individual_status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "corp_id" UUID,
    "corp_department" VARCHAR(100),
    "corp_position" VARCHAR(100),
    "corp_role" VARCHAR(30),
    "corp_status" VARCHAR(20),
    "corp_failed_attempt_count" INTEGER,
    "corp_locked_at" TIMESTAMPTZ,
    "corp_last_login_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "individual_pkey" PRIMARY KEY ("individual_id")
);

-- CreateTable
CREATE TABLE "corporate" (
    "corporate_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "party_id" UUID NOT NULL,
    "business_reg_no" VARCHAR(20) NOT NULL,
    "corporation_reg_no" VARCHAR(20),
    "company_type" VARCHAR(20),
    "industry_code" VARCHAR(10),
    "business_type_code" VARCHAR(10),
    "established_date" VARCHAR(8),
    "fiscal_year_end_month" SMALLINT,
    "representative_name" VARCHAR(100),
    "representative_phone" VARCHAR(20),
    "representative_email" VARCHAR(100),
    "representative_nationality" VARCHAR(3),
    "capital_amount" DECIMAL(15,2),
    "biz_zip_code" VARCHAR(5),
    "biz_address" VARCHAR(200),
    "biz_address_detail" VARCHAR(100),
    "reg_zip_code" VARCHAR(5),
    "reg_address" VARCHAR(200),
    "reg_address_detail" VARCHAR(100),
    "credit_grade" VARCHAR(10),
    "credit_rating_agency" VARCHAR(50),
    "credit_rated_at" VARCHAR(8),
    "beneficial_owner_verified" BOOLEAN NOT NULL DEFAULT false,
    "beneficial_owner_verified_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corporate_pkey" PRIMARY KEY ("corporate_id")
);

-- CreateTable
CREATE TABLE "party_auth" (
    "auth_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "party_id" UUID NOT NULL,
    "login_id" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "password_salt" VARCHAR(255),
    "password_changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password_expires_at" TIMESTAMPTZ,
    "party_auth_status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "failed_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "party_auth_pkey" PRIMARY KEY ("auth_id")
);

-- CreateTable
CREATE TABLE "branch" (
    "branch_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_code" VARCHAR(10) NOT NULL,
    "branch_name" VARCHAR(100) NOT NULL,
    "branch_type" VARCHAR(20) NOT NULL,
    "branch_status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "branch_zip_code" VARCHAR(5),
    "branch_address" VARCHAR(200),
    "branch_address_detail" VARCHAR(100),
    "branch_phone" VARCHAR(20),
    "branch_fax" VARCHAR(20),
    "open_time" TIME,
    "close_time" TIME,
    "opened_date" VARCHAR(8),
    "closed_date" VARCHAR(8),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_pkey" PRIMARY KEY ("branch_id")
);

-- CreateTable
CREATE TABLE "employee" (
    "employee_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "party_id" UUID,
    "employee_no" VARCHAR(20) NOT NULL,
    "employee_name" VARCHAR(100) NOT NULL,
    "department" VARCHAR(100),
    "position" VARCHAR(50),
    "employee_email" VARCHAR(200),
    "employee_phone" VARCHAR(20),
    "employee_status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "hired_date" DATE NOT NULL,
    "resigned_date" VARCHAR(8),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "product" (
    "product_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_name" VARCHAR(200) NOT NULL,
    "product_type_code" VARCHAR(20) NOT NULL,
    "product_status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "launch_date" DATE NOT NULL,
    "expiry_date" VARCHAR(8),
    "period_type" VARCHAR(20) NOT NULL DEFAULT 'UNLIMITED',
    "contract_period_months" INTEGER,
    "sales_target" VARCHAR(20) NOT NULL DEFAULT 'ALL',
    "is_deposit_insured" BOOLEAN NOT NULL DEFAULT false,
    "deposit_insurance_limit" DECIMAL(15,2),
    "description" TEXT,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "product_terms" (
    "terms_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "terms_type" VARCHAR(30) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "effective_date" VARCHAR(8) NOT NULL,
    "expiry_date" VARCHAR(8),
    "changed_at" TIMESTAMPTZ,
    "content_url" TEXT,
    "change_reason" TEXT,
    "responsible_department" VARCHAR(100),
    "responsible_employee_id" UUID,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_terms_pkey" PRIMARY KEY ("terms_id")
);

-- CreateTable
CREATE TABLE "product_rate" (
    "product_rate_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "rate_type" VARCHAR(20) NOT NULL,
    "rate_structure" VARCHAR(20) NOT NULL DEFAULT 'FIXED',
    "rate" DECIMAL(7,4) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" VARCHAR(8),
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_rate_pkey" PRIMARY KEY ("product_rate_id")
);

-- CreateTable
CREATE TABLE "product_rate_tier" (
    "rate_tier_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "tier_type" VARCHAR(20) NOT NULL,
    "min_value" DECIMAL(15,2),
    "max_value" DECIMAL(15,2),
    "rate" DECIMAL(7,4) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" VARCHAR(8),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_rate_tier_pkey" PRIMARY KEY ("rate_tier_id")
);

-- CreateTable
CREATE TABLE "product_rate_benefit" (
    "rate_benefit_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "benefit_name" VARCHAR(100) NOT NULL,
    "benefit_rate" DECIMAL(7,4) NOT NULL,
    "condition_description" TEXT,
    "effective_from" DATE NOT NULL,
    "effective_to" VARCHAR(8),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_rate_benefit_pkey" PRIMARY KEY ("rate_benefit_id")
);

-- CreateTable
CREATE TABLE "product_fee" (
    "fee_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "fee_type" VARCHAR(30) NOT NULL,
    "channel" VARCHAR(20) NOT NULL DEFAULT 'ALL',
    "min_amount" DECIMAL(15,2),
    "max_amount" DECIMAL(15,2),
    "fee_amount" DECIMAL(15,2),
    "fee_rate" DECIMAL(7,4),
    "waiver_condition" TEXT,
    "effective_from" VARCHAR(8) NOT NULL,
    "effective_to" VARCHAR(8),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_fee_pkey" PRIMARY KEY ("fee_id")
);

-- CreateTable
CREATE TABLE "deposit_detail" (
    "deposit_detail_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "interest_type" VARCHAR(10) NOT NULL,
    "rate_type" VARCHAR(10) NOT NULL,
    "transaction_type" VARCHAR(20) NOT NULL,
    "min_amount" DECIMAL(15,2),
    "max_amount" DECIMAL(15,2),
    "min_period_months" INTEGER,
    "max_period_months" INTEGER,
    "early_withdrawal_penalty_rate" DECIMAL(7,4),
    "prepayment_allowed" BOOLEAN NOT NULL DEFAULT false,
    "deferral_allowed" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_detail_pkey" PRIMARY KEY ("deposit_detail_id")
);

-- CreateTable
CREATE TABLE "loan_detail" (
    "loan_detail_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "base_rate_type" VARCHAR(20) NOT NULL,
    "interest_type" VARCHAR(10) NOT NULL,
    "max_ltv_ratio" DECIMAL(5,4),
    "max_dti_ratio" DECIMAL(5,4),
    "collateral_required" BOOLEAN NOT NULL DEFAULT false,
    "collateral_type" VARCHAR(30),
    "lien_available" BOOLEAN NOT NULL DEFAULT false,
    "min_loan_amount" DECIMAL(15,2),
    "max_loan_amount" DECIMAL(15,2),
    "max_loan_period_months" INTEGER,
    "repayment_method" VARCHAR(25) NOT NULL,
    "early_repayment_allowed" BOOLEAN NOT NULL DEFAULT false,
    "early_repayment_fee_rate" DECIMAL(7,4),
    "overdue_interest_rate" DECIMAL(7,4),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_detail_pkey" PRIMARY KEY ("loan_detail_id")
);

-- CreateTable
CREATE TABLE "contract" (
    "contract_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "party_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "contract_date" VARCHAR(8) NOT NULL,
    "execution_date" VARCHAR(8),
    "maturity_date" VARCHAR(8),
    "end_date" VARCHAR(8),
    "contract_period_months" SMALLINT,
    "contract_amount" DECIMAL(15,2),
    "stamp_duty" DECIMAL(15,2),
    "contract_status" VARCHAR(25) NOT NULL DEFAULT 'ACTIVE',
    "applied_rate" DECIMAL(7,4) NOT NULL,
    "branch_id" UUID,
    "employee_id" UUID,
    "employee_name" VARCHAR(100),
    "contract_document_url" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_pkey" PRIMARY KEY ("contract_id")
);

-- CreateTable
CREATE TABLE "contract_terms_agreement" (
    "contract_id" UUID NOT NULL,
    "terms_id" UUID NOT NULL,
    "agreed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agreement_method" VARCHAR(20) NOT NULL,
    "contract_method" VARCHAR(20),
    "ip_address" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_terms_agreement_pkey" PRIMARY KEY ("contract_id","terms_id")
);

-- CreateTable
CREATE TABLE "contract_rate_benefit" (
    "contract_id" UUID NOT NULL,
    "rate_benefit_id" UUID NOT NULL,
    "applied_rate" DECIMAL(7,4) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_rate_benefit_pkey" PRIMARY KEY ("contract_id","rate_benefit_id")
);

-- CreateTable
CREATE TABLE "account" (
    "account_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_number" VARCHAR(30) NOT NULL,
    "account_password_hash" VARCHAR(60) NOT NULL,
    "party_id" UUID NOT NULL,
    "contract_id" UUID,
    "account_type" VARCHAR(20) NOT NULL,
    "account_status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "credit_limit" DECIMAL(15,2),
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'KRW',
    "opened_date" VARCHAR(8) NOT NULL,
    "closed_date" VARCHAR(8),
    "last_transaction_at" TIMESTAMPTZ,
    "account_purpose" VARCHAR(20),
    "is_third_party_closure_allowed" BOOLEAN NOT NULL DEFAULT false,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "display_order" SMALLINT NOT NULL DEFAULT 0,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "password_fail_count" SMALLINT NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ,
    "transfer_limit_per_transaction" DECIMAL(15,2),
    "transfer_limit_per_day" DECIMAL(15,2),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "transfer_instruction" (
    "instruction_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "instruction_type" VARCHAR(30) NOT NULL,
    "transfer_scope" VARCHAR(10),
    "clearing_network" VARCHAR(20),
    "network_seq_no" VARCHAR(50),
    "network_response_code" VARCHAR(10),
    "bank_response_code" VARCHAR(10),
    "instruction_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "total_count" INTEGER,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2),
    "submitted_by" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "scheduled_at" TIMESTAMPTZ,
    "executed_at" TIMESTAMPTZ,
    "remark" VARCHAR(200),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_instruction_pkey" PRIMARY KEY ("instruction_id")
);

-- CreateTable
CREATE TABLE "kftc_receipt" (
    "receipt_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "direction" VARCHAR(10) NOT NULL DEFAULT 'OUTBOUND',
    "instruction_id" UUID,
    "transaction_id" UUID,
    "rsp_code" VARCHAR(10) NOT NULL,
    "rsp_message" VARCHAR(200),
    "bank_rsp_code" VARCHAR(10),
    "bank_rsp_message" VARCHAR(200),
    "fintech_use_num" VARCHAR(30),
    "bank_tran_id" VARCHAR(30),
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kftc_receipt_pkey" PRIMARY KEY ("receipt_id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "transaction_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "transaction_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "balance_before" DECIMAL(15,2) NOT NULL,
    "balance_after" DECIMAL(15,2) NOT NULL,
    "transaction_status" VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    "channel" VARCHAR(20),
    "counterpart_account_number" VARCHAR(30),
    "counterpart_bank_code" VARCHAR(10),
    "counterpart_name" VARCHAR(100),
    "counterparty_party_id" UUID,
    "counterparty_account_id" UUID,
    "bank_code" VARCHAR(10),
    "transferer" VARCHAR(20),
    "remitter" VARCHAR(20),
    "transaction_no" VARCHAR(30),
    "transaction_key" VARCHAR(50),
    "reference_no" VARCHAR(50),
    "instruction_id" UUID,
    "tax_amount" DECIMAL(15,2),
    "transfer_method" VARCHAR(20),
    "settlement_date" VARCHAR(8),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "rejected_reason" VARCHAR(200),
    "retry_count" SMALLINT NOT NULL DEFAULT 0,
    "risk_score" DECIMAL(5,2),
    "risk_flag" BOOLEAN NOT NULL DEFAULT false,
    "ip_address" TEXT,
    "device_fingerprint" VARCHAR(100),
    "remark" VARCHAR(200),
    "memo" TEXT,
    "transaction_date" VARCHAR(8) NOT NULL,
    "transacted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "savings_payment" (
    "savings_payment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contract_id" UUID,
    "account_id" UUID NOT NULL,
    "installment_no" SMALLINT NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "scheduled_amount" DECIMAL(15,2) NOT NULL,
    "paid_date" VARCHAR(8),
    "paid_amount" DECIMAL(15,2),
    "transaction_id" UUID,
    "savings_payment_status" VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_payment_pkey" PRIMARY KEY ("savings_payment_id")
);

-- CreateTable
CREATE TABLE "document" (
    "document_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "original_name" VARCHAR(255) NOT NULL,
    "stored_name" VARCHAR(255),
    "file_url" TEXT NOT NULL,
    "file_size" BIGINT,
    "mime_type" VARCHAR(100),
    "upload_status" VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    "uploaded_by" UUID,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entity_type" VARCHAR(30) NOT NULL,
    "entity_id" UUID NOT NULL,
    "document_type" VARCHAR(50) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ,
    "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitter_party_id" UUID,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "loan_application" (
    "application_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "party_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "requested_amount" DECIMAL(15,2) NOT NULL,
    "requested_period_months" INTEGER,
    "loan_purpose" VARCHAR(100),
    "applicant_verified" BOOLEAN NOT NULL DEFAULT false,
    "agent_authorization" BOOLEAN DEFAULT false,
    "agent_id" UUID,
    "credit_check_delegated" BOOLEAN NOT NULL DEFAULT false,
    "application_status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "approved_amount" DECIMAL(15,2),
    "approved_rate" DECIMAL(7,4),
    "rejection_reason" VARCHAR(500),
    "credit_review_result" TEXT,
    "fund_necessity_review" TEXT,
    "collateral_review" TEXT,
    "profitability_review" TEXT,
    "credit_grade" VARCHAR(10),
    "approval_authority_id" UUID,
    "approved_at" TIMESTAMPTZ,
    "contract_id" UUID,
    "channel" VARCHAR(20),
    "branch_id" UUID,
    "employee_id" UUID,
    "consultation_date" VARCHAR(8),
    "consultation_memo" TEXT,
    "submitted_at" TIMESTAMPTZ,
    "decided_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_application_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "loan_approval_step" (
    "step_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "step_no" SMALLINT NOT NULL,
    "employee_id" UUID NOT NULL,
    "step_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decided_at" TIMESTAMPTZ,
    "authority_level" INTEGER,
    "authority_name" VARCHAR(100),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_approval_step_pkey" PRIMARY KEY ("step_id")
);

-- CreateTable
CREATE TABLE "loan_collateral" (
    "collateral_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "collateral_type" VARCHAR(30) NOT NULL,
    "property_address" VARCHAR(300),
    "property_reg_no" VARCHAR(30),
    "appraised_value" DECIMAL(15,2),
    "appraised_at" VARCHAR(8),
    "appraiser" VARCHAR(100),
    "self_appraised" BOOLEAN NOT NULL DEFAULT false,
    "appraisal_requested_at" TIMESTAMPTZ,
    "appraisal_completed_at" TIMESTAMPTZ,
    "lien_amount" DECIMAL(15,2),
    "lien_registered_at" VARCHAR(8),
    "lien_reg_no" VARCHAR(50),
    "lien_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_collateral_pkey" PRIMARY KEY ("collateral_id")
);

-- CreateTable
CREATE TABLE "loan_delinquency" (
    "delinquency_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contract_id" UUID NOT NULL,
    "delinquency_status" VARCHAR(20) NOT NULL,
    "overdue_principal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "overdue_interest" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "overdue_days" INTEGER NOT NULL,
    "started_at" DATE NOT NULL,
    "recovered_at" VARCHAR(8),
    "fund_misuse_flag" BOOLEAN NOT NULL DEFAULT false,
    "fund_misuse_detail" TEXT,
    "collection_method" VARCHAR(20),
    "extension_history" JSONB,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_delinquency_pkey" PRIMARY KEY ("delinquency_id")
);

-- CreateTable
CREATE TABLE "notification" (
    "notification_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "party_id" UUID NOT NULL,
    "notification_type" VARCHAR(50) NOT NULL,
    "notification_title" VARCHAR(200) NOT NULL,
    "notification_body" VARCHAR(500) NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "linked_entity_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "scheduled_transfer" (
    "scheduled_transfer_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "party_id" UUID NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_bank_code" VARCHAR(10) NOT NULL,
    "to_account_number" VARCHAR(30) NOT NULL,
    "to_account_name" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "memo" VARCHAR(200),
    "transfer_day" SMALLINT NOT NULL,
    "start_date" VARCHAR(8) NOT NULL,
    "end_date" VARCHAR(8),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "last_executed_date" VARCHAR(8),
    "next_execution_date" VARCHAR(8),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_transfer_pkey" PRIMARY KEY ("scheduled_transfer_id")
);

-- CreateTable
CREATE TABLE "scheduled_transfer_execution" (
    "execution_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scheduled_transfer_id" UUID NOT NULL,
    "transaction_id" UUID,
    "execution_date" VARCHAR(8) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "failure_reason" VARCHAR(200),
    "executed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_transfer_execution_pkey" PRIMARY KEY ("execution_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_common_code" ON "common_code"("group_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "party_party_no_key" ON "party"("party_no");

-- CreateIndex
CREATE UNIQUE INDEX "individual_party_id_key" ON "individual"("party_id");

-- CreateIndex
CREATE INDEX "idx_individual_ci" ON "individual"("indivisual_ci");

-- CreateIndex
CREATE INDEX "idx_individual_corp" ON "individual"("corp_id");

-- CreateIndex
CREATE UNIQUE INDEX "corporate_party_id_key" ON "corporate"("party_id");

-- CreateIndex
CREATE UNIQUE INDEX "party_auth_party_id_key" ON "party_auth"("party_id");

-- CreateIndex
CREATE UNIQUE INDEX "party_auth_login_id_key" ON "party_auth"("login_id");

-- CreateIndex
CREATE INDEX "idx_party_auth_login_id" ON "party_auth"("login_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_branch_code_key" ON "branch"("branch_code");

-- CreateIndex
CREATE INDEX "idx_branch_status" ON "branch"("branch_status");

-- CreateIndex
CREATE INDEX "idx_branch_type" ON "branch"("branch_type");

-- CreateIndex
CREATE UNIQUE INDEX "employee_party_id_key" ON "employee"("party_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_employee_no_key" ON "employee"("employee_no");

-- CreateIndex
CREATE INDEX "idx_employee_branch" ON "employee"("branch_id");

-- CreateIndex
CREATE INDEX "idx_employee_no" ON "employee"("employee_no");

-- CreateIndex
CREATE INDEX "idx_product_type" ON "product"("product_type_code");

-- CreateIndex
CREATE INDEX "idx_product_status" ON "product"("product_status");

-- CreateIndex
CREATE UNIQUE INDEX "product_terms_product_id_terms_type_version_key" ON "product_terms"("product_id", "terms_type", "version");

-- CreateIndex
CREATE INDEX "idx_product_rate_product" ON "product_rate"("product_id");

-- CreateIndex
CREATE INDEX "idx_product_rate_tier_product" ON "product_rate_tier"("product_id");

-- CreateIndex
CREATE INDEX "idx_product_rate_benefit_product" ON "product_rate_benefit"("product_id");

-- CreateIndex
CREATE INDEX "idx_product_fee_product" ON "product_fee"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_detail_product_id_key" ON "deposit_detail"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_detail_product_id_key" ON "loan_detail"("product_id");

-- CreateIndex
CREATE INDEX "idx_contract_party" ON "contract"("party_id");

-- CreateIndex
CREATE INDEX "idx_contract_product" ON "contract"("product_id");

-- CreateIndex
CREATE INDEX "idx_contract_status" ON "contract"("contract_status");

-- CreateIndex
CREATE INDEX "idx_contract_branch_id" ON "contract"("branch_id");

-- CreateIndex
CREATE INDEX "idx_cta_contract" ON "contract_terms_agreement"("contract_id");

-- CreateIndex
CREATE INDEX "idx_crb_contract" ON "contract_rate_benefit"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_account_number_key" ON "account"("account_number");

-- CreateIndex
CREATE INDEX "idx_account_party_id" ON "account"("party_id");

-- CreateIndex
CREATE INDEX "idx_account_contract_id" ON "account"("contract_id");

-- CreateIndex
CREATE INDEX "idx_account_status" ON "account"("account_status");

-- CreateIndex
CREATE INDEX "idx_transfer_instruction_type" ON "transfer_instruction"("instruction_type");

-- CreateIndex
CREATE INDEX "idx_transfer_instruction_status" ON "transfer_instruction"("instruction_status");

-- CreateIndex
CREATE INDEX "idx_transfer_instruction_network" ON "transfer_instruction"("clearing_network");

-- CreateIndex
CREATE UNIQUE INDEX "kftc_receipt_transaction_id_key" ON "kftc_receipt"("transaction_id");

-- CreateIndex
CREATE INDEX "idx_kftc_receipt_instruction" ON "kftc_receipt"("instruction_id");

-- CreateIndex
CREATE INDEX "idx_kftc_receipt_transaction" ON "kftc_receipt"("transaction_id");

-- CreateIndex
CREATE INDEX "idx_kftc_receipt_bank_tran" ON "kftc_receipt"("bank_tran_id");

-- CreateIndex
CREATE INDEX "idx_kftc_receipt_direction" ON "kftc_receipt"("direction");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_transaction_no_key" ON "transaction"("transaction_no");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_transaction_key_key" ON "transaction"("transaction_key");

-- CreateIndex
CREATE INDEX "idx_transaction_account_id" ON "transaction"("account_id");

-- CreateIndex
CREATE INDEX "idx_transaction_transacted_at" ON "transaction"("transacted_at" DESC);

-- CreateIndex
CREATE INDEX "idx_transaction_type" ON "transaction"("transaction_type");

-- CreateIndex
CREATE INDEX "idx_transaction_reference_no" ON "transaction"("reference_no");

-- CreateIndex
CREATE INDEX "idx_transaction_instruction_id" ON "transaction"("instruction_id");

-- CreateIndex
CREATE INDEX "idx_transaction_risk_flag" ON "transaction"("risk_flag");

-- CreateIndex
CREATE INDEX "idx_transaction_settlement" ON "transaction"("settlement_date");

-- CreateIndex
CREATE INDEX "idx_savings_payment_contract" ON "savings_payment"("contract_id");

-- CreateIndex
CREATE INDEX "idx_savings_payment_account" ON "savings_payment"("account_id");

-- CreateIndex
CREATE INDEX "idx_savings_payment_status" ON "savings_payment"("savings_payment_status");

-- CreateIndex
CREATE UNIQUE INDEX "savings_payment_account_id_installment_no_key" ON "savings_payment"("account_id", "installment_no");

-- CreateIndex
CREATE INDEX "idx_document_entity" ON "document"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_document_uploaded_by" ON "document"("uploaded_by");

-- CreateIndex
CREATE INDEX "idx_document_submitter" ON "document"("submitter_party_id");

-- CreateIndex
CREATE INDEX "idx_loan_application_party" ON "loan_application"("party_id");

-- CreateIndex
CREATE INDEX "idx_loan_application_product" ON "loan_application"("product_id");

-- CreateIndex
CREATE INDEX "idx_loan_application_status" ON "loan_application"("application_status");

-- CreateIndex
CREATE INDEX "idx_loan_approval_step_application" ON "loan_approval_step"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_loan_approval_step" ON "loan_approval_step"("application_id", "step_no");

-- CreateIndex
CREATE INDEX "idx_loan_collateral_application" ON "loan_collateral"("application_id");

-- CreateIndex
CREATE INDEX "idx_loan_delinquency_contract" ON "loan_delinquency"("contract_id");

-- CreateIndex
CREATE INDEX "idx_loan_delinquency_status" ON "loan_delinquency"("delinquency_status");

-- CreateIndex
CREATE INDEX "idx_notification_party_read" ON "notification"("party_id", "is_read");

-- CreateIndex
CREATE INDEX "idx_notification_created_at" ON "notification"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_scheduled_transfer_party" ON "scheduled_transfer"("party_id");

-- CreateIndex
CREATE INDEX "idx_scheduled_transfer_active" ON "scheduled_transfer"("status", "next_execution_date");

-- CreateIndex
CREATE INDEX "idx_ste_scheduled" ON "scheduled_transfer_execution"("scheduled_transfer_id");

-- AddForeignKey
ALTER TABLE "common_code" ADD CONSTRAINT "common_code_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "common_code_group"("group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "individual" ADD CONSTRAINT "individual_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("party_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "individual" ADD CONSTRAINT "individual_corp_id_fkey" FOREIGN KEY ("corp_id") REFERENCES "corporate"("corporate_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate" ADD CONSTRAINT "corporate_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("party_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_auth" ADD CONSTRAINT "party_auth_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("party_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("party_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_terms" ADD CONSTRAINT "product_terms_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_terms" ADD CONSTRAINT "product_terms_responsible_employee_id_fkey" FOREIGN KEY ("responsible_employee_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_rate" ADD CONSTRAINT "product_rate_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_rate_tier" ADD CONSTRAINT "product_rate_tier_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_rate_benefit" ADD CONSTRAINT "product_rate_benefit_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_fee" ADD CONSTRAINT "product_fee_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_detail" ADD CONSTRAINT "deposit_detail_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_detail" ADD CONSTRAINT "loan_detail_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("party_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("branch_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_terms_agreement" ADD CONSTRAINT "contract_terms_agreement_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_terms_agreement" ADD CONSTRAINT "contract_terms_agreement_terms_id_fkey" FOREIGN KEY ("terms_id") REFERENCES "product_terms"("terms_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_rate_benefit" ADD CONSTRAINT "contract_rate_benefit_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_rate_benefit" ADD CONSTRAINT "contract_rate_benefit_rate_benefit_id_fkey" FOREIGN KEY ("rate_benefit_id") REFERENCES "product_rate_benefit"("rate_benefit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("party_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_instruction" ADD CONSTRAINT "transfer_instruction_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "party"("party_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_instruction" ADD CONSTRAINT "transfer_instruction_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "party"("party_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kftc_receipt" ADD CONSTRAINT "kftc_receipt_instruction_id_fkey" FOREIGN KEY ("instruction_id") REFERENCES "transfer_instruction"("instruction_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kftc_receipt" ADD CONSTRAINT "kftc_receipt_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("transaction_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_counterparty_party_id_fkey" FOREIGN KEY ("counterparty_party_id") REFERENCES "party"("party_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_counterparty_account_id_fkey" FOREIGN KEY ("counterparty_account_id") REFERENCES "account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_instruction_id_fkey" FOREIGN KEY ("instruction_id") REFERENCES "transfer_instruction"("instruction_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_payment" ADD CONSTRAINT "savings_payment_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_payment" ADD CONSTRAINT "savings_payment_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_payment" ADD CONSTRAINT "savings_payment_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("transaction_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "party"("party_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_submitter_party_id_fkey" FOREIGN KEY ("submitter_party_id") REFERENCES "party"("party_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_application" ADD CONSTRAINT "loan_application_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("party_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_application" ADD CONSTRAINT "loan_application_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_application" ADD CONSTRAINT "loan_application_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_application" ADD CONSTRAINT "loan_application_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("branch_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_application" ADD CONSTRAINT "loan_application_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_application" ADD CONSTRAINT "loan_application_approval_authority_id_fkey" FOREIGN KEY ("approval_authority_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_approval_step" ADD CONSTRAINT "loan_approval_step_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_application"("application_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_approval_step" ADD CONSTRAINT "loan_approval_step_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_collateral" ADD CONSTRAINT "loan_collateral_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_application"("application_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_delinquency" ADD CONSTRAINT "loan_delinquency_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("party_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_transfer" ADD CONSTRAINT "scheduled_transfer_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("party_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_transfer" ADD CONSTRAINT "scheduled_transfer_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_transfer_execution" ADD CONSTRAINT "scheduled_transfer_execution_scheduled_transfer_id_fkey" FOREIGN KEY ("scheduled_transfer_id") REFERENCES "scheduled_transfer"("scheduled_transfer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
