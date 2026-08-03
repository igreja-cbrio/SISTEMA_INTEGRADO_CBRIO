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
  Baby, ScanLine, Users, Settings, Monitor, Printer,
  Cake, DoorOpen, Loader2, MessageCircle, BarChart3,
} from 'lucide-react';

// Reorganização 2026-07-06 (pedido do Matheus): o hub fica só com a OPERAÇÃO
// de culto (o que os voluntários usam); o gerencial (frequência, vínculos,
// equipe, estoque, batismos, apresentação, decisões) mudou pro módulo Kids
// da aba Cultos (/kids · PainelKids).
const ACESSOS = [
  { titulo: 'Check-in (Totem)', desc: 'Entrada e saída das crianças no culto', icon: ScanLine, path: '/ministerial/totem-kids', cor: '#ec4899' },
  { titulo: 'Portão de saída', desc: 'Leitor valida a etiqueta na entrada do corredor', icon: DoorOpen, path: '/ministerial/totem-kids/portao', cor: '#10b981' },
  { titulo: 'Crianças', desc: 'Gestão, ficha, atendimentos e frequência', icon: Users, path: '/ministerial/totem-kids/criancas', cor: '#00B39D' },
  { titulo: 'Painel ao vivo', desc: 'Quem está em cada sala agora', icon: Monitor, path: '/ministerial/totem-kids/painel', cor: '#f59e0b' },
  { titulo: 'Etiqueta', desc: 'Testar impressão da etiqueta', icon: Printer, path: '/ministerial/totem-kids/teste-etiqueta', cor: '#64748b' },
  { titulo: 'Configurações', desc: 'Sessões, salas e auditoria (overrides + portão)', icon: Settings, path: '/ministerial/totem-kids/configuracoes', cor: '#64748b' },
  // Porta pro gerencial (2026-08-03 · pedido do Matheus: voluntário do Kids
  // também precisa dos indicadores). É o ÚNICO caminho pra lá numa conta travada
  // em quiosque — a trava esconde o menu inteiro, então sem este card o /kids
  // fica inalcançável mesmo com permissão.
  { titulo: 'Indicadores e gestão', desc: 'Frequência, equipe, estoque, batismos e indicadores da área', icon: BarChart3, path: '/kids', cor: '#7C3AED' },
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

// Rótulo do parentesco pra impressão.
const PARENTESCO_LABEL: Record<string, string> = { mae: 'Mãe', pai: 'Pai', avo: 'Avó/Avô', responsavel: 'Resp.' };
// Número no formato wa.me (55 + DDD + número · mesmo padrão do NextConvite): só
// dígitos, prefixa 55 quando não vier. Retorna null pra número fora do padrão BR.
function waNum(raw?: string | null): string | null {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  if (d.length === 10 || d.length === 11) return '55' + d;
  return null;
}
// Contato dos responsáveis (mãe/pai · nome + telefone) formatado pra célula do PDF.
// O telefone vira link wa.me clicável (o PDF é HTML impresso · abre a conversa direto).
function contatoResponsaveis(a: any): string {
  const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
  const resp = (a?.responsaveis || []).filter((r: any) => r.nome || r.telefone);
  if (!resp.length) return '<span style="color:#999">—</span>';
  return resp.map((r: any) => {
    const par = PARENTESCO_LABEL[r.parentesco] || 'Resp.';
    let tel = '';
    if (r.telefone) {
      const wa = waNum(r.telefone);
      tel = wa
        ? ` · <a href="https://wa.me/${wa}" style="color:#128C7E;text-decoration:none">${esc(r.telefone)} 💬</a>`
        : ` · ${esc(r.telefone)}`;
    }
    return `<b>${par}:</b> ${esc(r.nome || '—')}${tel}`;
  }).join('<br>');
}

// Abre uma janela imprimível com a lista de aniversariantes (Nome · Idade · Data · Responsável).
function imprimirAniversariantes(lista: any[]) {
  const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
  const linhas = (lista || []).map(a =>
    `<tr><td>${esc(a.nome)}</td><td>${esc(idade(a.data_nascimento))}</td><td>${esc(fmtDiaMes(a.data_nascimento))}</td><td>${contatoResponsaveis(a)}</td></tr>`).join('');
  const hoje = new Date().toLocaleDateString('pt-BR');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Aniversariantes CBKids</title>
    <style>body{font-family:system-ui,-apple-system,Arial,sans-serif;margin:28px;color:#111}
    h1{font-size:18px;margin:0 0 2px}p.sub{color:#666;font-size:12px;margin:0 0 14px}
    table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:13px;vertical-align:top}
    th{background:#f6f6f6;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#555}
    @media print{body{margin:0}}</style></head><body>
    <h1>🎂 Aniversariantes da semana — CBKids</h1>
    <p class="sub">${(lista || []).length} criança(s) · próximos 7 dias · impresso em ${hoje}</p>
    <table><thead><tr><th>Nome</th><th>Idade</th><th>Aniversário</th><th>Responsável (contato)</th></tr></thead><tbody>${linhas}</tbody></table>
    <script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

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
    { label: 'Aniversariantes (semana)', valor: r.aniversariantes_semana, icon: Cake, cor: '#ec4899' },
    { label: 'Salas', valor: r.salas, icon: DoorOpen, cor: '#f59e0b', path: '/ministerial/totem-kids/configuracoes?aba=salas' },
    { label: 'Sessões abertas', valor: r.sessoes_abertas, icon: ScanLine, cor: '#8b5cf6', path: '/ministerial/totem-kids' },
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

      <div className="grid grid-cols-1 gap-4">
        {/* Aniversariantes da semana */}
        <Card className="glass-solid p-4">
          <div className="font-semibold text-sm flex items-center gap-2 mb-3">
            <Cake className="h-4 w-4 text-pink-500" /> Aniversariantes da semana
            {(d?.aniversariantes || []).length > 0 && (
              <button onClick={() => imprimirAniversariantes(d.aniversariantes)}
                className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80">
                <Printer className="h-3.5 w-3.5" /> Imprimir lista
              </button>
            )}
          </div>
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
