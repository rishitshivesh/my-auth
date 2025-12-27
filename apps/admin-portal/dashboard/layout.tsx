import { Navbar } from "@/components/layout/navbar"
import { Sidebar } from "@/components/layout/sidebar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-full relative">
      {/* Sidebar for Desktop */}
      <div className="hidden h-full md:flex md:w-72 md:flex-col md:fixed md:inset-y-0 z-[80] bg-gray-900">
        <Sidebar />
      </div>

      {/* Main Content Area */}
      <main className="md:pl-72 h-full">
        <Navbar />
        <div className="p-8 h-[calc(100vh-4rem)] overflow-y-auto bg-slate-50/50">
          {children}
        </div>
      </main>
    </div>
  )
}