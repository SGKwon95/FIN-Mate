import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const ADMIN_UUID = "00000000-0000-0000-0000-000000000001"

async function main() {
  console.log("🌱 DB 시딩 시작...")

  // ── 기존 데이터 초기화 (역참조 순서) ──────────────────
  await prisma.transaction.deleteMany()
  await prisma.account.deleteMany()
  await prisma.partyAuth.deleteMany()
  await prisma.individual.deleteMany()
  await prisma.product.deleteMany()
  await prisma.commonCode.deleteMany()
  await prisma.commonCodeGroup.deleteMany()
  await prisma.party.deleteMany()

  // ── 1. 공통 코드 ──────────────────────────────────────
  await prisma.commonCodeGroup.createMany({
    data: [
      { groupId: "USER_ROLE",     groupName: "사용자 권한",  description: "회원 권한 관리" },
      { groupId: "ACCOUNT_STATUS",groupName: "계좌 상태",   description: "계좌 활성/정지 상태" },
      { groupId: "BANK_CODE",     groupName: "은행 코드",   description: "금융기관 목록" },
      { groupId: "TX_TYPE",       groupName: "거래 유형",   description: "입출금 거래 유형" },
      { groupId: "PROD_TYPE",     groupName: "상품 유형",   description: "상품 유형" },
    ],
  })

  await prisma.commonCode.createMany({
    data: [
      { groupId: "USER_ROLE",  code: "INDIVIDUAL", codeName: "일반회원",   sortOrder: 1 },
      { groupId: "USER_ROLE",  code: "VIP",        codeName: "VIP회원",    sortOrder: 2 },
      { groupId: "USER_ROLE",  code: "ADMIN",      codeName: "관리자",     sortOrder: 3 },
      { groupId: "PROD_TYPE",  code: "DEPOSIT",    codeName: "예금성 상품", sortOrder: 1 },
      { groupId: "PROD_TYPE",  code: "LOAN",       codeName: "대출성 상품", sortOrder: 2 },
      { groupId: "BANK_CODE",  code: "004",        codeName: "KB국민은행",  sortOrder: 1 },
      { groupId: "BANK_CODE",  code: "020",        codeName: "우리은행",   sortOrder: 2 },
      { groupId: "BANK_CODE",  code: "011",        codeName: "NH농협은행", sortOrder: 3 },
      { groupId: "BANK_CODE",  code: "088",        codeName: "신한은행",   sortOrder: 4 },
    ],
  })

  // ── 2. 고객 Party ──────────────────────────────────────
  const party = await prisma.party.create({
    data: {
      partyName:   "홍길동",
      partyRole:   "INDIVIDUAL",
      partyStatus: "ACTIVE",
    },
  })
  console.log("  ✔ Party 생성:", party.partyName, `(${party.partyId})`)

  // ── 3. 개인 고객 상세 ──────────────────────────────────
  await prisma.individual.create({
    data: {
      partyId:                    party.partyId,
      individualPhone:            "010-1234-5678",
      individualEmail:            "hong@example.com",
      individualCi:               "DEMO_CI_HONG_GILDONG_001",
      employmentType:             "EMPLOYED",
      employerName:               "KB국민은행",
      annualIncome:               60_000_000,
      transferLimitPerTransaction: 10_000_000,
      transferLimitPerDay:        30_000_000,
    },
  })

  // ── 4. 로그인 인증 정보 ────────────────────────────────
  const passwordHash = await bcrypt.hash("Test1234!", 12)
  await prisma.partyAuth.create({
    data: {
      partyId:          party.partyId,
      loginId:          "testuser",
      passwordHash,
      partyAuthStatus:  "ACTIVE",
      passwordChangedAt: new Date(),
    },
  })
  console.log("  ✔ 로그인 계정: testuser / Test1234!")

  // ── 5. 금융 상품 ───────────────────────────────────────
  await prisma.product.createMany({
    data: [
      {
        productName:          "KB 스타 정기예금",
        productTypeCode:      "DEPOSIT",
        launchDate:           new Date("2020-01-10"),
        productStatus:        "ACTIVE",
        isDepositInsured:     true,
        depositInsuranceLimit: 50_000_000,
        salesTarget:          "INDIVIDUAL",
        periodType:           "FIXED",
        contractPeriodMonths: 12,
        createdBy:            ADMIN_UUID,
        updatedBy:            ADMIN_UUID,
      },
      {
        productName:          "KB 내맘대로 적금",
        productTypeCode:      "DEPOSIT",
        launchDate:           new Date("2021-03-15"),
        productStatus:        "ACTIVE",
        isDepositInsured:     true,
        depositInsuranceLimit: 50_000_000,
        salesTarget:          "ALL",
        periodType:           "FLEXIBLE",
        contractPeriodMonths: 12,
        createdBy:            ADMIN_UUID,
        updatedBy:            ADMIN_UUID,
      },
      {
        productName:     "KB 주택담보대출",
        productTypeCode: "LOAN",
        launchDate:      new Date("2019-06-01"),
        productStatus:   "ACTIVE",
        isDepositInsured: false,
        salesTarget:     "INDIVIDUAL",
        periodType:      "FLEXIBLE",
        createdBy:       ADMIN_UUID,
        updatedBy:       ADMIN_UUID,
      },
      {
        productName:     "KB 직장인 신용대출",
        productTypeCode: "LOAN",
        launchDate:      new Date("2022-09-01"),
        productStatus:   "ACTIVE",
        isDepositInsured: false,
        salesTarget:     "INDIVIDUAL",
        periodType:      "FLEXIBLE",
        createdBy:       ADMIN_UUID,
        updatedBy:       ADMIN_UUID,
      },
    ],
  })

  // ── 6. 계좌 ───────────────────────────────────────────
  const accountPwHash = await bcrypt.hash("1234", 10)

  const checking = await prisma.account.create({
    data: {
      partyId:            party.partyId,
      accountNumber:      "00900-12-3456781",
      accountPasswordHash: accountPwHash,
      accountType:        "DEPOSIT",
      accountStatus:      "ACTIVE",
      balance:            2_500_000,
      accountPurpose:     "GENERAL",
      openedDate:         "2022-03-15",
      displayOrder:       0,
    },
  })

  const salary = await prisma.account.create({
    data: {
      partyId:            party.partyId,
      accountNumber:      "00900-12-3456782",
      accountPasswordHash: accountPwHash,
      accountType:        "DEPOSIT",
      accountStatus:      "ACTIVE",
      balance:            890_000,
      accountPurpose:     "SALARY",
      openedDate:         "2021-07-01",
      displayOrder:       1,
    },
  })

  const savings = await prisma.account.create({
    data: {
      partyId:            party.partyId,
      accountNumber:      "00900-12-3456783",
      accountPasswordHash: accountPwHash,
      accountType:        "DEPOSIT",
      accountStatus:      "ACTIVE",
      balance:            1_200_000,
      accountPurpose:     "SAVINGS",
      openedDate:         "2023-01-10",
      displayOrder:       2,
    },
  })
  console.log("  ✔ 계좌 3개 생성 (입출금, 급여, 적금)")

  // ── 7. 거래 내역 (입출금 계좌 기준) ──────────────────
  const txRows = [
    { type: "DEPOSIT",      amount: 2_000_000, balB: 0,         balA: 2_000_000, name: "KB국민은행",  remark: "초기입금",    date: "2026-04-01", ch: "TELLER"   },
    { type: "DEPOSIT",      amount: 3_000_000, balB: 2_000_000, balA: 5_000_000, name: "회사",        remark: "4월 급여",    date: "2026-04-25", ch: "AUTO"     },
    { type: "TRANSFER_OUT", amount: 1_500_000, balB: 5_000_000, balA: 3_500_000, name: "이영희",      remark: "월세",        date: "2026-04-26", ch: "APP"      },
    { type: "WITHDRAWAL",   amount:   50_000,  balB: 3_500_000, balA: 3_450_000, name: null,         remark: "ATM출금",      date: "2026-04-28", ch: "ATM"      },
    { type: "TRANSFER_IN",  amount:   80_000,  balB: 3_450_000, balA: 3_530_000, name: "박민준",      remark: "점심값 정산", date: "2026-05-02", ch: "APP"      },
    { type: "FEE",          amount:      550,  balB: 3_530_000, balA: 3_529_450, name: null,         remark: "타행ATM이용료", date: "2026-05-05", ch: "ATM"     },
    { type: "DEPOSIT",      amount: 3_000_000, balB: 3_529_450, balA: 6_529_450, name: "회사",        remark: "5월 급여",    date: "2026-05-25", ch: "AUTO"     },
    { type: "TRANSFER_OUT", amount: 1_500_000, balB: 6_529_450, balA: 5_029_450, name: "이영희",      remark: "월세",        date: "2026-05-26", ch: "APP"      },
    { type: "TRANSFER_OUT", amount: 2_529_450, balB: 5_029_450, balA: 2_500_000, name: "KB적금",      remark: "적금이체",    date: "2026-05-27", ch: "AUTO"     },
  ]

  for (const tx of txRows) {
    await prisma.transaction.create({
      data: {
        accountId:         checking.accountId,
        transactionType:   tx.type as never,
        amount:            tx.amount,
        balanceBefore:     tx.balB,
        balanceAfter:      tx.balA,
        transactionStatus: "COMPLETED",
        channel:           tx.ch as never,
        counterpartName:   tx.name,
        remark:            tx.remark,
        transactionDate:   tx.date,
        transactedAt:      new Date(tx.date),
      },
    })
  }
  console.log("  ✔ 거래 내역 9건 생성")

  console.log("\n✅ 시딩 완료!")
  console.log("──────────────────────────────")
  console.log("  로그인 아이디: testuser")
  console.log("  비밀번호:      Test1234!")
  console.log("──────────────────────────────")
}

main()
  .catch((e) => {
    console.error("❌ 시딩 실패:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
