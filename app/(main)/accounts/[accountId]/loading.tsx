export default function AccountDetailLoading() {
  return (
    <div className="max-w-2xl lg:max-w-none animate-pulse">
      {/* 헤더 스켈레톤 */}
      <div className="bg-kb-navy px-4 pt-4 pb-6">
        <div className="h-4 w-16 bg-white/20 rounded mb-6" />
        <div className="h-5 w-20 bg-white/20 rounded mb-2" />
        <div className="h-4 w-40 bg-white/20 rounded mb-3" />
        <div className="h-9 w-48 bg-white/20 rounded" />
      </div>

      {/* 필터 스켈레톤 */}
      <div className="bg-white px-4 pt-3 pb-2 border-b border-kb-gray-border space-y-2">
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1 h-7 bg-kb-gray-light rounded-lg" />
          ))}
        </div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1 h-7 bg-kb-gray-light rounded-lg" />
          ))}
        </div>
      </div>

      {/* 거래내역 스켈레톤 */}
      <div className="bg-white divide-y divide-kb-gray-border">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-4">
            <div className="w-8 h-8 rounded-full bg-kb-gray-light shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-32 bg-kb-gray-light rounded" />
              <div className="h-3 w-24 bg-kb-gray-light rounded" />
            </div>
            <div className="text-right space-y-2">
              <div className="h-3.5 w-24 bg-kb-gray-light rounded" />
              <div className="h-3 w-20 bg-kb-gray-light rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
