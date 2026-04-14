import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PeriodFilterProps {
  value: string;
  onChange: (val: string) => void;
}

export default function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-[180px] min-h-[40px]">
        <SelectValue placeholder="Periodo" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="week">Ultima Semana</SelectItem>
        <SelectItem value="month">Mes Atual</SelectItem>
        <SelectItem value="3months">3 Meses</SelectItem>
        <SelectItem value="4months">4 Meses</SelectItem>
        <SelectItem value="6months">6 Meses</SelectItem>
      </SelectContent>
    </Select>
  );
}
