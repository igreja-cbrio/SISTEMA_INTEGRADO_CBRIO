// ============================================================================
// DatePicker — seletor de data GERAL (agendamento, vencimento, período…)
// ----------------------------------------------------------------------------
// Substitui o <input type="date"> nativo (feio e pouco prático) por um Popover
// com react-day-picker (v8) e navegação por DROPDOWN de mês/ano — igual ao
// BirthDatePicker, mas SEM travar datas futuras e com faixa de ano ampla
// (padrão: ano atual −30 … +10, ajustável por prop). Pra DATA DE NASCIMENTO
// use o BirthDatePicker (faixa 1900→hoje, futuro bloqueado).
//
// Interface = mesma do <input type="date"> controlado (troca mecânica):
//   value: 'YYYY-MM-DD' (ou '')  ·  onChange(v) emite o mesmo formato ('' se limpo)
// Evita o off-by-one de fuso com o padrão da casa `new Date(iso+'T12:00:00')`.
// ============================================================================

import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function isoParaDate(iso?: string | null): Date | undefined {
  if (!iso || !RE_ISO.test(iso)) return undefined;
  const d = new Date(iso + "T12:00:00");
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function dateParaIso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  /** faixa de anos no dropdown (padrão: ano atual −30 … +10) */
  fromYear?: number;
  toYear?: number;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  /** limites opcionais (ISO) — desabilita datas fora do intervalo */
  min?: string;
  max?: string;
  /** mostra o botão "limpar" quando há valor (padrão true) */
  clearable?: boolean;
  "aria-invalid"?: boolean;
}

export function DatePicker({
  value,
  onChange,
  fromYear,
  toYear,
  placeholder = "Selecione a data",
  className,
  id,
  disabled,
  min,
  max,
  clearable = true,
  "aria-invalid": ariaInvalid,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const anoAtual = new Date().getFullYear();
  const fy = fromYear ?? anoAtual - 30;
  const ty = toYear ?? anoAtual + 10;

  const selected = isoParaDate(value);
  const minDate = isoParaDate(min);
  const maxDate = isoParaDate(max);
  const defaultMonth = selected ?? new Date(anoAtual, new Date().getMonth(), 1);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-invalid={ariaInvalid}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            ariaInvalid && "border-destructive",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
          {selected ? (
            <span className="flex-1">{format(selected, "dd/MM/yyyy", { locale: ptBR })}</span>
          ) : (
            <span className="flex-1">{placeholder}</span>
          )}
          {clearable && selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Limpar data"
              className="ml-1 rounded-sm p-0.5 opacity-60 hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" collisionPadding={12}>
        <Calendar
          mode="single"
          locale={ptBR}
          captionLayout="dropdown-buttons"
          fromYear={fy}
          toYear={ty}
          selected={selected}
          defaultMonth={defaultMonth}
          disabled={(d) =>
            (minDate ? d < minDate : false) || (maxDate ? d > maxDate : false)
          }
          onSelect={(d) => {
            if (d) { onChange(dateParaIso(d)); setOpen(false); }
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export { isoParaDate, dateParaIso };
