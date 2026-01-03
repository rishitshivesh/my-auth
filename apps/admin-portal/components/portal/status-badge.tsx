interface StatusBadgeProps {
  status: "active" | "inactive" | "pending" | "error"
  label?: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const statusConfig = {
    active: {
      bg: "bg-green-100 dark:bg-green-900/30",
      text: "text-green-800 dark:text-green-400",
      dot: "bg-green-600",
    },
    inactive: { bg: "bg-gray-100 dark:bg-gray-900/30", text: "text-gray-800 dark:text-gray-400", dot: "bg-gray-600" },
    pending: {
      bg: "bg-yellow-100 dark:bg-yellow-900/30",
      text: "text-yellow-800 dark:text-yellow-400",
      dot: "bg-yellow-600",
    },
    error: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-800 dark:text-red-400", dot: "bg-red-600" },
  }

  const config = statusConfig[status]
  const statusLabel = label || status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${config.bg} ${config.text}`}
    >
      <div className={`h-2 w-2 rounded-full ${config.dot}`} />
      {statusLabel}
    </div>
  )
}
