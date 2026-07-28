import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { next as nextApi } from '../../api';
import { hrefConversa } from '@/lib/conversas';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  Loader2, Plus, Users, GraduationCap, CalendarDays, Search,
  CheckCircle2, AlertTriangle, X, UserPlus, UserCheck, Sparkles, RotateCcw,
  Share2, Copy, MessageCircle, Monitor, ArrowRightLeft, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import TotemNext from './next/TotemNext';

const C = { primary: '#00B39D', warn: '#f59e0b', danger: '#ef4444', info: '#3b82f6', gray: '#737373' };

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function nomeMesAtual() { const d = new Date(); return `${MESES_PT[d.getMonth()]} ${d.getFullYear()}`; }

// Mensagem pré-preenchida (editável antes de enviar) com a turma e as datas
// dos encontros. Abre o inbox interno (/conversas) já com o texto.
function msgTurma(nome: string, turmaNome: string, encontros?: { data?: string | null }[]) {
  const datas = (encontros || []).map(e => e.data).filter(Boolean)
    .map(d => { const [, m, day] = String(d).split('-'); return `${day}/${m}`; });
  const quando = datas.length
    ? ` Os encontros são no dia ${datas.join(' e ')} (confirme o horário com a gente).`
    : '';
  return `Olá, ${nome}! 🎉 Você foi alocado(a) na turma do Next "${turmaNome}".${quando} Qualquer dúvida, é só chamar por aqui. Te esperamos!`;
}

type Status = 'matriculado' | 'formado' | 'incompleto' | 'desistiu';
type Encontro = { id: string; turma_id: string; numero: number; data?: string | null; tema?: string | null };
type Matricula = {
  id: string; turma_id?: string | null; nome: string; sobrenome?: string | null;
  cpf?: string | null; telefone?: string | null; email?: string | null; status: Status;
  indicou_grupo?: boolean; indicou_servir?: boolean; indicou_batismo?: boolean; indicou_devocional?: boolean;
  created_at?: string | null; contato_em?: string | null; contato_por?: string | null;
};
type Presenca = { encontro_id: string; matricula_id: string; presente: boolean };
type Turma = {
  id: string; nome: string; status: 'aberta' | 'encerrada' | 'cancelada';
  contagem?: { total: number; formado?: number; encontros?: number };
};
type TurmaDetalhe = Turma & { encontros: Encontro[]; matriculas: Matricula[]; presencas: Presenca[] };

const STATUS_LABEL: Record<Status, string> = {
  matriculado: 'Matriculado', formado: 'Formado', incompleto: 'Incompleto', desistiu: 'Desistiu',
};
const STATUS_COLOR: Record<Status, string> = {
  matriculado: C.info, formado: C.primary, incompleto: C.warn, desistiu: C.gray,
};

// Direcionamento pros valores DENTRO do Next (Fase 1B · Marcos · 2026-06-25). Os flags
// indicou_* vivem na matrícula. Grupos/Voluntários → caixa da área; Batismo → inscrição
// pendente; Devocional → registra a escolha. Sem Dízimo (decisão do Marcos).
const NEXT_VALORES: { v: string; flag: keyof Matricula; l: string }[] = [
  { v: 'grupos',      flag: 'indicou_grupo',      l: 'Grupos' },
  { v: 'voluntarios', flag: 'indicou_servir',     l: 'Voluntários' },
  { v: 'batismo',     flag: 'indicou_batismo',    l: 'Batismo' },
  { v: 'devocional',  flag: 'indicou_devocional', l: 'Devocional' },
];

function ymdLocal(d?: string | null): string {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// Data + hora da inscrição (created_at da matrícula é um timestamptz ISO).
function dataHora(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
// "Novo" = entrou nos últimos 3 dias (destaca quem acabou de se inscrever).
function ehNovo(iso?: string | null): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 3 * 24 * 60 * 60 * 1000;
}

export default function NextTurmas() {
  const [view, setView] = useState<'turmas' | 'pessoas'>('turmas');
  const [shareOpen, setShareOpen] = useState(false);
  const [qrDirecOpen, setQrDirecOpen] = useState(false);
  const [totemOpen, setTotemOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30">
          {([['turmas', 'Turmas'], ['pessoas', 'Pessoas']] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${view === v ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => setTotemOpen(true)} className="gap-2" style={{ background: C.primary, color: '#fff' }}>
            <Monitor className="h-4 w-4" /> Totem
          </Button>
          <Button variant="outline" size="sm" onClick={() => setQrDirecOpen(true)} className="gap-2">
            <Share2 className="h-4 w-4" /> QR de direcionamento
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} className="gap-2">
            <Share2 className="h-4 w-4" /> Compartilhar link
          </Button>
        </div>
      </div>
      {view === 'turmas' ? <TurmasView /> : <PessoasView />}
      {shareOpen && <ModalCompartilhar onClose={() => setShareOpen(false)} />}
      {qrDirecOpen && <QrDirecionarModal onClose={() => setQrDirecOpen(false)} />}
      {totemOpen && <TotemNext onClose={() => setTotemOpen(false)} />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// TURMAS (mensais · 2 encontros · presença)
// ──────────────────────────────────────────────────────────────────────────
function TurmasView() {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [loading, setLoading] = useState(true);
  const [novaOpen, setNovaOpen] = useState(false);
  const [turmaAberta, setTurmaAberta] = useState<string | null>(null);
  const [espera, setEspera] = useState<{ count: number; pessoas: any[] }>({ count: 0, pessoas: [] });

  const load = useCallback(async () => {
    setLoading(true);
    try { setTurmas(await nextApi.turmas.list()); } catch (e: any) { toast.error(e?.message || 'Erro ao carregar turmas'); }
    try { const r = await nextApi.turmas.listaEspera(); setEspera({ count: r?.count || 0, pessoas: r?.pessoas || [] }); } catch { /* noop */ }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const turmasAbertas = turmas.filter(t => t.status === 'aberta');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3 flex-wrap">
        <Button onClick={() => setNovaOpen(true)} className="gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white">
          <Plus className="h-4 w-4" /> Abrir turma
        </Button>
      </div>

      {espera.count > 0 && (
        <FilaEspera pessoas={espera.pessoas} turmasAbertas={turmasAbertas} onChanged={load} />
      )}
      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto my-12" />
      ) : turmas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Nenhuma turma ainda. Abra a primeira turma (2 encontros).
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {turmas.map(t => {
            const c = t.contagem || { total: 0 };
            return (
              <button
                key={t.id}
                onClick={() => setTurmaAberta(t.id)}
                className="text-left rounded-xl border border-border bg-card hover:bg-muted/40 hover:shadow-sm transition-all p-3 flex flex-col gap-2 min-h-[120px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground text-sm leading-tight">{t.nome}</span>
                  {t.status !== 'aberta' && <Badge variant="outline" className="text-[9px] uppercase shrink-0">{t.status}</Badge>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{c.total || 0}</span>
                  <span className="flex items-center gap-1" style={{ color: C.primary }}><GraduationCap className="h-3.5 w-3.5" />{c.formado || 0}</span>
                  <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{c.encontros || 0}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {novaOpen && <NovaTurmaModal onClose={() => setNovaOpen(false)} onCreated={() => { setNovaOpen(false); load(); }} />}
      {turmaAberta && <TurmaDetalheModal turmaId={turmaAberta} onClose={() => setTurmaAberta(null)} onChanged={load} />}
    </div>
  );
}

// Lista de espera · pessoas direcionadas ao Next (sem turma) aguardando alocação.
// O responsável escolhe a turma; ao alocar, a pessoa sai da fila e ganha o botão
// de WhatsApp (no detalhe da turma) com dia dos encontros.
function FilaEspera({ pessoas, turmasAbertas, onChanged }: { pessoas: any[]; turmasAbertas: Turma[]; onChanged: () => void }) {
  const [alocando, setAlocando] = useState<string | null>(null);
  const alocar = async (pid: string, turmaId: string) => {
    setAlocando(pid);
    try { await nextApi.matriculas.update(pid, { turma_id: turmaId }); toast.success('Pessoa alocada na turma'); onChanged(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao alocar'); }
    setAlocando(null);
  };
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <UserCheck className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-foreground">
          Lista de espera <span className="text-muted-foreground font-normal">· {pessoas.length}</span>
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Pessoas direcionadas ao Next aguardando alocação. Escolha a turma de cada uma; depois de alocada, o botão de WhatsApp aparece no detalhe da turma.
      </p>
      <div className="space-y-2">
        {pessoas.map(p => {
          const nome = `${p.nome}${p.sobrenome ? ' ' + p.sobrenome : ''}`;
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{nome}</p>
                {p.telefone && <p className="text-[11px] text-muted-foreground">{p.telefone}</p>}
              </div>
              {turmasAbertas.length === 0 ? (
                <span className="text-[11px] text-muted-foreground italic">abra uma turma pra alocar</span>
              ) : (
                <Select onValueChange={(v) => alocar(p.id, v)} disabled={alocando === p.id}>
                  <SelectTrigger className="h-8 w-[190px] text-xs">
                    <SelectValue placeholder={alocando === p.id ? 'Alocando…' : 'Alocar em turma'} />
                  </SelectTrigger>
                  <SelectContent>
                    {turmasAbertas.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NovaTurmaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [nome, setNome] = useState(nomeMesAtual());
  const [data1, setData1] = useState('');
  const [data2, setData2] = useState('');
  const [saving, setSaving] = useState(false);
  const salvar = async () => {
    if (!nome.trim()) { toast.error('Informe o nome da turma'); return; }
    setSaving(true);
    try {
      const r = await nextApi.turmas.create({ nome: nome.trim(), encontros: [{ numero: 1, data: data1 || null }, { numero: 2, data: data2 || null }] });
      const n = r?.puxados_da_espera || 0;
      toast.success(n > 0 ? `Turma aberta · ${n} da lista de espera incluído(s)` : 'Turma aberta');
      onCreated();
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar turma'); }
    setSaving(false);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Abrir turma do Next</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Julho 2026 · Turma 1" />
            <p className="text-[11px] text-muted-foreground mt-1">Pode ter mais de uma turma aberta (ex.: 2 por mês — 1º/2º domingo e 3º/4º domingo). A lista de espera entra automaticamente só quando esta for a única turma aberta; com mais de uma, você organiza quem vai em cada uma.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>1º encontro</Label><Input type="date" value={data1} onChange={e => setData1(e.target.value)} /></div>
            <div><Label>2º encontro</Label><Input type="date" value={data2} onChange={e => setData2(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Abrir turma</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Card de resumo amigável (usado na contabilização da turma).
function StatCard({ label, value, sub, color, icon: Icon }: { label: string; value: number; sub?: string; color: string; icon?: any }) {
  return (
    <div className="rounded-xl border border-border p-3 flex flex-col gap-0.5" style={{ background: color + '0f' }}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" style={{ color }} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-2xl font-bold leading-none" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function TurmaDetalheModal({ turmaId, onClose, onChanged }: { turmaId: string; onClose: () => void; onChanged: () => void }) {
  const [det, setDet] = useState<TurmaDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [qrSatisfacaoOpen, setQrSatisfacaoOpen] = useState(false);
  const [transferir, setTransferir] = useState<Matricula | null>(null);
  const [ordem, setOrdem] = useState<'nome' | 'recentes'>('nome');
  const load = useCallback(async () => {
    setLoading(true);
    try { setDet(await nextApi.turmas.get(turmaId)); } catch (e: any) { toast.error(e?.message || 'Erro'); }
    setLoading(false);
  }, [turmaId]);
  useEffect(() => { load(); }, [load]);

  const present: Record<string, Set<string>> = {};
  (det?.encontros || []).forEach(e => { present[e.id] = new Set(); });
  (det?.presencas || []).forEach(p => { if (p.presente && present[p.encontro_id]) present[p.encontro_id].add(p.matricula_id); });
  const totalEnc = det?.encontros.length || 0;
  const presCount = (matId: string) => (det?.encontros || []).reduce((n, e) => n + (present[e.id]?.has(matId) ? 1 : 0), 0);

  const togglePresenca = async (encontro: Encontro, matId: string) => {
    if (!det) return;
    const set = new Set(present[encontro.id]);
    if (set.has(matId)) set.delete(matId); else set.add(matId);
    try { await nextApi.encontros.setPresencas(encontro.id, [...set]); await load(); onChanged(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao marcar presença'); }
  };
  const toggleContato = async (m: Matricula) => {
    const feito = !m.contato_em;
    // Atualização otimista (sem recarregar a lista toda · o toggle é frequente).
    setDet(d => d ? { ...d, matriculas: d.matriculas.map(x => x.id === m.id
      ? { ...x, contato_em: feito ? new Date().toISOString() : null } : x) } : d);
    try { await nextApi.matriculas.setContato(m.id, feito); }
    catch (e: any) { toast.error(e?.message || 'Erro ao marcar contato'); load(); }
  };
  const removerMatricula = async (m: Matricula) => {
    const nome = `${m.nome}${m.sobrenome ? ' ' + m.sobrenome : ''}`;
    if (!confirm(`Remover ${nome} desta turma? A pessoa sai da lista (dá pra reinscrever depois).`)) return;
    try {
      await nextApi.matriculas.remove(m.id);
      setDet(d => d ? { ...d, matriculas: d.matriculas.filter(x => x.id !== m.id) } : d);
      toast.success('Pessoa removida da turma.');
      onChanged();
    } catch (e: any) { toast.error(e?.message || 'Erro ao remover'); }
  };
  // Ordenação da lista: por nome (padrão) ou por quem entrou por último (created_at desc).
  const matriculasOrdenadas = [...(det?.matriculas || [])].sort((a, b) => {
    if (ordem === 'recentes') return (b.created_at || '').localeCompare(a.created_at || '');
    return `${a.nome} ${a.sobrenome || ''}`.localeCompare(`${b.nome} ${b.sobrenome || ''}`, 'pt-BR');
  });
  const encerrar = async () => {
    try { await nextApi.turmas.update(turmaId, { status: 'encerrada' }); toast.success('Turma encerrada'); await load(); onChanged(); }
    catch (e: any) { toast.error(e?.message || 'Erro'); }
  };
  const reabrir = async () => {
    try { await nextApi.turmas.update(turmaId, { status: 'aberta' }); toast.success('Turma reaberta'); await load(); onChanged(); }
    catch (e: any) { toast.error(e?.message || 'Erro'); }
  };
  const setData = async (encId: string, data: string) => {
    try { await nextApi.encontros.update(encId, { data: data || null }); await load(); } catch (e: any) { toast.error(e?.message); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col">
        {loading || !det ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto my-12" />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                {det.nome}
                {det.status !== 'aberta' && <Badge variant="outline" className="text-[9px] uppercase">{det.status}</Badge>}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto min-h-0">
            {/* Cards de contabilização · inscritos, presença por semana e únicos (veio ≥1x).
                O % é sempre sobre o total de inscritos (comparecimento). */}
            {(() => {
              const insc = det.matriculas.length;
              const pct = (n: number) => insc > 0 ? Math.round((n / insc) * 100) : 0;
              const unicos = det.matriculas.filter(m => presCount(m.id) >= 1).length;
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  <StatCard label="Inscritos" value={insc} color={C.info} icon={Users} />
                  {[...det.encontros].sort((a, b) => (a.numero || 0) - (b.numero || 0)).map(e => {
                    const n = present[e.id]?.size || 0;
                    return (
                      <StatCard key={e.id} label={`Semana ${e.numero}`}
                        sub={`${e.data ? ymdLocal(e.data) : 'sem data'} · ${pct(n)}% dos inscritos`}
                        value={n} color={C.primary} icon={CalendarDays} />
                    );
                  })}
                  <StatCard label="Vieram ao menos 1x" value={unicos} sub={`${pct(unicos)}% dos inscritos`}
                    color={C.warn} icon={CheckCircle2} />
                </div>
              );
            })()}
            <div className="flex flex-wrap gap-3">
              {det.encontros.map(e => (
                <div key={e.id} className="rounded-lg border border-border p-2.5 flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Encontro {e.numero}</span>
                  <Input type="date" value={e.data || ''} onChange={ev => setData(e.id, ev.target.value)} className="h-8 w-[150px]" />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs mt-1">
              <span className="text-muted-foreground">Ordenar:</span>
              <button onClick={() => setOrdem('nome')}
                className={ordem === 'nome' ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}>
                Nome
              </button>
              <span className="text-muted-foreground">·</span>
              <button onClick={() => setOrdem('recentes')}
                className={ordem === 'recentes' ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}>
                Entraram por último
              </button>
            </div>
            <div className="rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-2 font-medium">Pessoa ({det.matriculas.length})</th>
                    {det.encontros.map(e => (
                      <th key={e.id} className="text-center p-2 font-medium whitespace-nowrap">
                        Enc. {e.numero}<div className="text-[10px] text-muted-foreground font-normal">{ymdLocal(e.data)}</div>
                      </th>
                    ))}
                    <th className="text-center p-2 font-medium">Status</th>
                    <th className="text-center p-2 font-medium whitespace-nowrap">Contato</th>
                    <th className="text-center p-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {matriculasOrdenadas.length === 0 ? (
                    <tr><td colSpan={4 + totalEnc} className="p-4 text-center text-muted-foreground text-xs">Ninguém matriculado ainda.</td></tr>
                  ) : matriculasOrdenadas.map(m => {
                    const n = presCount(m.id);
                    const incompletoFim = totalEnc > 0 && n < totalEnc && det.status === 'encerrada';
                    return (
                      <tr key={m.id} className="border-b border-border last:border-0">
                        <td className="p-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={incompletoFim ? 'text-amber-600' : ''}>{m.nome} {m.sobrenome || ''}</span>
                            {ehNovo(m.created_at) && (
                              <Badge className="text-[9px] px-1.5 py-0 h-4" style={{ background: C.primary, color: '#fff' }}>Novo</Badge>
                            )}
                            {m.telefone ? (
                              <Link to={hrefConversa(m.telefone, msgTurma(`${m.nome}${m.sobrenome ? ' ' + m.sobrenome : ''}`, det.nome, det.encontros))}
                                title="Avisar no WhatsApp (dia dos encontros)"
                                className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:underline shrink-0">
                                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                              </Link>
                            ) : null}
                          </div>
                          {m.telefone && <span className="block text-[11px] text-muted-foreground">{m.telefone}</span>}
                          {m.created_at && (
                            <span className="block text-[11px] text-muted-foreground">Inscreveu-se em {dataHora(m.created_at)}</span>
                          )}
                        </td>
                        {det.encontros.map(e => (
                          <td key={e.id} className="text-center p-2">
                            <input type="checkbox" checked={present[e.id]?.has(m.id) || false} onChange={() => togglePresenca(e, m.id)} className="h-4 w-4 cursor-pointer accent-[#00B39D]" />
                          </td>
                        ))}
                        <td className="text-center p-2">
                          <Badge variant="outline" className="text-[10px]" style={{ color: STATUS_COLOR[m.status], borderColor: STATUS_COLOR[m.status] + '60' }}>{STATUS_LABEL[m.status]}</Badge>
                        </td>
                        <td className="text-center p-2">
                          <label className="inline-flex flex-col items-center gap-0.5 cursor-pointer"
                            title={m.contato_em ? `Contato feito em ${dataHora(m.contato_em)}` : 'Marcar que já fez contato com a pessoa'}>
                            <input type="checkbox" checked={!!m.contato_em} onChange={() => toggleContato(m)} className="h-4 w-4 cursor-pointer accent-[#00B39D]" />
                            {m.contato_em && <span className="text-[9px] text-emerald-600 leading-none">feito</span>}
                          </label>
                        </td>
                        <td className="text-center p-2">
                          <div className="inline-flex items-center gap-1">
                            <button onClick={() => setTransferir(m)} title="Transferir pra outra turma"
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => removerMatricula(m)} title="Remover da turma"
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" style={{ color: C.primary }} /> Formados: {det.matriculas.filter(m => presCount(m.id) >= totalEnc && totalEnc > 0).length}</span>
              <span className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" style={{ color: C.warn }} /> Faltou 1: {det.matriculas.filter(m => presCount(m.id) === totalEnc - 1 && totalEnc > 1).length}</span>
              <span className="flex items-center gap-1"><X className="h-3.5 w-3.5" style={{ color: C.danger }} /> Não foi: {det.matriculas.filter(m => presCount(m.id) === 0).length}</span>
            </div>
            </div>
            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setAddOpen(true)} className="gap-2"><UserPlus className="h-4 w-4" /> Matricular pessoa</Button>
                <Button variant="outline" onClick={() => setQrSatisfacaoOpen(true)} className="gap-2"><Share2 className="h-4 w-4" /> QR de satisfação</Button>
              </div>
              <div className="flex gap-2">
                {det.status === 'aberta' && <Button variant="outline" onClick={encerrar}>Encerrar turma</Button>}
                {det.status === 'encerrada' && <Button variant="outline" onClick={reabrir}>Reabrir turma</Button>}
                <Button onClick={onClose}>Fechar</Button>
              </div>
            </DialogFooter>
            {addOpen && <AddMatriculaModal turmaId={turmaId} onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); load(); onChanged(); }} />}
            {qrSatisfacaoOpen && <QrSatisfacaoModal turmaId={turmaId} turmaNome={det.nome} onClose={() => setQrSatisfacaoOpen(false)} />}
            {transferir && (
              <TransferirTurmaModal
                matricula={transferir}
                turmaAtualId={turmaId}
                onClose={() => setTransferir(null)}
                onDone={() => { setTransferir(null); load(); onChanged(); }}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Transferir a pessoa pra outra turma. Lista as turmas disponíveis (exceto a
// atual · abertas primeiro) e chama o endpoint dedicado (limpa presenças da
// turma antiga e recomeça na destino).
function TransferirTurmaModal({ matricula, turmaAtualId, onClose, onDone }: {
  matricula: Matricula; turmaAtualId: string; onClose: () => void; onDone: () => void;
}) {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [destino, setDestino] = useState<string>('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const lista: Turma[] = await nextApi.turmas.list();
        // exclui a turma atual e as apagadas; abertas no topo, depois por nome
        const opcoes = (lista || [])
          .filter(t => t.id !== turmaAtualId)
          .sort((a, b) => {
            if ((a.status === 'aberta') !== (b.status === 'aberta')) return a.status === 'aberta' ? -1 : 1;
            return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
          });
        setTurmas(opcoes);
      } catch (e: any) { toast.error(e?.message || 'Erro ao carregar turmas'); }
      setCarregando(false);
    })();
  }, [turmaAtualId]);

  const confirmar = async () => {
    if (!destino) return;
    setSalvando(true);
    try {
      const r = await nextApi.matriculas.transferir(matricula.id, destino);
      toast.success(`${matricula.nome} transferido(a) para ${r?.turma_destino_nome || 'a turma'}`);
      onDone();
    } catch (e: any) { toast.error(e?.message || 'Erro ao transferir'); }
    setSalvando(false);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" style={{ color: C.primary }} /> Transferir de turma
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Mover <span className="font-medium text-foreground">{matricula.nome} {matricula.sobrenome || ''}</span> para outra turma.
            As presenças na turma atual são removidas (a pessoa recomeça na turma escolhida).
          </p>
          {carregando ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto my-4" />
          ) : turmas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Não há outra turma para transferir. Crie a turma de destino primeiro.</p>
          ) : (
            <div className="space-y-1.5">
              <Label>Turma de destino</Label>
              <Select value={destino} onValueChange={setDestino}>
                <SelectTrigger><SelectValue placeholder="Selecione a turma" /></SelectTrigger>
                <SelectContent className="z-[1200]">
                  {turmas.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}{t.status !== 'aberta' ? ` (${t.status})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!destino || salvando} className="gap-2">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMatriculaModal({ turmaId, onClose, onAdded }: { turmaId: string; onClose: () => void; onAdded: () => void }) {
  const [f, setF] = useState({ nome: '', sobrenome: '', telefone: '', email: '', cpf: '' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));
  const salvar = async () => {
    if (!f.nome.trim()) { toast.error('Informe o nome'); return; }
    setSaving(true);
    try { await nextApi.matriculas.create({ ...f, turma_id: turmaId }); toast.success('Pessoa matriculada'); onAdded(); }
    catch (e: any) { toast.error(e?.message || 'Erro'); }
    setSaving(false);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Matricular na turma</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nome *</Label><Input value={f.nome} onChange={e => set('nome', e.target.value)} /></div>
            <div><Label>Sobrenome</Label><Input value={f.sobrenome} onChange={e => set('sobrenome', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Telefone</Label><Input value={f.telefone} onChange={e => set('telefone', e.target.value)} /></div>
            <div><Label>E-mail</Label><Input value={f.email} onChange={e => set('email', e.target.value)} /></div>
          </div>
          <div><Label>CPF (opcional)</Label><Input value={f.cpf} onChange={e => set('cpf', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Matricular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// PESSOAS · sub-abas Funil | Curso
//   Funil = quem converteu/entrou e onde está no caminho até o Next (por prazo).
//   Curso = quem passou pelo Next (aula 1/2, concluiu), 1 linha por pessoa.
// ──────────────────────────────────────────────────────────────────────────
function PessoasView() {
  const [sub, setSub] = useState<'funil' | 'curso'>('funil');
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30 w-fit">
        {([['funil', 'Funil'], ['curso', 'Curso']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setSub(v)}
            className={`px-4 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${sub === v ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>
      {sub === 'funil' ? <FunilView /> : <CursoView />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// FUNIL · unificado (convertidos + matrículas · 1 linha por pessoa · por prazo)
// ──────────────────────────────────────────────────────────────────────────
type Pessoa = {
  tipo: 'convertido' | 'externo';
  convertido_id: string | null; matricula_id: string | null;
  nome: string; telefone?: string | null; membro_id?: string | null;
  area?: string | null; data_nsm?: string | null; dias_desde_conversao?: number | null;
  turma_id?: string | null; turma_nome?: string | null;
  next_status: 'formado' | 'matriculado' | 'nao_inscrito' | 'resolvido';
  bucket?: 'no_prazo' | 'vencendo' | 'fora_prazo' | null;
  next_resolucao?: string | null;
  indicou_grupo?: boolean; indicou_servir?: boolean; indicou_batismo?: boolean; indicou_devocional?: boolean;
};
const RESOLUCAO_LABEL: Record<string, string> = {
  contatado: 'Contatado', sem_interesse: 'Sem interesse', encerrado: 'Encerrado',
};
const RESOLUCOES = Object.keys(RESOLUCAO_LABEL);

// Direcionar pros valores (Grupos/Voluntários/Batismo/Devocional) ao fim do Next.
// Aditivo: marcar adiciona; o backend é idempotente (não duplica). Já-direcionados ficam
// travados (checked + disabled) · pra desfazer, fala com a área.
function DirecionarValoresModal({ m, onClose, onDone }: { m: { id: string; nome: string; sobrenome?: string | null; indicou_grupo?: boolean; indicou_servir?: boolean; indicou_batismo?: boolean; indicou_devocional?: boolean }; onClose: () => void; onDone: () => void }) {
  const jaFeito = (flag: string) => !!(m as any)[flag];
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const nomeC = `${m.nome} ${m.sobrenome || ''}`.trim();

  async function save() {
    const destinos = NEXT_VALORES.filter(x => sel[x.v] && !jaFeito(x.flag)).map(x => x.v);
    if (destinos.length === 0) { toast.error('Escolha ao menos um destino novo'); return; }
    setSaving(true);
    try {
      await nextApi.matriculas.direcionar(m.id, destinos);
      toast.success('Direcionado');
      onDone();
    } catch (e: any) { toast.error(e?.message || 'Erro ao direcionar'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Direcionar — {nomeC}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Pra onde a pessoa segue ao fim do Next. Grupos/Voluntários caem na caixa da área;
          Batismo vira inscrição pendente; Devocional registra a escolha.
        </p>
        <div className="space-y-2 py-1">
          {NEXT_VALORES.map(x => {
            const feito = jaFeito(x.flag);
            return (
              <label key={x.v} className={`flex items-center gap-2 text-sm rounded-md border border-border p-2 ${feito ? 'opacity-60' : 'cursor-pointer'}`}>
                <input type="checkbox" disabled={feito} checked={feito || !!sel[x.v]}
                  onChange={e => setSel(s => ({ ...s, [x.v]: e.target.checked }))}
                  className="h-4 w-4 accent-[#00B39D]" />
                {x.l}{feito && <span className="text-[10px] text-muted-foreground">· já direcionado</span>}
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Direcionar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FunilView() {
  const [itens, setItens] = useState<Pessoa[]>([]);
  const [resumo, setResumo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [fStatus, setFStatus] = useState<'todos' | 'nao_inscrito' | 'matriculado' | 'formado' | 'resolvido'>('todos');
  const [fOrigem, setFOrigem] = useState<'todos' | 'convertido' | 'externo'>('todos');
  const [fData, setFData] = useState<'tudo' | '30' | '60' | '90' | '180' | '365'>('tudo');
  const [matricularPessoa, setMatricularPessoa] = useState<Pessoa | null>(null);
  const [direcionarP, setDirecionarP] = useState<Pessoa | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await nextApi.pessoas(); setItens(r.itens || []); setResumo(r.resumo || null); }
    catch (e: any) { toast.error(e?.message || 'Erro ao carregar pessoas'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const resolver = async (p: Pessoa, motivo: string) => {
    if (!p.convertido_id) return;
    try { await nextApi.convertidos.resolver(p.convertido_id, motivo); toast.success('Resolvido'); load(); }
    catch (e: any) { toast.error(e?.message || 'Erro'); }
  };
  const reabrir = async (p: Pessoa) => {
    if (!p.convertido_id) return;
    try { await nextApi.convertidos.desresolver(p.convertido_id); toast.success('Reaberto'); load(); }
    catch (e: any) { toast.error(e?.message || 'Erro'); }
  };

  const filtrada = itens.filter(p => {
    if (fStatus !== 'todos' && p.next_status !== fStatus) return false;
    if (fOrigem !== 'todos' && p.tipo !== fOrigem) return false;
    if (fData !== 'tudo') {
      const lim = Number(fData);
      if (p.dias_desde_conversao == null || p.dias_desde_conversao > lim) return false; // por data de conversão
    }
    if (busca) {
      const q = busca.toLowerCase();
      if (!`${p.nome} ${p.telefone || ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-3">
      {resumo && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill label="Total" v={resumo.total} />
          <Pill label="Formados" v={resumo.formados} color={C.primary} />
          <Pill label="Não inscritos" v={resumo.nao_inscritos} color={C.warn} />
          <Pill label="Fora do prazo" v={resumo.fora_prazo} color={C.gray} />
          <Pill label="Observados" v={resumo.resolvidos} color={C.gray} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30 overflow-x-auto">
          {(['todos', 'nao_inscrito', 'matriculado', 'formado', 'resolvido'] as const).map(s => (
            <button key={s} onClick={() => setFStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap ${fStatus === s ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
              {s === 'todos' ? 'Todos' : s === 'nao_inscrito' ? 'Não inscritos' : s === 'matriculado' ? 'Matriculados' : s === 'formado' ? 'Formados' : 'Observados'}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30">
          {(['todos', 'convertido', 'externo'] as const).map(o => (
            <button key={o} onClick={() => setFOrigem(o)}
              className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap ${fOrigem === o ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
              {o === 'todos' ? 'Todas origens' : o === 'convertido' ? 'Convertidos' : 'Externos'}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30 overflow-x-auto" title="Por data de conversão">
          {([['tudo', 'Tudo'], ['30', '30d'], ['60', '60d'], ['90', '90d'], ['180', '180d'], ['365', '1 ano']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setFData(v)}
              className={`px-2.5 py-1.5 text-xs rounded-lg whitespace-nowrap ${fData === v ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou telefone" className="pl-9" />
        </div>
      </div>

      {!loading && (
        <div className="text-xs text-muted-foreground">
          Mostrando <strong className="text-foreground">{filtrada.length}</strong> de {itens.length} pessoa{itens.length !== 1 ? 's' : ''}
          {fData !== 'tudo' && ` · só convertidos com até ${fData} dias desde a conversão (externos não têm data)`}
        </div>
      )}

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto my-12" />
      ) : filtrada.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">Nenhuma pessoa nesse filtro.</div>
      ) : (
        <div className="rounded-2xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-2.5 font-medium">Nome</th>
                <th className="text-left p-2.5 font-medium">Origem</th>
                <th className="text-left p-2.5 font-medium">Next</th>
                <th className="text-left p-2.5 font-medium">Direcionamento</th>
                <th className="text-right p-2.5 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map((p, i) => (
                <tr key={(p.convertido_id || p.matricula_id || i) + ''} className="border-b border-border last:border-0">
                  <td className="p-2.5">
                    <span className="font-medium">{p.nome}</span>
                    {p.telefone && <span className="block text-[11px] text-muted-foreground">{p.telefone}</span>}
                  </td>
                  <td className="p-2.5">
                    {p.tipo === 'convertido' ? (
                      <div className="flex flex-col">
                        <Badge variant="outline" className="text-[10px] w-fit gap-1" style={{ color: C.primary, borderColor: C.primary + '60' }}>
                          <UserCheck className="h-3 w-3" /> Convertido
                        </Badge>
                        <span className="text-[11px] text-muted-foreground mt-0.5">
                          {p.area || '—'}{p.dias_desde_conversao != null ? ` · há ${p.dias_desde_conversao}d` : ''}
                        </span>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-[10px]" style={{ color: C.gray, borderColor: C.gray + '60' }}>Externo</Badge>
                    )}
                  </td>
                  <td className="p-2.5"><NextStatusCell p={p} /></td>
                  <td className="p-2.5">
                    {p.matricula_id ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        {NEXT_VALORES.filter(x => (p as any)[x.flag]).map(x => (
                          <Badge key={x.v} variant="outline" className="text-[9px]">{x.l}</Badge>
                        ))}
                        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={() => setDirecionarP(p)}>Direcionar</Button>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="p-2.5 text-right">
                    {p.next_status === 'nao_inscrito' && (
                      <div className="inline-flex items-center gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => setMatricularPessoa(p)}>
                          <Sparkles className="h-3.5 w-3.5" /> Matricular
                        </Button>
                        {p.convertido_id && (
                          <Select onValueChange={(v) => resolver(p, v)}>
                            <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue placeholder="Observações" /></SelectTrigger>
                            <SelectContent>{RESOLUCOES.map(r => <SelectItem key={r} value={r}>{RESOLUCAO_LABEL[r]}</SelectItem>)}</SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                    {p.next_status === 'resolvido' && (
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-muted-foreground" onClick={() => reabrir(p)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Reabrir
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {matricularPessoa && (
        <MatricularModal pessoa={matricularPessoa} onClose={() => setMatricularPessoa(null)} onDone={() => { setMatricularPessoa(null); load(); }} />
      )}
      {direcionarP && direcionarP.matricula_id && (
        <DirecionarValoresModal
          m={{ id: direcionarP.matricula_id, nome: direcionarP.nome, indicou_grupo: direcionarP.indicou_grupo, indicou_servir: direcionarP.indicou_servir, indicou_batismo: direcionarP.indicou_batismo, indicou_devocional: direcionarP.indicou_devocional }}
          onClose={() => setDirecionarP(null)}
          onDone={() => { setDirecionarP(null); load(); }}
        />
      )}
    </div>
  );
}

function NextStatusCell({ p }: { p: Pessoa }) {
  if (p.next_status === 'formado')
    return <Badge variant="outline" className="text-[10px] gap-1" style={{ color: C.primary, borderColor: C.primary + '60' }}><GraduationCap className="h-3 w-3" /> Formado{p.turma_nome ? ` · ${p.turma_nome}` : ''}</Badge>;
  if (p.next_status === 'matriculado')
    return <Badge variant="outline" className="text-[10px]" style={{ color: C.info, borderColor: C.info + '60' }}>Matriculado{p.turma_nome ? ` · ${p.turma_nome}` : ''}</Badge>;
  if (p.next_status === 'resolvido')
    return <Badge variant="outline" className="text-[10px]" style={{ color: C.gray, borderColor: C.gray + '60' }}>Obs{p.next_resolucao ? ` · ${RESOLUCAO_LABEL[p.next_resolucao] || p.next_resolucao}` : ''}</Badge>;
  // nao_inscrito
  const fora = p.bucket === 'fora_prazo';
  return (
    <Badge variant="outline" className="text-[10px]" style={{ color: fora ? C.gray : C.warn, borderColor: (fora ? C.gray : C.warn) + '60' }}>
      {fora ? 'Fora do prazo' : 'Sem Next'}{p.dias_desde_conversao != null ? ` · ${p.dias_desde_conversao}d` : ''}
    </Badge>
  );
}

function MatricularModal({ pessoa, onClose, onDone }: { pessoa: Pessoa; onClose: () => void; onDone: () => void }) {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [turmaId, setTurmaId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    nextApi.turmas.list({ status: 'aberta' }).then(setTurmas).catch(() => {});
  }, []);
  const salvar = async () => {
    if (!turmaId) { toast.error('Escolha a turma'); return; }
    setSaving(true);
    try {
      await nextApi.matriculas.create({ turma_id: turmaId, nome: pessoa.nome, telefone: pessoa.telefone || null, membro_id: pessoa.membro_id || null });
      toast.success('Matriculado na turma');
      onDone();
    } catch (e: any) { toast.error(e?.message || 'Erro'); }
    setSaving(false);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Matricular {pessoa.nome}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label>Turma</Label>
          {turmas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma turma aberta. Crie uma turma do mês na aba Turmas.</p>
          ) : (
            <Select value={turmaId} onValueChange={setTurmaId}>
              <SelectTrigger><SelectValue placeholder="Escolha a turma" /></SelectTrigger>
              <SelectContent>{turmas.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !turmaId} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Matricular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// CURSO · 1 linha por pessoa (colapsa re-inscrições) · aula 1/2 · concluiu · sem-CPF
//   O responsável corrige a presença marcando aula 1/2 (override) direto na linha.
//   Uma presença já registrada na turma vem travada (não se desmarca aqui).
// ──────────────────────────────────────────────────────────────────────────
type PessoaCurso = {
  membro_id: string | null; nome: string; cpf?: string | null; telefone?: string | null;
  sem_cpf: boolean; sem_vinculo: boolean; n_matriculas: number; primeira_em?: string | null; dias?: number | null;
  fez_aula1: boolean; fez_aula2: boolean; a1_presenca: boolean; a2_presenca: boolean; a1_manual: boolean; a2_manual: boolean;
  override: boolean; concluiu: boolean; nao_concluiu_90d: boolean;
  status_curso: 'formado' | 'nao_concluiu' | 'em_andamento';
};

function CursoView() {
  const [itens, setItens] = useState<PessoaCurso[]>([]);
  const [resumo, setResumo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [fAula, setFAula] = useState<'todas' | 'a1' | 'a2' | 'ambas'>('todas');
  const [soNaoConcluidos, setSoNaoConcluidos] = useState(false);
  const [vinculando, setVinculando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await nextApi.curso(); setItens(r.itens || []); setResumo(r.resumo || null); }
    catch (e: any) { toast.error(e?.message || 'Erro ao carregar curso'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const vincularPendentes = async () => {
    setVinculando(true);
    try {
      const r = await nextApi.matriculas.backfillMembros();
      toast.success(`Vínculo: ${r.vinculados} ligado(s) + ${r.criados} novo(s)${r.falhas ? ` · ${r.falhas} falha(s)` : ''}`);
      load();
    } catch (e: any) { toast.error(e?.message || 'Erro ao vincular'); }
    setVinculando(false);
  };

  const toggleAula = async (p: PessoaCurso, campo: 'fez_aula1' | 'fez_aula2', val: boolean) => {
    if (!p.membro_id) { toast.error('Pessoa sem vínculo — vincule antes de corrigir a presença'); return; }
    try { await nextApi.pessoaAulas(p.membro_id, { [campo]: val }); load(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); }
  };

  const filtrada = itens.filter(p => {
    if (fAula === 'a1' && !p.fez_aula1) return false;
    if (fAula === 'a2' && !p.fez_aula2) return false;
    if (fAula === 'ambas' && !(p.fez_aula1 && p.fez_aula2)) return false;
    if (soNaoConcluidos && !p.nao_concluiu_90d) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (!`${p.nome} ${p.telefone || ''} ${p.cpf || ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-3">
      {resumo && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill label="Pessoas" v={resumo.total} />
          <Pill label="Formados" v={resumo.formados} color={C.primary} />
          <Pill label="Em andamento" v={resumo.em_andamento} color={C.info} />
          <Pill label="Não concluíram (90d)" v={resumo.nao_concluiu} color={C.warn} />
          <Pill label="Sem CPF" v={resumo.sem_cpf} color={C.gray} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Select value={fAula} onValueChange={(v: any) => setFAula(v)}>
          <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as aulas</SelectItem>
            <SelectItem value="a1">Fez a Aula 1</SelectItem>
            <SelectItem value="a2">Fez a Aula 2</SelectItem>
            <SelectItem value="ambas">As duas</SelectItem>
          </SelectContent>
        </Select>
        <button onClick={() => setSoNaoConcluidos(s => !s)}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${soNaoConcluidos ? 'bg-amber-500/10 border-amber-500/50 text-amber-600' : 'border-border text-muted-foreground hover:text-foreground'}`}>
          Só não concluídos (90d)
        </button>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, telefone ou CPF" className="pl-9" />
        </div>
        {resumo?.sem_vinculo > 0 && (
          <Button variant="outline" size="sm" onClick={vincularPendentes} disabled={vinculando} className="gap-2">
            {vinculando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
            Vincular {resumo.sem_vinculo} sem vínculo
          </Button>
        )}
      </div>

      {!loading && (
        <div className="text-xs text-muted-foreground">
          Mostrando <strong className="text-foreground">{filtrada.length}</strong> de {itens.length} pessoa{itens.length !== 1 ? 's' : ''} · 1 linha por pessoa (re-inscrições colapsadas)
        </div>
      )}

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto my-12" />
      ) : filtrada.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">Ninguém nesse filtro.</div>
      ) : (
        <div className="rounded-2xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-2.5 font-medium">Nome</th>
                <th className="text-center p-2.5 font-medium">Aula 1</th>
                <th className="text-center p-2.5 font-medium">Aula 2</th>
                <th className="text-left p-2.5 font-medium">Status</th>
                <th className="text-left p-2.5 font-medium">CPF</th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map((p, i) => (
                <tr key={(p.membro_id || p.nome) + i} className="border-b border-border last:border-0">
                  <td className="p-2.5">
                    <span className="font-medium">{p.nome}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {p.telefone || '—'}
                      {p.n_matriculas > 1 ? ` · ${p.n_matriculas} inscrições` : ''}
                      {p.dias != null ? ` · há ${p.dias}d` : ''}
                    </span>
                  </td>
                  <td className="text-center p-2.5"><AulaCheck p={p} campo="fez_aula1" pres={p.a1_presenca} onToggle={toggleAula} /></td>
                  <td className="text-center p-2.5"><AulaCheck p={p} campo="fez_aula2" pres={p.a2_presenca} onToggle={toggleAula} /></td>
                  <td className="p-2.5"><CursoStatusBadge p={p} /></td>
                  <td className="p-2.5">
                    {p.sem_cpf
                      ? <Badge variant="outline" className="text-[10px] gap-1" style={{ color: C.warn, borderColor: C.warn + '60' }}><AlertTriangle className="h-3 w-3" /> sem CPF</Badge>
                      : <span className="text-xs text-muted-foreground font-mono">{p.cpf}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AulaCheck({ p, campo, pres, onToggle }: {
  p: PessoaCurso; campo: 'fez_aula1' | 'fez_aula2'; pres: boolean;
  onToggle: (p: PessoaCurso, campo: 'fez_aula1' | 'fez_aula2', val: boolean) => void;
}) {
  const feito = campo === 'fez_aula1' ? p.fez_aula1 : p.fez_aula2;
  const disabled = pres || p.sem_vinculo; // presença real não se desmarca aqui; sem vínculo não permite override
  const title = pres ? 'Presença registrada na turma' : p.sem_vinculo ? 'Sem vínculo — vincule a pessoa antes' : 'Marcar/desmarcar manualmente';
  return (
    <input type="checkbox" checked={feito} disabled={disabled} title={title}
      onChange={e => onToggle(p, campo, e.target.checked)}
      className="h-4 w-4 cursor-pointer accent-[#00B39D] disabled:cursor-not-allowed disabled:opacity-60" />
  );
}

function CursoStatusBadge({ p }: { p: PessoaCurso }) {
  if (p.concluiu)
    return <Badge variant="outline" className="text-[10px] gap-1" style={{ color: C.primary, borderColor: C.primary + '60' }}><GraduationCap className="h-3 w-3" /> Formado</Badge>;
  if (p.nao_concluiu_90d)
    return <Badge variant="outline" className="text-[10px]" style={{ color: C.warn, borderColor: C.warn + '60' }}>Não concluiu</Badge>;
  return <Badge variant="outline" className="text-[10px]" style={{ color: C.info, borderColor: C.info + '60' }}>Em andamento</Badge>;
}

function Pill({ label, v, color }: { label: string; v: number; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1">
      <span className="font-semibold" style={color ? { color } : undefined}>{v ?? 0}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

// Compartilhar a inscrição pública do Next — MESMO link e QR que o módulo antigo usava.
// QR de direcionamento (Fase 2a): UM QR pro Next inteiro · resolve a turma ABERTA do momento.
// Mostra no fim do encontro · a pessoa escaneia, acha o nome e escolhe pra onde vai.
function QrDirecionarModal({ onClose }: { onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [url, setUrl] = useState('');
  const [erro, setErro] = useState('');
  useEffect(() => {
    nextApi.direcionarQr()
      .then((r: any) => {
        const link = `${window.location.origin}/next/direcionar/${r.token}`;
        setUrl(link);
        QRCode.toDataURL(link, { width: 320, margin: 2, color: { dark: '#000000', light: '#ffffff' } }).then(setQrDataUrl).catch(() => {});
      })
      .catch((e: any) => setErro(e?.message || 'Não foi possível gerar o QR'));
  }, []);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Share2 className="h-5 w-5" /> QR de direcionamento</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Um QR só pro Next: ele resolve a <strong>turma aberta do momento</strong>. Mostre na tela no fim do encontro — a pessoa escaneia, acha o nome dela e escolhe pra onde quer ir (Grupos/Voluntários/Batismo).</p>
        {erro ? <p className="text-sm text-destructive text-center py-6">{erro}</p> : (
          <div className="space-y-3">
            {qrDataUrl && <img src={qrDataUrl} alt="QR" className="mx-auto rounded-lg border border-border" style={{ width: 240, height: 240 }} />}
            {url && (
              <div className="flex gap-2">
                <Input value={url} readOnly className="font-mono text-xs" />
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copiado!'); }} className="shrink-0"><Copy className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// QR de satisfação por turma · usa a pesquisa NPS canônica do Next (Satisfação
// do Next) + ?turma=<id>. Mesmo link pra todas as turmas, só muda o parâmetro.
function QrSatisfacaoModal({ turmaId, turmaNome, onClose }: { turmaId: string; turmaNome: string; onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [url, setUrl] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    nextApi.satisfacao()
      .then((r: any) => {
        if (!r?.link_publico_token) { setErro('Pesquisa de satisfação sem link público.'); setLoading(false); return; }
        const link = `${window.location.origin}/nps/publica/${r.link_publico_token}?turma=${turmaId}`;
        setUrl(link);
        QRCode.toDataURL(link, { width: 320, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
          .then(setQrDataUrl).catch(() => {})
          .finally(() => setLoading(false));
      })
      .catch((e: any) => { setErro(e?.message || 'Não foi possível gerar o QR'); setLoading(false); });
  }, [turmaId]);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Share2 className="h-5 w-5" /> Satisfação do Next — {turmaNome}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Mostre este QR no fim do encontro: cada resposta fica ligada a <strong>esta turma</strong>. A análise por turma aparece no módulo NPS.</p>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto my-8" />
        ) : erro ? (
          <p className="text-sm text-destructive text-center py-6">{erro}</p>
        ) : (
          <div className="space-y-3">
            {qrDataUrl && <img src={qrDataUrl} alt="QR de satisfação" className="mx-auto rounded-lg border border-border" style={{ width: 240, height: 240 }} />}
            {url && (
              <div className="flex gap-2">
                <Input value={url} readOnly className="font-mono text-xs" />
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copiado!'); }} className="shrink-0"><Copy className="h-3.5 w-3.5" /></Button>
              </div>
            )}
            <Link to="/nps" className="block text-center text-xs text-primary hover:underline">Ver análise no módulo NPS</Link>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModalCompartilhar({ onClose }: { onClose: () => void }) {
  const url = `${window.location.origin}/next/inscrever`;
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const mensagem = `Você está convidado(a) para o NEXT da CBRio — a porta de entrada da igreja!\n\nInscreva-se: ${url}`;
  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#000000', light: '#ffffff' } }).then(setQrDataUrl).catch(() => {});
  }, [url]);
  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copiado!'); };
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Share2 className="h-5 w-5" /> Compartilhar inscrição no Next</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Link público</Label>
            <div className="flex gap-2 mt-1">
              <Input value={url} readOnly className="font-mono text-xs" />
              <Button size="sm" variant="outline" onClick={() => copy(url)} className="shrink-0 gap-1.5"><Copy className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          {qrDataUrl && (
            <div className="text-center">
              <Label className="text-xs block mb-2">QR code</Label>
              <img src={qrDataUrl} alt="QR Code" className="mx-auto rounded-lg border border-border" style={{ width: 220, height: 220 }} />
              <p className="text-[10px] text-muted-foreground mt-2">Escaneie com a câmera do celular para abrir o formulário</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <a href={whatsappUrl} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#25D366' }}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
            <Button variant="outline" onClick={() => copy(mensagem)} className="gap-2"><Copy className="h-4 w-4" /> Copiar mensagem</Button>
          </div>
          <div className="rounded-xl bg-muted/30 border border-border p-3">
            <p className="text-[11px] text-muted-foreground whitespace-pre-line">{mensagem}</p>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
