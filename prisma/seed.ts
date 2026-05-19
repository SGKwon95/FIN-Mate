import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ADMIN_UUID = "00000000-0000-0000-0000-000000000001";

async function main() {
  console.log("🌱 DB 시딩 시작...");

  // ── 기존 데이터 초기화 (역참조 순서) ──────────────────
  await prisma.transaction.deleteMany();
  await prisma.account.deleteMany();
  await prisma.partyAuth.deleteMany();
  await prisma.individual.deleteMany();
  await prisma.product.deleteMany();
  await prisma.commonCode.deleteMany();
  await prisma.commonCodeGroup.deleteMany();
  await prisma.party.deleteMany();

  // ── 1. 공통 코드 ──────────────────────────────────────
  await prisma.commonCodeGroup.createMany({
    data: [
      {
        groupId: "USER_ROLE",
        groupName: "사용자 권한",
        description: "앱 회원 권한 (INDIVIDUAL/VIP/ADMIN)",
      },
      {
        groupId: "PARTY_ROLE",
        groupName: "고객 유형",
        description: "party.party_role (INDIVIDUAL/CORPORATE)",
      },
      {
        groupId: "PARTY_STATUS",
        groupName: "고객 상태",
        description: "party/individual 활성 상태",
      },
      {
        groupId: "EMPLOYMENT_TYPE",
        groupName: "고용 형태",
        description: "individual.employment_type",
      },
      {
        groupId: "CORP_ROLE",
        groupName: "기업 사용자 권한",
        description: "corporate_user.corp_role",
      },
      {
        groupId: "CORP_STATUS",
        groupName: "기업 사용자 상태",
        description: "corporate_user.corp_status",
      },
      {
        groupId: "COMPANY_TYPE",
        groupName: "법인 유형",
        description: "corporate.company_type",
      },
      {
        groupId: "PARTY_AUTH_STATUS",
        groupName: "인증 상태",
        description: "party_auth.party_auth_status",
      },
      {
        groupId: "PROD_TYPE",
        groupName: "상품 유형",
        description: "product.product_type_code",
      },
      {
        groupId: "PRODUCT_STATUS",
        groupName: "상품 상태",
        description: "product.product_status",
      },
      {
        groupId: "PERIOD_TYPE",
        groupName: "기간 유형",
        description: "product.period_type",
      },
      {
        groupId: "SALES_TARGET",
        groupName: "판매 대상",
        description: "product.sales_target",
      },
      {
        groupId: "TERMS_TYPE",
        groupName: "약관 유형",
        description: "product_terms.terms_type",
      },
      {
        groupId: "PROD_RATE_TYPE",
        groupName: "상품 금리 구성",
        description: "product_rate.rate_type (BASE/SPREAD)",
      },
      {
        groupId: "RATE_STRUCTURE",
        groupName: "금리 구조",
        description: "deposit_product.rate_structure",
      },
      {
        groupId: "TIER_TYPE",
        groupName: "구간 유형",
        description: "product_rate_tier.tier_type",
      },
      {
        groupId: "FEE_TYPE",
        groupName: "수수료 유형",
        description: "product_fee.fee_type",
      },
      {
        groupId: "CHANNEL",
        groupName: "거래 채널",
        description: "수수료/거래/대출신청 채널 통합",
      },
      {
        groupId: "INTEREST_TYPE",
        groupName: "이자 계산 방식",
        description: "deposit/loan_product.interest_type",
      },
      {
        groupId: "DEPOSIT_TX_TYPE",
        groupName: "예금 거래 유형",
        description: "deposit_product.transaction_type",
      },
      {
        groupId: "BASE_RATE_TYPE",
        groupName: "기준금리 지표",
        description: "loan_product.base_rate_type",
      },
      {
        groupId: "LOAN_RATE_TYPE",
        groupName: "대출 금리 유형",
        description: "loan_product.rate_type (FIXED/VARIABLE)",
      },
      {
        groupId: "COLLATERAL_TYPE",
        groupName: "담보 유형",
        description: "loan_product/loan_collateral.collateral_type",
      },
      {
        groupId: "REPAYMENT_METHOD",
        groupName: "상환 방식",
        description: "loan_product.repayment_method",
      },
      {
        groupId: "CONTRACT_STATUS",
        groupName: "계약 상태",
        description: "contract.contract_status",
      },
      {
        groupId: "AGREEMENT_METHOD",
        groupName: "약관 동의 방식",
        description: "contract.agreement_method",
      },
      {
        groupId: "CONTRACT_METHOD",
        groupName: "계약 방식",
        description: "contract.contract_method",
      },
      {
        groupId: "ACCOUNT_TYPE",
        groupName: "계좌 유형",
        description: "account.account_type",
      },
      {
        groupId: "ACCOUNT_STATUS",
        groupName: "계좌 상태",
        description: "account.account_status",
      },
      {
        groupId: "ACCOUNT_PURPOSE",
        groupName: "계좌 목적",
        description: "account.account_purpose",
      },
      {
        groupId: "INSTRUCTION_TYPE",
        groupName: "이체 지시 유형",
        description: "transfer_instruction.instruction_type",
      },
      {
        groupId: "TRANSFER_SCOPE",
        groupName: "이체 범위",
        description: "transfer_instruction.transfer_scope",
      },
      {
        groupId: "CLEARING_NETWORK",
        groupName: "결제망",
        description: "transfer_instruction.clearing_network",
      },
      {
        groupId: "INSTRUCTION_STATUS",
        groupName: "이체 지시 상태",
        description: "transfer_instruction.instruction_status",
      },
      {
        groupId: "TX_TYPE",
        groupName: "거래 유형",
        description: "transaction.transaction_type",
      },
      {
        groupId: "TX_STATUS",
        groupName: "거래 상태",
        description: "transaction.transaction_status",
      },
      {
        groupId: "TRANSFER_METHOD",
        groupName: "이체 방식",
        description: "transaction.transfer_method",
      },
      {
        groupId: "SAVINGS_PAYMENT_STATUS",
        groupName: "적금 납입 상태",
        description: "savings_payment_schedule.savings_payment_status",
      },
      {
        groupId: "BRANCH_TYPE",
        groupName: "영업점 유형",
        description: "branch.branch_type",
      },
      {
        groupId: "BRANCH_STATUS",
        groupName: "영업점 상태",
        description: "branch.branch_status",
      },
      {
        groupId: "EMPLOYEE_STATUS",
        groupName: "직원 상태",
        description: "employee.employee_status",
      },
      {
        groupId: "UPLOAD_STATUS",
        groupName: "업로드 상태",
        description: "document.upload_status",
      },
      {
        groupId: "ENTITY_TYPE",
        groupName: "문서 연결 엔티티",
        description: "document.entity_type",
      },
      {
        groupId: "DOCUMENT_TYPE",
        groupName: "서류 유형",
        description: "document.document_type",
      },
      {
        groupId: "APPLICATION_STATUS",
        groupName: "대출신청 상태",
        description: "loan_application.application_status",
      },
      {
        groupId: "APPROVAL_STEP_STATUS",
        groupName: "승인 단계 상태",
        description: "loan_approval_step.step_status",
      },
      {
        groupId: "DELINQUENCY_STATUS",
        groupName: "연체 상태",
        description: "loan_delinquency.delinquency_status",
      },
      {
        groupId: "BANK_CODE",
        groupName: "은행 코드",
        description: "금융기관 목록",
      },
    ],
  });

  await prisma.commonCode.createMany({
    data: [
      // USER_ROLE
      {
        groupId: "USER_ROLE",
        code: "INDIVIDUAL",
        codeName: "일반회원",
        sortOrder: 1,
      },
      { groupId: "USER_ROLE", code: "VIP", codeName: "VIP회원", sortOrder: 2 },
      { groupId: "USER_ROLE", code: "ADMIN", codeName: "관리자", sortOrder: 3 },

      // PARTY_ROLE
      {
        groupId: "PARTY_ROLE",
        code: "INDIVIDUAL",
        codeName: "개인",
        sortOrder: 1,
      },
      {
        groupId: "PARTY_ROLE",
        code: "CORPORATE",
        codeName: "법인",
        sortOrder: 2,
      },

      // PARTY_STATUS
      {
        groupId: "PARTY_STATUS",
        code: "ACTIVE",
        codeName: "정상",
        sortOrder: 1,
      },
      {
        groupId: "PARTY_STATUS",
        code: "SUSPENDED",
        codeName: "정지",
        sortOrder: 2,
      },
      {
        groupId: "PARTY_STATUS",
        code: "DORMANT",
        codeName: "휴면",
        sortOrder: 3,
      },
      {
        groupId: "PARTY_STATUS",
        code: "WITHDRAWN",
        codeName: "탈퇴",
        sortOrder: 4,
      },

      // EMPLOYMENT_TYPE
      {
        groupId: "EMPLOYMENT_TYPE",
        code: "EMPLOYED",
        codeName: "재직자",
        sortOrder: 1,
      },
      {
        groupId: "EMPLOYMENT_TYPE",
        code: "SELF_EMPLOYED",
        codeName: "자영업자",
        sortOrder: 2,
      },
      {
        groupId: "EMPLOYMENT_TYPE",
        code: "CONTRACT",
        codeName: "계약직",
        sortOrder: 3,
      },
      {
        groupId: "EMPLOYMENT_TYPE",
        code: "UNEMPLOYED",
        codeName: "무직",
        sortOrder: 4,
      },
      {
        groupId: "EMPLOYMENT_TYPE",
        code: "RETIRED",
        codeName: "은퇴",
        sortOrder: 5,
      },

      // CORP_ROLE
      { groupId: "CORP_ROLE", code: "VIEWER", codeName: "조회", sortOrder: 1 },
      {
        groupId: "CORP_ROLE",
        code: "TRANSFER_REQUESTER",
        codeName: "이체신청",
        sortOrder: 2,
      },
      {
        groupId: "CORP_ROLE",
        code: "APPROVER",
        codeName: "승인자",
        sortOrder: 3,
      },
      { groupId: "CORP_ROLE", code: "ADMIN", codeName: "관리자", sortOrder: 4 },

      // CORP_STATUS
      {
        groupId: "CORP_STATUS",
        code: "ACTIVE",
        codeName: "정상",
        sortOrder: 1,
      },
      {
        groupId: "CORP_STATUS",
        code: "LOCKED",
        codeName: "잠금",
        sortOrder: 2,
      },
      {
        groupId: "CORP_STATUS",
        code: "DISABLED",
        codeName: "비활성",
        sortOrder: 3,
      },

      // COMPANY_TYPE
      {
        groupId: "COMPANY_TYPE",
        code: "STOCK",
        codeName: "주식회사",
        sortOrder: 1,
      },
      {
        groupId: "COMPANY_TYPE",
        code: "LIMITED",
        codeName: "유한회사",
        sortOrder: 2,
      },
      {
        groupId: "COMPANY_TYPE",
        code: "COOPERATIVE",
        codeName: "협동조합",
        sortOrder: 3,
      },
      {
        groupId: "COMPANY_TYPE",
        code: "PUBLIC",
        codeName: "공공기관",
        sortOrder: 4,
      },
      {
        groupId: "COMPANY_TYPE",
        code: "OTHER",
        codeName: "기타",
        sortOrder: 5,
      },

      // PARTY_AUTH_STATUS
      {
        groupId: "PARTY_AUTH_STATUS",
        code: "ACTIVE",
        codeName: "정상",
        sortOrder: 1,
      },
      {
        groupId: "PARTY_AUTH_STATUS",
        code: "LOCKED",
        codeName: "잠금",
        sortOrder: 2,
      },
      {
        groupId: "PARTY_AUTH_STATUS",
        code: "DISABLED",
        codeName: "비활성",
        sortOrder: 3,
      },

      // PROD_TYPE
      {
        groupId: "PROD_TYPE",
        code: "DEPOSIT",
        codeName: "예금성 상품",
        sortOrder: 1,
      },
      {
        groupId: "PROD_TYPE",
        code: "LOAN",
        codeName: "대출성 상품",
        sortOrder: 2,
      },

      // PRODUCT_STATUS
      {
        groupId: "PRODUCT_STATUS",
        code: "ACTIVE",
        codeName: "판매중",
        sortOrder: 1,
      },
      {
        groupId: "PRODUCT_STATUS",
        code: "INACTIVE",
        codeName: "판매중지",
        sortOrder: 2,
      },
      {
        groupId: "PRODUCT_STATUS",
        code: "SUSPENDED",
        codeName: "일시중단",
        sortOrder: 3,
      },

      // PERIOD_TYPE
      {
        groupId: "PERIOD_TYPE",
        code: "UNLIMITED",
        codeName: "무제한",
        sortOrder: 1,
      },
      { groupId: "PERIOD_TYPE", code: "FIXED", codeName: "고정", sortOrder: 2 },
      {
        groupId: "PERIOD_TYPE",
        code: "FLEXIBLE",
        codeName: "자유",
        sortOrder: 3,
      },

      // SALES_TARGET
      { groupId: "SALES_TARGET", code: "ALL", codeName: "전체", sortOrder: 1 },
      {
        groupId: "SALES_TARGET",
        code: "INDIVIDUAL",
        codeName: "개인",
        sortOrder: 2,
      },
      {
        groupId: "SALES_TARGET",
        code: "CORPORATE",
        codeName: "법인",
        sortOrder: 3,
      },

      // TERMS_TYPE
      {
        groupId: "TERMS_TYPE",
        code: "BASIC",
        codeName: "기본약관",
        sortOrder: 1,
      },
      {
        groupId: "TERMS_TYPE",
        code: "TYPE_SPECIFIC",
        codeName: "상품별약관",
        sortOrder: 2,
      },

      // PROD_RATE_TYPE
      {
        groupId: "PROD_RATE_TYPE",
        code: "BASE",
        codeName: "기준금리",
        sortOrder: 1,
      },
      {
        groupId: "PROD_RATE_TYPE",
        code: "SPREAD",
        codeName: "가산금리",
        sortOrder: 2,
      },

      // RATE_STRUCTURE
      {
        groupId: "RATE_STRUCTURE",
        code: "FIXED",
        codeName: "고정",
        sortOrder: 1,
      },
      {
        groupId: "RATE_STRUCTURE",
        code: "VARIABLE",
        codeName: "변동",
        sortOrder: 2,
      },
      {
        groupId: "RATE_STRUCTURE",
        code: "CONFIRMED",
        codeName: "확정",
        sortOrder: 3,
      },

      // TIER_TYPE
      { groupId: "TIER_TYPE", code: "AMOUNT", codeName: "금액", sortOrder: 1 },
      { groupId: "TIER_TYPE", code: "PERIOD", codeName: "기간", sortOrder: 2 },

      // FEE_TYPE
      {
        groupId: "FEE_TYPE",
        code: "TRANSFER",
        codeName: "이체수수료",
        sortOrder: 1,
      },
      {
        groupId: "FEE_TYPE",
        code: "WITHDRAWAL",
        codeName: "출금수수료",
        sortOrder: 2,
      },
      {
        groupId: "FEE_TYPE",
        code: "DEPOSIT",
        codeName: "입금수수료",
        sortOrder: 3,
      },
      {
        groupId: "FEE_TYPE",
        code: "EARLY_REPAYMENT",
        codeName: "중도상환수수료",
        sortOrder: 4,
      },
      { groupId: "FEE_TYPE", code: "OTHER", codeName: "기타", sortOrder: 5 },

      // CHANNEL
      { groupId: "CHANNEL", code: "ALL", codeName: "전체", sortOrder: 1 },
      { groupId: "CHANNEL", code: "APP", codeName: "앱", sortOrder: 2 },
      { groupId: "CHANNEL", code: "ATM", codeName: "ATM", sortOrder: 3 },
      { groupId: "CHANNEL", code: "TELLER", codeName: "창구", sortOrder: 4 },
      {
        groupId: "CHANNEL",
        code: "INTERNET",
        codeName: "인터넷뱅킹",
        sortOrder: 5,
      },
      { groupId: "CHANNEL", code: "AUTO", codeName: "자동", sortOrder: 6 },
      { groupId: "CHANNEL", code: "SCHEDULED", codeName: "예약", sortOrder: 7 },
      { groupId: "CHANNEL", code: "BRANCH", codeName: "영업점", sortOrder: 8 },
      { groupId: "CHANNEL", code: "PHONE", codeName: "전화", sortOrder: 9 },

      // INTEREST_TYPE
      {
        groupId: "INTEREST_TYPE",
        code: "SIMPLE",
        codeName: "단리",
        sortOrder: 1,
      },
      {
        groupId: "INTEREST_TYPE",
        code: "COMPOUND",
        codeName: "복리",
        sortOrder: 2,
      },

      // DEPOSIT_TX_TYPE
      {
        groupId: "DEPOSIT_TX_TYPE",
        code: "TIME_DEPOSIT",
        codeName: "정기예금",
        sortOrder: 1,
      },
      {
        groupId: "DEPOSIT_TX_TYPE",
        code: "SAVINGS",
        codeName: "적금",
        sortOrder: 2,
      },
      {
        groupId: "DEPOSIT_TX_TYPE",
        code: "DEMAND",
        codeName: "요구불예금",
        sortOrder: 3,
      },

      // BASE_RATE_TYPE
      {
        groupId: "BASE_RATE_TYPE",
        code: "COFIX",
        codeName: "COFIX",
        sortOrder: 1,
      },
      {
        groupId: "BASE_RATE_TYPE",
        code: "CD91",
        codeName: "CD91일물",
        sortOrder: 2,
      },
      {
        groupId: "BASE_RATE_TYPE",
        code: "BASE_RATE",
        codeName: "기준금리",
        sortOrder: 3,
      },
      {
        groupId: "BASE_RATE_TYPE",
        code: "PRIME",
        codeName: "프라임레이트",
        sortOrder: 4,
      },

      // LOAN_RATE_TYPE
      {
        groupId: "LOAN_RATE_TYPE",
        code: "FIXED",
        codeName: "고정금리",
        sortOrder: 1,
      },
      {
        groupId: "LOAN_RATE_TYPE",
        code: "VARIABLE",
        codeName: "변동금리",
        sortOrder: 2,
      },

      // COLLATERAL_TYPE
      {
        groupId: "COLLATERAL_TYPE",
        code: "REAL_ESTATE",
        codeName: "부동산",
        sortOrder: 1,
      },
      {
        groupId: "COLLATERAL_TYPE",
        code: "DEPOSIT",
        codeName: "예금",
        sortOrder: 2,
      },
      {
        groupId: "COLLATERAL_TYPE",
        code: "SECURITIES",
        codeName: "유가증권",
        sortOrder: 3,
      },
      {
        groupId: "COLLATERAL_TYPE",
        code: "VEHICLE",
        codeName: "차량",
        sortOrder: 4,
      },
      {
        groupId: "COLLATERAL_TYPE",
        code: "NONE",
        codeName: "무담보",
        sortOrder: 5,
      },
      {
        groupId: "COLLATERAL_TYPE",
        code: "OTHER",
        codeName: "기타",
        sortOrder: 6,
      },

      // REPAYMENT_METHOD
      {
        groupId: "REPAYMENT_METHOD",
        code: "BULLET",
        codeName: "만기일시상환",
        sortOrder: 1,
      },
      {
        groupId: "REPAYMENT_METHOD",
        code: "EQUAL_PRINCIPAL",
        codeName: "원금균등상환",
        sortOrder: 2,
      },
      {
        groupId: "REPAYMENT_METHOD",
        code: "EQUAL_INSTALLMENT",
        codeName: "원리금균등상환",
        sortOrder: 3,
      },
      {
        groupId: "REPAYMENT_METHOD",
        code: "FLEXIBLE",
        codeName: "자유상환",
        sortOrder: 4,
      },

      // CONTRACT_STATUS
      {
        groupId: "CONTRACT_STATUS",
        code: "ACTIVE",
        codeName: "정상",
        sortOrder: 1,
      },
      {
        groupId: "CONTRACT_STATUS",
        code: "CLOSED",
        codeName: "해지",
        sortOrder: 2,
      },
      {
        groupId: "CONTRACT_STATUS",
        code: "WITHDRAWN",
        codeName: "취소",
        sortOrder: 3,
      },
      {
        groupId: "CONTRACT_STATUS",
        code: "ILLEGALLY_TERMINATED",
        codeName: "불법해지",
        sortOrder: 4,
      },

      // AGREEMENT_METHOD
      {
        groupId: "AGREEMENT_METHOD",
        code: "APP",
        codeName: "앱",
        sortOrder: 1,
      },
      {
        groupId: "AGREEMENT_METHOD",
        code: "PAPER",
        codeName: "서면",
        sortOrder: 2,
      },
      {
        groupId: "AGREEMENT_METHOD",
        code: "KIOSK",
        codeName: "키오스크",
        sortOrder: 3,
      },

      // CONTRACT_METHOD
      {
        groupId: "CONTRACT_METHOD",
        code: "REMOTE",
        codeName: "비대면",
        sortOrder: 1,
      },
      {
        groupId: "CONTRACT_METHOD",
        code: "IN_PERSON",
        codeName: "대면",
        sortOrder: 2,
      },
      {
        groupId: "CONTRACT_METHOD",
        code: "HYBRID",
        codeName: "혼합",
        sortOrder: 3,
      },

      // ACCOUNT_TYPE
      {
        groupId: "ACCOUNT_TYPE",
        code: "DEPOSIT",
        codeName: "예금",
        sortOrder: 1,
      },
      { groupId: "ACCOUNT_TYPE", code: "LOAN", codeName: "대출", sortOrder: 2 },
      {
        groupId: "ACCOUNT_TYPE",
        code: "OVERDRAFT",
        codeName: "마이너스통장",
        sortOrder: 3,
      },

      // ACCOUNT_STATUS
      {
        groupId: "ACCOUNT_STATUS",
        code: "ACTIVE",
        codeName: "정상",
        sortOrder: 1,
      },
      {
        groupId: "ACCOUNT_STATUS",
        code: "DORMANT",
        codeName: "휴면",
        sortOrder: 2,
      },
      {
        groupId: "ACCOUNT_STATUS",
        code: "SUSPENDED",
        codeName: "정지",
        sortOrder: 3,
      },
      {
        groupId: "ACCOUNT_STATUS",
        code: "CLOSED",
        codeName: "해지",
        sortOrder: 4,
      },
      {
        groupId: "ACCOUNT_STATUS",
        code: "FROZEN",
        codeName: "동결",
        sortOrder: 5,
      },

      // ACCOUNT_PURPOSE
      {
        groupId: "ACCOUNT_PURPOSE",
        code: "GENERAL",
        codeName: "일반입출금",
        sortOrder: 1,
      },
      {
        groupId: "ACCOUNT_PURPOSE",
        code: "SALARY",
        codeName: "급여",
        sortOrder: 2,
      },
      {
        groupId: "ACCOUNT_PURPOSE",
        code: "SAVINGS",
        codeName: "적금",
        sortOrder: 3,
      },
      {
        groupId: "ACCOUNT_PURPOSE",
        code: "BUSINESS",
        codeName: "사업자",
        sortOrder: 5,
      },
      {
        groupId: "ACCOUNT_PURPOSE",
        code: "INVESTMENT",
        codeName: "투자",
        sortOrder: 6,
      },

      // INSTRUCTION_TYPE
      {
        groupId: "INSTRUCTION_TYPE",
        code: "BULK_TRANSFER",
        codeName: "대량이체",
        sortOrder: 1,
      },
      {
        groupId: "INSTRUCTION_TYPE",
        code: "NETWORK_INBOUND",
        codeName: "공동망수신",
        sortOrder: 2,
      },
      {
        groupId: "INSTRUCTION_TYPE",
        code: "NETWORK_OUTBOUND",
        codeName: "공동망송신",
        sortOrder: 3,
      },
      {
        groupId: "INSTRUCTION_TYPE",
        code: "AUTO_DEBIT",
        codeName: "자동이체",
        sortOrder: 4,
      },
      {
        groupId: "INSTRUCTION_TYPE",
        code: "SCHEDULED",
        codeName: "예약이체",
        sortOrder: 5,
      },

      // TRANSFER_SCOPE
      {
        groupId: "TRANSFER_SCOPE",
        code: "INTERBANK",
        codeName: "타행이체",
        sortOrder: 1,
      },
      {
        groupId: "TRANSFER_SCOPE",
        code: "INTRABANK",
        codeName: "당행이체",
        sortOrder: 2,
      },

      // CLEARING_NETWORK
      {
        groupId: "CLEARING_NETWORK",
        code: "KFTC",
        codeName: "금융결제원",
        sortOrder: 1,
      },
      {
        groupId: "CLEARING_NETWORK",
        code: "CD_NETWORK",
        codeName: "CD공동망",
        sortOrder: 2,
      },
      {
        groupId: "CLEARING_NETWORK",
        code: "CMS",
        codeName: "CMS자동이체",
        sortOrder: 3,
      },
      {
        groupId: "CLEARING_NETWORK",
        code: "GIRO",
        codeName: "지로",
        sortOrder: 4,
      },
      {
        groupId: "CLEARING_NETWORK",
        code: "INTERNAL",
        codeName: "내부",
        sortOrder: 5,
      },

      // INSTRUCTION_STATUS
      {
        groupId: "INSTRUCTION_STATUS",
        code: "PENDING",
        codeName: "대기",
        sortOrder: 1,
      },
      {
        groupId: "INSTRUCTION_STATUS",
        code: "PROCESSING",
        codeName: "처리중",
        sortOrder: 2,
      },
      {
        groupId: "INSTRUCTION_STATUS",
        code: "COMPLETED",
        codeName: "완료",
        sortOrder: 3,
      },
      {
        groupId: "INSTRUCTION_STATUS",
        code: "PARTIAL",
        codeName: "부분완료",
        sortOrder: 4,
      },
      {
        groupId: "INSTRUCTION_STATUS",
        code: "FAILED",
        codeName: "실패",
        sortOrder: 5,
      },
      {
        groupId: "INSTRUCTION_STATUS",
        code: "CANCELLED",
        codeName: "취소",
        sortOrder: 6,
      },

      // TX_TYPE
      { groupId: "TX_TYPE", code: "DEPOSIT", codeName: "입금", sortOrder: 1 },
      {
        groupId: "TX_TYPE",
        code: "WITHDRAWAL",
        codeName: "출금",
        sortOrder: 2,
      },
      {
        groupId: "TX_TYPE",
        code: "TRANSFER_OUT",
        codeName: "이체출금",
        sortOrder: 3,
      },
      {
        groupId: "TX_TYPE",
        code: "TRANSFER_IN",
        codeName: "이체입금",
        sortOrder: 4,
      },
      { groupId: "TX_TYPE", code: "INTEREST", codeName: "이자", sortOrder: 5 },
      { groupId: "TX_TYPE", code: "FEE", codeName: "수수료", sortOrder: 6 },

      // TX_STATUS
      {
        groupId: "TX_STATUS",
        code: "COMPLETED",
        codeName: "완료",
        sortOrder: 1,
      },
      { groupId: "TX_STATUS", code: "PENDING", codeName: "대기", sortOrder: 2 },
      { groupId: "TX_STATUS", code: "FAILED", codeName: "실패", sortOrder: 3 },
      {
        groupId: "TX_STATUS",
        code: "CANCELLED",
        codeName: "취소",
        sortOrder: 4,
      },

      // TRANSFER_METHOD
      {
        groupId: "TRANSFER_METHOD",
        code: "REALTIME",
        codeName: "실시간",
        sortOrder: 1,
      },
      {
        groupId: "TRANSFER_METHOD",
        code: "AGGREGATE",
        codeName: "집계",
        sortOrder: 2,
      },
      {
        groupId: "TRANSFER_METHOD",
        code: "NIGHT",
        codeName: "야간",
        sortOrder: 3,
      },
      {
        groupId: "TRANSFER_METHOD",
        code: "SAME_DAY",
        codeName: "당일",
        sortOrder: 4,
      },

      // SAVINGS_PAYMENT_STATUS
      {
        groupId: "SAVINGS_PAYMENT_STATUS",
        code: "SCHEDULED",
        codeName: "예정",
        sortOrder: 1,
      },
      {
        groupId: "SAVINGS_PAYMENT_STATUS",
        code: "PAID",
        codeName: "납입완료",
        sortOrder: 2,
      },
      {
        groupId: "SAVINGS_PAYMENT_STATUS",
        code: "PARTIAL",
        codeName: "일부납입",
        sortOrder: 3,
      },
      {
        groupId: "SAVINGS_PAYMENT_STATUS",
        code: "MISSED",
        codeName: "미납",
        sortOrder: 4,
      },

      // BRANCH_TYPE
      {
        groupId: "BRANCH_TYPE",
        code: "HEAD_OFFICE",
        codeName: "본점",
        sortOrder: 1,
      },
      {
        groupId: "BRANCH_TYPE",
        code: "BRANCH",
        codeName: "지점",
        sortOrder: 2,
      },
      {
        groupId: "BRANCH_TYPE",
        code: "SUB_BRANCH",
        codeName: "출장소",
        sortOrder: 3,
      },

      // BRANCH_STATUS
      {
        groupId: "BRANCH_STATUS",
        code: "ACTIVE",
        codeName: "운영중",
        sortOrder: 1,
      },
      {
        groupId: "BRANCH_STATUS",
        code: "CLOSED",
        codeName: "폐점",
        sortOrder: 2,
      },
      {
        groupId: "BRANCH_STATUS",
        code: "SUSPENDED",
        codeName: "운영중단",
        sortOrder: 3,
      },

      // EMPLOYEE_STATUS
      {
        groupId: "EMPLOYEE_STATUS",
        code: "ACTIVE",
        codeName: "재직",
        sortOrder: 1,
      },
      {
        groupId: "EMPLOYEE_STATUS",
        code: "ON_LEAVE",
        codeName: "휴직",
        sortOrder: 2,
      },
      {
        groupId: "EMPLOYEE_STATUS",
        code: "RESIGNED",
        codeName: "퇴직",
        sortOrder: 3,
      },

      // UPLOAD_STATUS
      {
        groupId: "UPLOAD_STATUS",
        code: "PENDING",
        codeName: "대기",
        sortOrder: 1,
      },
      {
        groupId: "UPLOAD_STATUS",
        code: "COMPLETED",
        codeName: "완료",
        sortOrder: 2,
      },
      {
        groupId: "UPLOAD_STATUS",
        code: "FAILED",
        codeName: "실패",
        sortOrder: 3,
      },

      // ENTITY_TYPE
      {
        groupId: "ENTITY_TYPE",
        code: "LOAN_APPLICATION",
        codeName: "대출신청",
        sortOrder: 1,
      },
      {
        groupId: "ENTITY_TYPE",
        code: "CONTRACT",
        codeName: "계약",
        sortOrder: 2,
      },
      {
        groupId: "ENTITY_TYPE",
        code: "ACCOUNT",
        codeName: "계좌",
        sortOrder: 3,
      },
      { groupId: "ENTITY_TYPE", code: "KYC", codeName: "KYC", sortOrder: 4 },
      { groupId: "ENTITY_TYPE", code: "OTHER", codeName: "기타", sortOrder: 5 },

      // DOCUMENT_TYPE
      {
        groupId: "DOCUMENT_TYPE",
        code: "ID_CARD",
        codeName: "신분증",
        sortOrder: 1,
      },
      {
        groupId: "DOCUMENT_TYPE",
        code: "LOAN_APPLICATION_FORM",
        codeName: "융자상담신청서",
        sortOrder: 2,
      },
      {
        groupId: "DOCUMENT_TYPE",
        code: "DEBT_STATEMENT",
        codeName: "부채현황표",
        sortOrder: 3,
      },
      {
        groupId: "DOCUMENT_TYPE",
        code: "INCOME_PROOF",
        codeName: "소득증빙",
        sortOrder: 4,
      },
      {
        groupId: "DOCUMENT_TYPE",
        code: "CREDIT_INFO_CONSENT",
        codeName: "신용정보조회동의서",
        sortOrder: 5,
      },
      {
        groupId: "DOCUMENT_TYPE",
        code: "EMPLOYMENT_CERT",
        codeName: "재직증명서",
        sortOrder: 6,
      },
      {
        groupId: "DOCUMENT_TYPE",
        code: "PROPERTY_CERT",
        codeName: "부동산등기부",
        sortOrder: 7,
      },
      {
        groupId: "DOCUMENT_TYPE",
        code: "TAX_RETURN",
        codeName: "세금신고서",
        sortOrder: 8,
      },
      {
        groupId: "DOCUMENT_TYPE",
        code: "BANK_STATEMENT",
        codeName: "거래내역",
        sortOrder: 9,
      },
      {
        groupId: "DOCUMENT_TYPE",
        code: "CONTRACT_COPY",
        codeName: "계약서사본",
        sortOrder: 10,
      },
      {
        groupId: "DOCUMENT_TYPE",
        code: "OTHER",
        codeName: "기타",
        sortOrder: 11,
      },

      // APPLICATION_STATUS
      {
        groupId: "APPLICATION_STATUS",
        code: "DRAFT",
        codeName: "임시저장",
        sortOrder: 1,
      },
      {
        groupId: "APPLICATION_STATUS",
        code: "SUBMITTED",
        codeName: "제출",
        sortOrder: 2,
      },
      {
        groupId: "APPLICATION_STATUS",
        code: "CREDIT_CHECK",
        codeName: "신용조사중",
        sortOrder: 3,
      },
      {
        groupId: "APPLICATION_STATUS",
        code: "REVIEWING",
        codeName: "심사중",
        sortOrder: 4,
      },
      {
        groupId: "APPLICATION_STATUS",
        code: "APPROVED",
        codeName: "승인",
        sortOrder: 5,
      },
      {
        groupId: "APPLICATION_STATUS",
        code: "PRE_EXECUTION",
        codeName: "실행전확인",
        sortOrder: 6,
      },
      {
        groupId: "APPLICATION_STATUS",
        code: "REJECTED",
        codeName: "거절",
        sortOrder: 7,
      },
      {
        groupId: "APPLICATION_STATUS",
        code: "EXECUTED",
        codeName: "실행완료",
        sortOrder: 8,
      },
      {
        groupId: "APPLICATION_STATUS",
        code: "CANCELLED",
        codeName: "취소",
        sortOrder: 9,
      },

      // APPROVAL_STEP_STATUS
      {
        groupId: "APPROVAL_STEP_STATUS",
        code: "PENDING",
        codeName: "대기",
        sortOrder: 1,
      },
      {
        groupId: "APPROVAL_STEP_STATUS",
        code: "APPROVED",
        codeName: "승인",
        sortOrder: 2,
      },
      {
        groupId: "APPROVAL_STEP_STATUS",
        code: "REJECTED",
        codeName: "거절",
        sortOrder: 3,
      },
      {
        groupId: "APPROVAL_STEP_STATUS",
        code: "SKIPPED",
        codeName: "건너뜀",
        sortOrder: 4,
      },

      // DELINQUENCY_STATUS
      {
        groupId: "DELINQUENCY_STATUS",
        code: "OVERDUE",
        codeName: "연체",
        sortOrder: 1,
      },
      {
        groupId: "DELINQUENCY_STATUS",
        code: "DEFAULT",
        codeName: "부도",
        sortOrder: 2,
      },
      {
        groupId: "DELINQUENCY_STATUS",
        code: "RECOVERED",
        codeName: "회복",
        sortOrder: 3,
      },

      // BANK_CODE
      {
        groupId: "BANK_CODE",
        code: "999",
        codeName: "SG스타뱅크",
        sortOrder: 1,
      },
      {
        groupId: "BANK_CODE",
        code: "004",
        codeName: "KB국민은행",
        sortOrder: 2,
      },
      { groupId: "BANK_CODE", code: "088", codeName: "신한은행", sortOrder: 3 },
      { groupId: "BANK_CODE", code: "020", codeName: "우리은행", sortOrder: 4 },
      {
        groupId: "BANK_CODE",
        code: "081",
        codeName: "KEB하나은행",
        sortOrder: 5,
      },
      {
        groupId: "BANK_CODE",
        code: "011",
        codeName: "NH농협은행",
        sortOrder: 6,
      },
      {
        groupId: "BANK_CODE",
        code: "090",
        codeName: "카카오뱅크",
        sortOrder: 7,
      },
      { groupId: "BANK_CODE", code: "089", codeName: "케이뱅크", sortOrder: 8 },
      { groupId: "BANK_CODE", code: "092", codeName: "토스뱅크", sortOrder: 9 },
    ],
  });

  // ── 2. 고객 Party ──────────────────────────────────────
  const party = await prisma.party.create({
    data: {
      partyName: "홍길동",
      partyRole: "INDIVIDUAL",
      partyStatus: "ACTIVE",
    },
  });
  console.log("  ✔ Party 생성:", party.partyName, `(${party.partyId})`);

  // ── 3. 개인 고객 상세 ──────────────────────────────────
  await prisma.individual.create({
    data: {
      partyId: party.partyId,
      individualPhone: "010-1234-5678",
      individualEmail: "hong@example.com",
      individualCi: "DEMO_CI_HONG_GILDONG_001",
      employmentType: "EMPLOYED",
      employerName: "KB국민은행",
      annualIncome: 60_000_000,
      transferLimitPerTransaction: 10_000_000,
      transferLimitPerDay: 30_000_000,
    },
  });

  // ── 4. 로그인 인증 정보 ────────────────────────────────
  const passwordHash = await bcrypt.hash("Test1234!", 12);
  await prisma.partyAuth.create({
    data: {
      partyId: party.partyId,
      loginId: "testuser",
      passwordHash,
      partyAuthStatus: "ACTIVE",
      passwordChangedAt: new Date(),
    },
  });
  console.log("  ✔ 로그인 계정: testuser / Test1234!");

  // ── 5. 금융 상품 ───────────────────────────────────────
  await prisma.product.createMany({
    data: [
      {
        productName: "SG 스타 정기예금",
        productTypeCode: "DEPOSIT",
        launchDate: new Date("2020-01-10"),
        productStatus: "ACTIVE",
        isDepositInsured: true,
        depositInsuranceLimit: 50_000_000,
        salesTarget: "INDIVIDUAL",
        periodType: "FIXED",
        contractPeriodMonths: 12,
        createdBy: ADMIN_UUID,
        updatedBy: ADMIN_UUID,
      },
      {
        productName: "SG 내맘대로 적금",
        productTypeCode: "DEPOSIT",
        launchDate: new Date("2021-03-15"),
        productStatus: "ACTIVE",
        isDepositInsured: true,
        depositInsuranceLimit: 50_000_000,
        salesTarget: "ALL",
        periodType: "FLEXIBLE",
        contractPeriodMonths: 12,
        createdBy: ADMIN_UUID,
        updatedBy: ADMIN_UUID,
      },
      {
        productName: "SG 주택담보대출",
        productTypeCode: "LOAN",
        launchDate: new Date("2019-06-01"),
        productStatus: "ACTIVE",
        isDepositInsured: false,
        salesTarget: "INDIVIDUAL",
        periodType: "FLEXIBLE",
        createdBy: ADMIN_UUID,
        updatedBy: ADMIN_UUID,
      },
      {
        productName: "SG 직장인 신용대출",
        productTypeCode: "LOAN",
        launchDate: new Date("2022-09-01"),
        productStatus: "ACTIVE",
        isDepositInsured: false,
        salesTarget: "INDIVIDUAL",
        periodType: "FLEXIBLE",
        createdBy: ADMIN_UUID,
        updatedBy: ADMIN_UUID,
      },
    ],
  });

  // ── 6. 계좌 ───────────────────────────────────────────
  const accountPwHash = await bcrypt.hash("1234", 10);

  const checking = await prisma.account.create({
    data: {
      partyId: party.partyId,
      accountNumber: "00900-12-3456781",
      accountPasswordHash: accountPwHash,
      accountType: "DEPOSIT",
      accountStatus: "ACTIVE",
      balance: 2_500_000,
      accountPurpose: "GENERAL",
      openedDate: "2022-03-15",
      displayOrder: 0,
    },
  });

  const salary = await prisma.account.create({
    data: {
      partyId: party.partyId,
      accountNumber: "00900-12-3456782",
      accountPasswordHash: accountPwHash,
      accountType: "DEPOSIT",
      accountStatus: "ACTIVE",
      balance: 890_000,
      accountPurpose: "SALARY",
      openedDate: "2021-07-01",
      displayOrder: 1,
    },
  });

  const savings = await prisma.account.create({
    data: {
      partyId: party.partyId,
      accountNumber: "00900-12-3456783",
      accountPasswordHash: accountPwHash,
      accountType: "DEPOSIT",
      accountStatus: "ACTIVE",
      balance: 1_200_000,
      accountPurpose: "SAVINGS",
      openedDate: "2023-01-10",
      displayOrder: 2,
    },
  });
  console.log("  ✔ 계좌 3개 생성 (입출금, 급여, 적금)");

  // ── 7. 거래 내역 (입출금 계좌 기준) ──────────────────
  const txRows = [
    {
      type: "DEPOSIT",
      amount: 2_000_000,
      balB: 0,
      balA: 2_000_000,
      name: "KB국민은행",
      remark: "초기입금",
      date: "2026-04-01",
      ch: "TELLER",
    },
    {
      type: "DEPOSIT",
      amount: 3_000_000,
      balB: 2_000_000,
      balA: 5_000_000,
      name: "회사",
      remark: "4월 급여",
      date: "2026-04-25",
      ch: "AUTO",
    },
    {
      type: "TRANSFER_OUT",
      amount: 1_500_000,
      balB: 5_000_000,
      balA: 3_500_000,
      name: "이영희",
      remark: "월세",
      date: "2026-04-26",
      ch: "APP",
    },
    {
      type: "WITHDRAWAL",
      amount: 50_000,
      balB: 3_500_000,
      balA: 3_450_000,
      name: null,
      remark: "ATM출금",
      date: "2026-04-28",
      ch: "ATM",
    },
    {
      type: "TRANSFER_IN",
      amount: 80_000,
      balB: 3_450_000,
      balA: 3_530_000,
      name: "박민준",
      remark: "점심값 정산",
      date: "2026-05-02",
      ch: "APP",
    },
    {
      type: "FEE",
      amount: 550,
      balB: 3_530_000,
      balA: 3_529_450,
      name: null,
      remark: "타행ATM이용료",
      date: "2026-05-05",
      ch: "ATM",
    },
    {
      type: "DEPOSIT",
      amount: 3_000_000,
      balB: 3_529_450,
      balA: 6_529_450,
      name: "회사",
      remark: "5월 급여",
      date: "2026-05-25",
      ch: "AUTO",
    },
    {
      type: "TRANSFER_OUT",
      amount: 1_500_000,
      balB: 6_529_450,
      balA: 5_029_450,
      name: "이영희",
      remark: "월세",
      date: "2026-05-26",
      ch: "APP",
    },
    {
      type: "TRANSFER_OUT",
      amount: 2_529_450,
      balB: 5_029_450,
      balA: 2_500_000,
      name: "KB적금",
      remark: "적금이체",
      date: "2026-05-27",
      ch: "AUTO",
    },
  ];

  for (const tx of txRows) {
    await prisma.transaction.create({
      data: {
        accountId: checking.accountId,
        transactionType: tx.type as never,
        amount: tx.amount,
        balanceBefore: tx.balB,
        balanceAfter: tx.balA,
        transactionStatus: "COMPLETED",
        channel: tx.ch as never,
        counterpartName: tx.name,
        remark: tx.remark,
        transactionDate: tx.date,
        transactedAt: new Date(tx.date),
      },
    });
  }
  console.log("  ✔ 거래 내역 9건 생성");

  console.log("\n✅ 시딩 완료!");
  console.log("──────────────────────────────");
  console.log("  로그인 아이디: testuser");
  console.log("  비밀번호:      Test1234!");
  console.log("──────────────────────────────");
}

main()
  .catch((e) => {
    console.error("❌ 시딩 실패:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
