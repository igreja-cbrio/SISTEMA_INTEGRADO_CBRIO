import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { opcoesAno } from '@/lib/janelaPeriodo';

interface PeriodFilterProps {
  value: string;
  onChange: (val: string) => void;
}

export default function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-[180px] min-h-[40px]">
        <SelectValue placeholder="Período" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="week">Última Semana</SelectItem>
        <SelectItem value="month">Mês Atual</SelectItem>
        <SelectItem value="3months">3 Meses</SelectItem>
        <SelectItem value="4months">4 Meses</SelectItem>
        <SelectItem value="6months">6 Meses</SelectItem>
        {/* ⚠️ Janela FECHADA por ANO — os anos vêm da régua única
            (src/lib/janelaPeriodo.ts), então ano novo aparece sozinho. */}
        {opcoesAno().map((a) => (
          <SelectItem key={a.dias} value={String(a.dias)}>{a.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
