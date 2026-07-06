// Kids · Crianças para batizar — as inscrições de batismo de crianças (que já
// aparecem na Integração) também aparecem aqui pra a equipe Kids contatar a
// família. Quando chega uma nova, o Kids recebe notificação.
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { totemKids as api } from '../../../api';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Droplets, Loader2, Phone, Search, AlertCircle, Cake } from 'lucide-react';

const fmt = (d?: string | null) => { if (!d) return '—'; try { return new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR'); } catch { return d; } };
const idade = (d?: string | null) => {
  if (!d) return '';
  try { const n = new Date(); const b = new Date(d + 'T00:00:00'); let a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--; return `${a} ano${a === 1 ? '' : 's'}`; } catch { return ''; }
};
const STATUS_COR: Record<string, string> = { inscrito: 'bg-blue-500/10 text-blue-600', confirmado: 'bg-emerald-500/10 text-emerald-600', realizado: 'bg-muted text-muted-foreground', cancelado: 'bg-red-500/10 text-red-600' };

export default function BatismosKids() {
  const navigate = useNavigate();
  const [lista, setLista] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    api.batismos().then((d: any) => setLista(Array.isArray(d) ? d : [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false));
  }, []);

  const t = busca.trim().toLowerCase();
  const filtradas = lista.filter((b) => !t || `${b.nome} ${b.sobrenome || ''}`.toLowerCase().includes(t));
  // Agrupa por turma de batismo (data_batismo) · mais recente primeiro
  const grupos = useMemo(() => {
    const map: Record<string, any[]> = {};
    filtradas.forEach((b) => { const k = b.data_batismo || 'sem-data'; (map[k] = map[k] || []).push(b); });
    return Object.entries(map).sort((a, b) => {
      if (a[0] === 'sem-data') return 1;
      if (b[0] === 'sem-data') return -1;
      return b[0].localeCompare(a[0]);
    });
  }, [filtradas]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => navigate('/kids')} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Voltar ao Kids</button>
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Droplets className="h-5 w-5 text-blue-500" /> Crianças para batizar</h1>
        <p className="text-sm text-muted-foreground">Inscrições de batismo de crianças — entre em contato com a família. (Também aparecem na Integração.)</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar criança..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtradas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma criança inscrita para batismo no momento.</Card>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{filtradas.length} criança{filtradas.length !== 1 ? 's' : ''} · {grupos.length} turma{grupos.length !== 1 ? 's' : ''}</div>
          {grupos.map(([data, items]) => (
            <div key={data} className="space-y-2">
              <div className="flex items-center gap-2 pt-2">
                <div className="text-sm font-semibold">{data === 'sem-data' ? 'Sem data definida' : `Turma · ${fmt(data)}`}</div>
                <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
              </div>
              {items.map((b) => (
            <Card key={b.id} className="p-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0"><Droplets className="h-5 w-5 text-blue-500" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate flex items-center gap-1">
                  {b.nome} {b.sobrenome || ''}
                  {b.possui_deficiencia && <AlertCircle className="h-3.5 w-3.5 text-amber-500" />}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {idade(b.data_nascimento) && <>{idade(b.data_nascimento)} · </>}
                  Batismo: {fmt(b.data_batismo)}{b.horario_culto ? ` · ${b.horario_culto}` : ''}
                </div>
                {b.possui_deficiencia && b.deficiencia_descricao && <div className="text-[11px] text-amber-600 truncate">⚠ {b.deficiencia_descricao}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {b.status && <Badge variant="secondary" className={`text-[10px] ${STATUS_COR[b.status] || ''}`}>{b.status}</Badge>}
                {b.telefone && <a href={`https://wa.me/55${String(b.telefone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-primary" title="Falar com a família"><Phone className="h-4 w-4" /></a>}
              </div>
            </Card>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
