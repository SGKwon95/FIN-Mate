export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-kb-navy to-kb-navy-light flex flex-col">
      {children}
    </div>
  )
}
