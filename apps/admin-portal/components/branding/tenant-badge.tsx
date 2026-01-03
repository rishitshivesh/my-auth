interface TenantBadgeProps {
  name: string
  status?: "active" | "inactive" | "pending"
  className?: string
}

export function TenantBadge({ name, status = "active", className = "" }: TenantBadgeProps) {
  const statusStyles = {
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    inactive: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  }

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${statusStyles[status]} ${className}`}
    >
      <div
        className={`h-2 w-2 rounded-full ${
          status === "active"
            ? "bg-green-600 dark:bg-green-400"
            : status === "pending"
              ? "bg-yellow-600 dark:bg-yellow-400"
              : "bg-gray-600 dark:bg-gray-400"
        }`}
      />
      {name}
    </div>
  )
}
