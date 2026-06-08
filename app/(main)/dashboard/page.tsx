import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatKRW } from "@/lib/formatters";
import AccountSummaryCard from "@/components/dashboard/AccountSummaryCard";
import QuickActions from "@/components/dashboard/QuickActions";
import ProductBanner from "@/components/dashboard/ProductBanner";
import { computeUserProfile, fallbackScore, extractReasons } from "@/lib/recommend";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "홈" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.partyId) redirect("/login");

  const [accounts, rawProducts] = await Promise.all([
    prisma.account.findMany({
      where: {
        partyId: session.user.partyId,
        accountStatus: "ACTIVE",
        isHidden: false,
      },
      orderBy: { displayOrder: "asc" },
      select: {
        accountId: true,
        accountNumber: true,
        accountType: true,
        accountPurpose: true,
        balance: true,
      },
    }),
    prisma.product.findMany({
      where: { productStatus: "ACTIVE" },
      select: {
        productId: true,
        productName: true,
        productTypeCode: true,
        isDepositInsured: true,
        depositInsuranceLimit: true,
        description: true,
        depositDetail: { select: { transactionType: true, minAmount: true, minPeriodMonths: true, maxPeriodMonths: true } },
        loanDetail:    { select: { loanType: true, minLoanAmount: true, maxLoanAmount: true } },
        productRates: { where: { rateType: "BASE" }, orderBy: { effectiveFrom: "desc" }, take: 1, select: { rate: true } },
      },
    }),
  ]);

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

  // 규칙 기반 맞춤 추천 (대시보드는 빠른 폴백만 사용)
  const accountsForProfile = accounts.map((a) => ({
    accountType:    a.accountType,
    accountPurpose: a.accountPurpose,
    balance:        Number(a.balance),
  }));
  const profile = computeUserProfile(accountsForProfile, []);
  const products = rawProducts
    .map((p) => {
      const product = {
        productId:             p.productId,
        productName:           p.productName,
        productTypeCode:       p.productTypeCode,
        isDepositInsured:      p.isDepositInsured,
        depositInsuranceLimit: p.depositInsuranceLimit != null ? Number(p.depositInsuranceLimit) : null,
        description:           p.description,
        depositDetail:         p.depositDetail ? {
          transactionType: p.depositDetail.transactionType,
          minAmount:       p.depositDetail.minAmount != null ? Number(p.depositDetail.minAmount) : null,
          minPeriodMonths: p.depositDetail.minPeriodMonths,
          maxPeriodMonths: p.depositDetail.maxPeriodMonths,
        } : null,
        loanDetail: p.loanDetail ? {
          loanType:      p.loanDetail.loanType,
          minLoanAmount: p.loanDetail.minLoanAmount != null ? Number(p.loanDetail.minLoanAmount) : null,
          maxLoanAmount: p.loanDetail.maxLoanAmount != null ? Number(p.loanDetail.maxLoanAmount) : null,
        } : null,
        productRates: p.productRates.map((r) => ({ rate: Number(r.rate) })),
      };
      const reasons = extractReasons(profile, product);
      return {
        productId:      product.productId,
        productName:    product.productName,
        productTypeCode: product.productTypeCode,
        topReason:      reasons[0],
        _score:         fallbackScore(profile, product),
      };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);

  // Decimal → string 직렬화 (Server→Server 사이라도 명시적으로 변환)
  const serializedAccounts = accounts.map((a) => ({
    ...a,
    balance: a.balance.toFixed(0),
  }));

  return (
    <div className="max-w-2xl lg:max-w-none">
      {/* ── 총 자산 현황 ──────────────────────────── */}
      <div className="bg-kb-navy px-5 pt-6 pb-7">
        <p className="text-white/50 text-sm">총 보유자산</p>
        <p className="text-white text-[2rem] font-bold mt-1 tracking-tight tabular-nums">
          {formatKRW(totalBalance)}
        </p>
      </div>

      {/* ── 카드 영역 ────────────────────────────── */}
      <div className="px-4 py-4 space-y-3 pb-24 lg:pb-6">
        <AccountSummaryCard accounts={serializedAccounts} />
        <QuickActions />
        <ProductBanner products={products} personalized />
      </div>
    </div>
  );
}
