import * as React from "react"
import { cn } from "@/lib/utils"

interface CbrioLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  text?: string
  size?: "sm" | "md" | "lg"
}

// Path vetorizado a partir de public/logo-cbrio-icon.png · viewBox 0 0 800 800
// renderizado com transform translate(0,800) scale(0.1,-0.1).
const HEART_PATH =
  "M2365 7533 c-452 -56 -782 -175 -1124 -403 -379 -254 -673 -614 -845 -1035 -218 -536 -240 -1129 -60 -1672 99 -297 246 -567 451 -823 145 -182 416 -429 574 -523 297 -176 675 -72 819 226 87 182 89 334 6 502 -55 110 -131 199 -323 378 -216 202 -289 290 -363 437 -152 302 -176 634 -68 938 128 364 425 654 793 776 301 99 636 69 934 -84 114 -59 180 -111 374 -299 228 -221 343 -281 534 -281 166 0 297 54 414 171 211 212 348 302 564 375 419 140 864 39 1195 -273 192 -180 328 -427 376 -680 25 -133 15 -374 -19 -506 -65 -244 -165 -411 -419 -699 -294 -334 -639 -676 -1393 -1382 -786 -737 -1273 -1234 -1342 -1369 -124 -247 -87 -514 95 -694 98 -97 254 -162 390 -163 75 0 194 30 282 72 79 37 95 50 225 186 286 301 794 801 1230 1212 957 903 1436 1396 1663 1718 388 547 535 1195 417 1836 -162 874 -791 1590 -1621 1841 -625 190 -1394 96 -1917 -233 l-98 -61 -79 59 c-326 241 -746 403 -1165 450 -84 9 -433 12 -500 3z"

// id único evita conflito com outros filtros caso vários loaders convivam
const FILTER_ID = "cbrio-heart-trace-glow"

function CbrioLoader({
  text = "Carregando...",
  size = "md",
  className,
  ...props
}: CbrioLoaderProps) {
  const sizeClasses = {
    sm: "h-12 w-12",
    md: "h-16 w-16",
    lg: "h-24 w-24",
  }

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-8", className)} {...props}>
      <svg
        viewBox="0 0 800 800"
        className={sizeClasses[size]}
        aria-label="Carregando"
        role="img"
      >
        <defs>
          <filter id={FILTER_ID} x="-25%" y="-25%" width="150%" height="150%">
            {/* stdDeviation alto · compensa o scale(0.1) do <g> */}
            <feGaussianBlur in="SourceGraphic" stdDeviation="220" />
          </filter>
        </defs>
        <g transform="translate(0,800) scale(0.1,-0.1)">
          {/* Coração em cor dim · base */}
          <path d={HEART_PATH} fill="#3E7E8E" fillOpacity={0.16} stroke="none" />
          {/* Halo da luz · stroke largo borrado · move sincronizado com o nucleo */}
          <path
            d={HEART_PATH}
            fill="none"
            stroke="#7BC4D1"
            strokeOpacity={0.85}
            strokeWidth={420}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="12 88"
            className="cbrio-heart-trace"
            filter={`url(#${FILTER_ID})`}
          />
          {/* Nucleo da luz · stroke fino bem claro */}
          <path
            d={HEART_PATH}
            fill="none"
            stroke="#E6F7FA"
            strokeWidth={220}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="12 88"
            className="cbrio-heart-trace"
          />
        </g>
      </svg>
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  )
}

export { CbrioLoader }
