"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui"
import { CircleHelp, LogOut, Settings, User } from "lucide-react"

interface UserMenuProps {
  userName?: string
  userEmail?: string
  userAvatar?: string
  profileHref?: string
  settingsHref?: string
  supportHref?: string
  onLogout?: () => void | Promise<void>
}

export function UserMenu({
  userName = "John Doe",
  userEmail = "john@example.com",
  userAvatar,
  profileHref = "/profile",
  settingsHref = "/settings",
  supportHref = "/support",
  onLogout,
}: UserMenuProps) {
  const initials = userName
    .split(" ")
    .map((name) => name[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 rounded-full"
          aria-label="Open user menu"
        >
          <Avatar className="size-9">
            <AvatarImage src={userAvatar} alt={userName} />
            <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium leading-none">{userName}</span>
            <span className="text-xs leading-none text-muted-foreground">
              {userEmail}
            </span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <a href={profileHref}>
              <User className="size-4" />
              Profile
            </a>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <a href={settingsHref}>
              <Settings className="size-4" />
              Account settings
            </a>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <a href={supportHref}>
              <CircleHelp className="size-4" />
              Help & support
            </a>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void onLogout?.()}
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

