import * as React from "react"
import { cn } from "@/lib/utils"

interface CbrioLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  text?: string
  size?: "sm" | "md" | "lg"
}

const HEART_PATH =
  "M 40 78 C 40 50, 72 42, 100 72 C 128 42, 160 50, 160 80 C 160 112, 118 142, 100 160 L 138 188"

function CbrioLoader({
  text = "Carregando...",
  size = "md",
  className,
  ...props
}: CbrioLoaderProps) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-14 w-14",
    lg: "h-20 w-20",
  }

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-8", className)} {...props}>
      <svg
        viewBox="0 0 200 200"
        fill="none"
        strokeWidth={22}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={sizeClasses[size]}
        aria-label="Carregando"
        role="img"
      >
        <path d={HEART_PATH} stroke="#3E7E8E" strokeOpacity={0.18} pathLength={100} />
        <path
          d={HEART_PATH}
          stroke="#3E7E8E"
          pathLength={100}
          strokeDasharray="22 78"
          className="cbrio-heart-trace"
        />
      </svg>
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  )
}

export { CbrioLoader }
