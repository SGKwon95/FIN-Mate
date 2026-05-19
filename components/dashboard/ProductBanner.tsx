import Link from "next/link";
import { ChevronRight, Shield, TrendingUp, Percent, Home } from "lucide-react";

type ProductItem = {
  productId: string;
  productName: string;
  productTypeCode: string;
};

const ICON_MAP = {
  DEPOSIT: Shield,
  LOAN: Home,
} as const;

const COLOR_MAP = [
  {
    grad: "from-kb-navy to-kb-navy-light",
    sub: "text-white/60",
    main: "text-white",
  },
  {
    grad: "from-amber-500 to-yellow-400",
    sub: "text-white/70",
    main: "text-white",
  },
  {
    grad: "from-blue-600 to-blue-400",
    sub: "text-white/70",
    main: "text-white",
  },
  {
    grad: "from-emerald-700 to-teal-500",
    sub: "text-white/70",
    main: "text-white",
  },
];

// DB에 상품이 없을 때 보여줄 정적 샘플
const STATIC_PRODUCTS: ProductItem[] = [
  {
    productId: "s1",
    productName: "SG 스타 정기예금",
    productTypeCode: "DEPOSIT",
  },
  {
    productId: "s2",
    productName: "SG 내맘대로 적금",
    productTypeCode: "DEPOSIT",
  },
  { productId: "s3", productName: "SG 주택담보대출", productTypeCode: "LOAN" },
  { productId: "s4", productName: "SG 직장인 대출", productTypeCode: "LOAN" },
];

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "예금·적금",
  LOAN: "대출",
};

export default function ProductBanner({
  products,
}: {
  products: ProductItem[];
}) {
  const display = products.length > 0 ? products.slice(0, 4) : STATIC_PRODUCTS;

  return (
    <section className="bg-white rounded-2xl shadow-card overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-kb-gray-border">
        <h2 className="text-kb-navy font-bold text-base">SG 추천 상품</h2>
        <Link
          href="/products"
          className="flex items-center gap-0.5 text-kb-gray text-xs hover:text-kb-navy transition-colors"
        >
          전체보기
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 상품 카드 그리드 */}
      <div className="p-4 grid grid-cols-2 gap-3">
        {display.map((product, idx) => {
          const color = COLOR_MAP[idx % COLOR_MAP.length];
          const Icon =
            ICON_MAP[product.productTypeCode as keyof typeof ICON_MAP] ??
            Percent;
          const isStatic = product.productId.startsWith("s");
          const href = isStatic
            ? "/products"
            : `/products/${product.productId}`;

          return (
            <Link
              key={product.productId}
              href={href}
              className={`bg-gradient-to-br ${color.grad} rounded-xl p-4 flex flex-col gap-2 min-h-[100px] hover:opacity-90 active:scale-[0.98] transition-all`}
            >
              <div className="flex items-center justify-between">
                <Icon className={`w-6 h-6 ${color.main} opacity-80`} />
                <span className={`text-[10px] ${color.sub}`}>
                  {TYPE_LABEL[product.productTypeCode] ??
                    product.productTypeCode}
                </span>
              </div>
              <p
                className={`text-sm font-semibold ${color.main} leading-tight mt-auto`}
              >
                {product.productName}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
