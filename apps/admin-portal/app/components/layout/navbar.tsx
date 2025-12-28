"use client"

import { Menu } from "lucide-react"
import { Sidebar } from "./sidebar"
import { useRouter } from "next/navigation"

// Imports from @repo/ui
import { Button } from "@repo/ui/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@repo/ui/components/ui/sheet"
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@repo/ui/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar"

export function Navbar() {
  const router = useRouter()

  const handleLogout = async () => {
    // Call backend logout or clear cookies here
    // await api.post('/auth/logout') 
    router.push('/login')
  }

  return (
    <div className="flex items-center p-4 border-b h-16">
      {/* Mobile Sidebar Trigger */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 bg-slate-900 text-white border-r-slate-800">
            <Sidebar />
          </SheetContent>
        </Sheet>
      </div>

      {/* Right side of Navbar */}
      <div className="flex w-full justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src="/avatars/01.png" alt="@shadcn" />
                <AvatarFallback>AD</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">Admin User</p>
                <p className="text-xs leading-none text-muted-foreground">
                  admin@fortknox.io
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}