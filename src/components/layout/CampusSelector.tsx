import { useCampus } from '../../contexts/CampusContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

export default function CampusSelector() {
  const campus = useCampus();
  const config = campus.contexto;
  if (!config || config.estado === 'preparacao' || config.campi.length < 2) return null;
  return <Select value={config.campus_id || undefined} disabled={campus.loading} onValueChange={id => void campus.trocarCampus(id)}>
    <SelectTrigger aria-label="Campus ativo" className="w-[180px]" size="sm"><SelectValue placeholder="Escolha o campus" /></SelectTrigger>
    <SelectContent>{config.campi.map(item => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent>
  </Select>;
}
