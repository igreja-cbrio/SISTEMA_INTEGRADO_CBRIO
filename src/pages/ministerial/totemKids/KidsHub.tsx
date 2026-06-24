// Kids · Dashboard/Hub central — resumo do ministério infantil num lugar só:
// cards de resumo, novas solicitações de vínculo, aniversariantes da semana e
// os acessos pras telas (check-in, crianças, vínculos, decisões, config...).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { totemKids as api } from '../../../api';
import { MeshGradient } from '../../../components/ui/mesh-gradient-shader';
import { Card } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { toast } from 'sonner';
import {
  Baby, ScanLine, Users, ShieldCheck, Sparkles, Settings, Monitor, BarChart3, Printer,
  Cake, DoorOpen, Loader2, ArrowRight, UserCheck, Boxes, Droplets, MessageCircle,
} from 'lucide-react';

const ACESSOS = [
  { titulo: 'Check-in (Totem)', desc: 'Entrada e saída das crianças no culto', icon: ScanLine, path: '/ministerial/totem-kids', cor: '#ec4899' },
  { titulo: 'Crianças', desc: 'Gestão, ficha, atendimentos e frequência', icon: Users, path: '/ministerial/totem-kids/criancas', cor: '#00B39D' },
  { titulo: 'Vínculos', desc: 'Pedidos de vínculo criança ↔ responsável', icon: ShieldCheck, path: '/ministerial/totem-kids/vinculos', cor: '#3b82f6' },
  { titulo: 'Equipe do Kids', desc: 'Voluntários por posição (salas, recepção...) + ficha', icon: UserCheck, path: '/ministerial/totem-kids/voluntarios', cor: '#14b8a6' },
  { titulo: 'Estoque por sala', desc: 'O que tem e o que deve ter em cada sala (Patrimônio)', icon: Boxes, path: '/ministerial/totem-kids/estoque', cor: '#f97316' },
  { titulo: 'Batismos (crianças)', desc: 'Crianças pra batizar · contatar a família', icon: Droplets, path: '/ministerial/totem-kids/batismos', cor: '#0ea5e9' },
  { titulo: 'Decisões', desc: 'Decisões de fé registradas no Kids', icon: Sparkles, path: '/ministerial/totem-kids/decisoes', cor: '#8b5cf6' },
  { titulo: 'Painel ao vivo', desc: 'Quem está em cada sala agora', icon: Monitor, path: '/ministerial/totem-kids/painel', cor: '#f59e0b' },
  { titulo: 'Etiqueta (teste)', desc: 'Testar impressão da etiqueta', icon: Printer, path: '/ministerial/totem-kids/teste-etiqueta', cor: '#64748b' },
  { titulo: 'Configurações', desc: 'Sessões, salas, estações, pagers, auditoria', icon: Settings, path: '/ministerial/totem-kids/configuracoes', cor: '#64748b' },
  { titulo: 'Indicadores (KPIs)', desc: 'Saúde e metas do ministério infantil', icon: BarChart3, path: '/kids', cor: '#ef4444' },
];

const fmtDiaMes = (d?: string | null) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}` : '');
const idade = (d?: string | null) => {
  if (!d) return '';
  try {
    const n = new Date(); const b = new Date(d + 'T00:00:00');
    let a = n.getFullYear() - b.getFullYear();
    if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
    return `${a} ano${a === 1 ? '' : 's'}`;
  } catch { return ''; }
};

export default function KidsHub() {
  const navigate = useNavigate();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [enviandoResumo, setEnviandoResumo] = useState(false);
  async function testarResumo() {
    setEnviandoResumo(true);
    try {
      const r: any = await api.resumoExemplo();
      toast.success(`Exemplo enviado pro seu WhatsApp${r?.telefone ? ` (${r.telefone})` : ''}.`);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível enviar o exemplo.');
    } finally { setEnviandoResumo(false); }
  }

  useEffect(() => {
    api.dashboard().then(setD).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const r = d?.resumo || {};
  const STATS = [
    { label: 'Crianças ativas', valor: r.criancas_ativas, icon: Baby, cor: '#00B39D', path: '/ministerial/totem-kids/criancas' },
    { label: 'Solicitações de vínculo', valor: r.vinculos_pendentes, icon: ShieldCheck, cor: '#3b82f6', path: '/ministerial/totem-kids/vinculos', destaque: r.vinculos_pendentes > 0 },
    { label: 'Aniversariantes (semana)', valor: r.aniversariantes_semana, icon: Cake, cor: '#ec4899' },
    { label: 'Salas', valor: r.salas, icon: DoorOpen, cor: '#f59e0b', path: '/ministerial/totem-kids/configuracoes?aba=salas' },
    { label: 'Sessões abertas', valor: r.sessoes_abertas, icon: ScanLine, cor: '#8b5cf6', path: '/ministerial/totem-kids' },
    { label: 'Crianças pra batizar', valor: r.batismos_criancas, icon: Droplets, cor: '#0ea5e9', path: '/ministerial/totem-kids/batismos', destaque: r.batismos_criancas > 0 },
  ];

  return (
    <div className="relative min-h-[calc(100vh-4rem)]">
      <MeshGradient speed={6} intensity={1.6} grain={0.5} className="!fixed inset-0" style={{ zIndex: 0 }} />
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-2 text-white drop-shadow-lg"><Baby className="h-7 w-7 text-pink-200" /> Kids</h1>
          <p className="text-sm text-white/85 drop-shadow">Dashboard do ministério infantil — tudo num lugar só.</p>
        </div>
        <button onClick={testarResumo} disabled={enviandoResumo} className="glass-solid text-xs px-3 py-2 rounded-lg border border-border inline-flex items-center gap-1.5 hover:border-primary/40 disabled:opacity-60">
          {enviandoResumo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />} Testar resumo no WhatsApp
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {STATS.map((s) => (
          <Card
            key={s.label}
            onClick={() => s.path && navigate(s.path)}
            className={`glass-solid p-3 ${s.path ? 'cursor-pointer hover:border-primary/40' : ''} transition-colors ${s.destaque ? 'ring-1 ring-blue-400/50' : ''}`}
          >
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${s.cor}1a` }}>
                <s.icon className="h-4 w-4" style={{ color: s.cor }} />
              </div>
              <div className="text-2xl font-bold tabular-nums">{loading ? '–' : (s.valor ?? 0)}</div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Novas solicitações de vínculo */}
        <Card className="glass-solid p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-500" /> Novas solicitações de vínculo</div>
            <button onClick={() => navigate('/ministerial/totem-kids/vinculos')} className="text-xs text-primary inline-flex items-center gap-1">ver todas <ArrowRight className="h-3 w-3" /></button>
          </div>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (d?.vinculos || []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma solicitação pendente.</p>
          ) : (
            <div className="space-y-2">
              {d.vinculos.map((v: any) => (
                <button key={v.id} onClick={() => navigate('/ministerial/totem-kids/vinculos')} className="w-full flex items-center gap-3 rounded-lg border border-border p-2 text-left hover:border-primary/40 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0"><Baby className="h-4 w-4 text-blue-500" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{v.crianca_nome}</div>
                    <div className="text-xs text-muted-foreground truncate">{v.solicitante_nome}{v.solicitante_parentesco ? ` · ${v.solicitante_parentesco}` : ''}</div>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">pendente</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Aniversariantes da semana */}
        <Card className="glass-solid p-4">
          <div className="font-semibold text-sm flex items-center gap-2 mb-3"><Cake className="h-4 w-4 text-pink-500" /> Aniversariantes da semana</div>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (d?.aniversariantes || []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Ninguém faz aniversário nos próximos 7 dias.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {d.aniversariantes.map((a: any) => (
                <button key={a.id} onClick={() => navigate(`/ministerial/totem-kids/criancas?crianca=${a.id}`)} className="w-full flex items-center gap-3 rounded-lg border border-border p-2 text-left hover:border-primary/40 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-pink-500/10 flex items-center justify-center overflow-hidden shrink-0">
                    {a.foto_url ? <img src={a.foto_url} alt="" className="h-full w-full object-cover" /> : <Cake className="h-4 w-4 text-pink-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{a.nome}</div>
                    <div className="text-xs text-muted-foreground">{idade(a.data_nascimento)}</div>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{fmtDiaMes(a.data_nascimento)}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Acessos */}
      <div>
        <div className="text-xs font-semibold text-white/80 uppercase tracking-wide mb-2 drop-shadow">Acessos</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ACESSOS.map((it) => (
            <Card key={it.path} onClick={() => navigate(it.path)} className="glass-solid p-4 cursor-pointer hover:border-primary/40 transition-colors flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${it.cor}1a` }}>
                <it.icon className="h-5 w-5" style={{ color: it.cor }} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm">{it.titulo}</div>
                <div className="text-xs text-muted-foreground">{it.desc}</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
