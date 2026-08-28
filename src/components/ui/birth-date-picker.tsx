// ============================================================================
// BirthDatePicker — data de nascimento: DIGITAR ou escolher no calendário
// ----------------------------------------------------------------------------
// Substitui o <input type="date"> nativo / máscara solta (o seletor de ano
// nativo era ruim — pedido do Matheus 2026-07-16, reclamação nas inscrições de
// grupos). Em 2026-08-07 ele pediu o caminho de volta: *"adicione a opção de
// escrever a data de nascimento também, para facilitar"* — chegar em 1978 num
// calendário são muitos toques, e quem sabe a própria data digita mais rápido
// do que navega.
//
// Então o gatilho virou um CAMPO DE TEXTO com máscara dd/mm/aaaa, e o ícone do
// calendário ao lado abre o Popover de sempre (react-day-picker v8 com
// dropdowns de mês/ano). Os dois caminhos escrevem no MESMO valor.
//
// Interface idêntica à anterior (e ao DataNascimentoPicker do totemKids) →
// nenhum dos ~64 consumidores muda:
//   value: 'YYYY-MM-DD' (ou '' se vazio) · onChange(v) emite o mesmo formato.
//
// ⚠️ `onChange` SÓ emite ISO completo e válido, ou ''. Data pela metade
// ("07/08/") não vira valor — quem valida "obrigatório/inválido" é o formulário
// de cada porta, com a régua dele (`validarNascimento` do contrato).
//
// ⚠️ O texto digitado NÃO é apagado quando está inválido. Apagar o que a pessoa
// escreveu para "limpar o estado" é o jeito mais rápido de fazer alguém desistir
// do formulário: ela vê o campo esvaziar sozinho e não sabe o que errou.
//
// ⚠️ Ano com 4 dígitos, sempre. Aceitar 2 exigiria adivinhar 19xx/20xx, e em
// data de NASCIMENTO esse chute erra em um século inteiro.
//
// ⚠️ `text-base sm:text-sm`: 16px no mobile porque abaixo disso o iOS dá zoom
// automático ao focar o campo e desloca a tela inteira no meio da digitação.
//
// Evita o off-by-one de fuso com o padrão da casa `new Date(iso+'T12:00:00')`.
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
const RE_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function isoParaDate(iso?: string | null): Date | undefined {
  if (!iso || !RE_ISO.test(iso)) return undefined;
  const d = new Date(iso + "T12:00:00");
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function dateParaIso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function isoParaBr(iso?: string | null): string {
  const d = isoParaDate(iso);
  return d ? format(d, "dd/MM/yyyy") : "";
}

/** Máscara progressiva: só dígitos, barras entram sozinhas, teto de 8 dígitos. */
function mascarar(bruto: string): string {
  const d = bruto.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * 'dd/mm/aaaa' → ISO, ou '' se não for data real dentro da faixa.
 *
 * ⚠️ Confere o dia DE VOLTA depois do parse: o `date-fns` normaliza 31/02 para
 * 03/03 em vez de recusar, e uma data que a pessoa não digitou seria gravada
 * como se ela tivesse digitado.
 */
function brParaIso(texto: string, fromYear: number, toYear: number): string {
  const m = RE_BR.exec(texto);
  if (!m) return "";
  const [, dd, mm, aaaa] = m;
  const dia = Number(dd);
  const mes = Number(mm);
  const ano = Number(aaaa);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return "";
  if (ano < fromYear || ano > toYear) return "";
  const d = new Date(ano, mes - 1, dia, 12, 0, 0);
  if (
    d.getFullYear() !== ano
    || d.getMonth() !== mes - 1
    || d.getDate() !== dia
  ) return "";
  if (d > new Date()) return "";
  return dateParaIso(d);
}

export interface BirthDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  anoMin?: number;
  anoMax?: number;
  placeholder?: string;
  /** classe extra no campo */
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
  placeholder = "dd/mm/aaaa",
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
  const [texto, setTexto] = React.useState(() => isoParaBr(value));

  // ⚠️ Só sobrescreve o texto quando o valor de FORA discorda do que está
  // escrito. Sem essa condição, o effect reescreveria o campo a cada render e
  // brigaria com quem está digitando (o prefill do modo atualização do censo é
  // exatamente esse caso).
  React.useEffect(() => {
    if (brParaIso(texto, fromYear, toYear) !== (value || "")) {
      setTexto(isoParaBr(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function digitou(bruto: string) {
    const t = mascarar(bruto);
    setTexto(t);
    const iso = brParaIso(t, fromYear, toYear);
    // Data incompleta/inválida emite '' — nunca um ISO parcial. Apagar o campo
    // inteiro (value='') quando a pessoa está no meio da digitação é esperado:
    // o formulário só reclama no submit, e o texto continua visível.
    if (iso !== (value || "")) onChange(iso);
  }

  // Mês exibido ao abrir: a data escolhida, ou um ponto de partida razoável
  // (meio da faixa não faz sentido pra nascimento — usa 2000 ou o topo).
  const defaultMonth = selected ?? new Date(Math.min(2000, toYear), 0, 1);

  return (
    <div className={cn("relative flex w-full items-center", className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="bday"
        placeholder={placeholder}
        value={texto}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        onChange={(e) => digitou(e.target.value)}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background",
          "pl-3 pr-10 py-2 text-base sm:text-sm ring-offset-background",
          "placeholder:text-muted-foreground focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          ariaInvalid && "border-destructive",
        )}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            // Só o ícone abre o calendário — o resto do campo é pra digitar.
            aria-label="Abrir calendário"
            className="absolute right-0 h-10 w-10 text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0"
          align="end"
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
                const iso = dateParaIso(d);
                setTexto(isoParaBr(iso));
                onChange(iso);
                setOpen(false);
              }
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Utilitários reexportados (úteis em quem consome só ISO ↔ Date).
export { isoParaDate, dateParaIso, brParaIso, mascarar, parse as parseDate };
