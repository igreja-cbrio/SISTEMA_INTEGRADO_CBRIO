// ============================================================================
// BirthDatePicker — seletor de data de nascimento com calendário (Popover)
// ----------------------------------------------------------------------------
// Layout shadcn: botão → Popover com react-day-picker (v8) e dropdowns de
// mês/ano (captionLayout="dropdown", 1900→ano atual). Substitui o
// <input type="date"> nativo / máscara DD/MM/AAAA (o seletor de ano nativo era
// ruim — pedido do Matheus 2026-07-16, reclamação nas inscrições de grupos).
//
// Interface idêntica ao DataNascimentoPicker (totemKids) → troca mecânica:
//   value: 'YYYY-MM-DD' (ou '' se vazio) · onChange(v) emite o mesmo formato.
//
// Totalmente responsivo no mobile: gatilho full-width, popover com largura
// automática, alvos de toque ≥40px. Evita o off-by-one de fuso com o padrão
// da casa `new Date(iso + 'T12:00:00')`.
// ============================================================================

import * as React from "react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";

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

export interface BirthDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  anoMin?: number;
  anoMax?: number;
  placeholder?: string;
  /** classe extra no botão gatilho */
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
}

export function BirthDatePicker({
  value,
  onChange,
  anoMin,
  anoMax,
  placeholder = "Selecione a data",
  className,
  id,
  disabled,
  "aria-invalid": ariaInvalid,
}: BirthDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const anoAtual = new Date().getFullYear();
  const fromYear = anoMin ?? 1900;
  const toYear = anoMax ?? anoAtual;

  const selected = isoParaDate(value);
  // Mês exibido ao abrir: a data escolhida, ou um ponto de partida razoável
  // (meio da faixa não faz sentido pra nascimento — usa 2000 ou o topo).
  const defaultMonth =
    selected ??
    new Date(Math.min(2000, toYear), 0, 1);

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
            <span>{format(selected, "dd/MM/yyyy", { locale: ptBR })}</span>
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        // Em telas estreitas evita transbordar da viewport.
        collisionPadding={12}
      >
        <Calendar
          mode="single"
          locale={ptBR}
          captionLayout="dropdown-buttons"
          fromYear={fromYear}
          toYear={toYear}
          selected={selected}
          defaultMonth={defaultMonth}
          disabled={(d) => d > new Date() || d < new Date("1900-01-01T00:00:00")}
          onSelect={(d) => {
            if (d) {
              onChange(dateParaIso(d));
              setOpen(false);
            }
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// Utilitários reexportados (úteis em quem consome só ISO ↔ Date).
export { isoParaDate, dateParaIso, parse as parseDate };
