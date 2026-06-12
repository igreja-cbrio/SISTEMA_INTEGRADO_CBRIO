import * as React from "react"
import { CbrioLoader } from "@/components/ui/cbrio-loader"

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  text?: string
  size?: "sm" | "md" | "lg"
}

function LoadingSpinner({ text = "Carregando...", size = "md", ...props }: LoadingSpinnerProps) {
  return <CbrioLoader text={text} size={size} {...props} />
}

function TableLoadingRow({ colSpan = 7, text = "Carregando..." }: { colSpan?: number; text?: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <LoadingSpinner text={text} />
      </td>
    </tr>
  )
}

function TableEmptyRow({ colSpan = 7, text = "Nenhum dado encontrado" }: { colSpan?: number; text?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center py-8 text-muted-foreground">
        {text}
      </td>
    </tr>
  )
}

export { LoadingSpinner, TableLoadingRow, TableEmptyRow }
