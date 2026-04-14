import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PeriodFilterProps {
  value: string;
  onChange: (val: string) => void;
}

export default function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Periodo" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="week">Esta semana</SelectItem>
        <SelectItem value="month">Ultimo mes</SelectItem>
        <SelectItem value="3months">Ultimos 3 meses</SelectItem>
      </SelectContent>
    </Select>
  );
}
