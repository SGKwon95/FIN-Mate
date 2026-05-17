export default function DashboardLoading() {
  return (
    <div className="animate-pulse">
      {/* 자산 현황 스켈레톤 */}
      <div className="bg-kb-navy px-5 pt-6 pb-7">
        <div className="h-4 w-20 bg-white/10 rounded mb-2" />
        <div className="h-9 w-48 bg-white/10 rounded" />
      </div>

      {/* 카드 스켈레톤 */}
      <div className="px-4 py-4 space-y-3">
        <div className="bg-white rounded-2xl h-44 shadow-card" />
        <div className="bg-white rounded-2xl h-28 shadow-card" />
        <div className="bg-white rounded-2xl h-56 shadow-card" />
      </div>
    </div>
  )
}
