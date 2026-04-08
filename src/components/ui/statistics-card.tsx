import * as React from "react"
import { cn } from "@/lib/utils"
import { ArrowUp, ArrowDown, type LucideIcon } from "lucide-react"
import { Badge } from "./badge"

interface StatisticsCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  value: string | number
  icon?: LucideIcon
  iconColor?: string
  delta?: number
  subtitle?: string
  onClick?: () => void
}

function StatisticsCard({
  title,
  value,
  icon: Icon,
  iconColor,
  delta,
  subtitle,
  onClick,
  className,
  ...props
}: StatisticsCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "cbrio-kpi relative rounded-xl border border-border bg-card p-4 transition-all",
        onClick && "cursor-pointer hover:shadow-lg",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate">{title}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-foreground">{value}</span>
            {delta !== undefined && delta !== 0 && (
              <span className={cn(
                "inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
                delta > 0 ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
              )}>
                {delta > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                {Math.abs(delta)}%
              </span>
            )}
          </div>
        </div>
        {Icon && (
          <div className="rounded-lg p-2" style={{ background: `${iconColor}18` }}>
            <Icon className="h-5 w-5" style={{ color: iconColor }} />
          </div>
        )}
      </div>
      {subtitle && (
        <p className="text-[10px] text-muted-foreground mt-2 truncate">{subtitle}</p>
      )}
    </div>
  )
}

function StatisticsCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 animate-pulse", className)}>
      <div className="h-3 w-20 bg-muted rounded mb-2" />
      <div className="h-7 w-16 bg-muted rounded" />
    </div>
  )
}

export { StatisticsCard, StatisticsCardSkeleton }
export type { StatisticsCardProps }
