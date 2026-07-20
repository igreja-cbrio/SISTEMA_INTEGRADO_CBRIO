// ============================================================================
// Totem Kids · Admin · Sessões, Salas, Estações, Crianças, Auditoria
// ============================================================================
// Uma página com tabs · admin do Kids configura tudo aqui.
// ============================================================================
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Loader2, Plus, Pencil, Trash2, Baby, Calendar, ChevronDown, MapPin, Printer, ShieldAlert, ExternalLink, ArrowLeft, Sparkles, Upload, Download, AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw, Users, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { totemKids, kpis } from '@/api';
import { EtiquetaTesteForm } from '@/pages/ministerial/totemKids/TotemKidsTesteEtiqueta';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatIdadeShort } from '@/pages/ministerial/totemKids/lib/idade';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function TotemKidsAdmin() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const ABAS = ['sessoes', 'salas', 'responsaveis', 'auditoria', 'etiqueta'];
  const abaParam = searchParams.get('aba') || '';
  const aba = ABAS.includes(abaParam) ? abaParam : 'sessoes';
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300">Totem Kids · Configurações</h1>
          <p className="text-sm text-muted-foreground">Sessões, salas e auditoria (overrides + portão de saída).</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="default" size="sm" onClick={() => navigate('/ministerial/kids')} className="bg-pink-600 hover:bg-pink-700">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao Kids
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids/decisoes')}>
            <Sparkles className="h-4 w-4 mr-1" /> Decisões
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids/teste-etiqueta')}>
            <Printer className="h-4 w-4 mr-1" /> Testar etiqueta
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids/painel')}>
            <Calendar className="h-4 w-4 mr-1" /> Painel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open('https://github.com/igreja-cbrio/SISTEMA_INTEGRADO_CBRIO/blob/main/docs/totem-kids-manual.md', '_blank')}>
            <ExternalLink className="h-4 w-4 mr-1" /> Manual (HTML)
          </Button>
        </div>
      </div>

      <TotemKidsConfigTabs aba={aba} onAba={(v) => setSearchParams({ aba: v })} />
    </div>
  );
}

// Abas de configuração reutilizáveis (usadas na página /configuracoes E dentro do
// modo totem do check-in, via engrenagem). Controlado se receber aba/onAba,
// senão gerencia o próprio estado. Inclui a aba "Etiqueta" (teste de impressão).
export function TotemKidsConfigTabs({ aba: abaProp, onAba, abas }: { aba?: string; onAba?: (v: string) => void; abas?: string[] }) {
  // `abas` restringe quais abas aparecem (ex.: a engrenagem do totem mostra só
  // sessoes/etiqueta). Sem `abas`, mostra todas (página de config).
  const mostra = (k: string) => !abas || abas.includes(k);
  const primeira = abas && abas.length ? abas[0] : 'sessoes';
  const [abaLocal, setAbaLocal] = useState(primeira);
  const aba = abaProp ?? abaLocal;
  const setAba = onAba ?? setAbaLocal;
  return (
    <Tabs value={aba} onValueChange={setAba}>
      <TabsList className="flex-wrap">
        {mostra('sessoes') && <TabsTrigger value="sessoes"><Calendar className="h-4 w-4 mr-1" /> Sessões</TabsTrigger>}
        {mostra('salas') && <TabsTrigger value="salas"><MapPin className="h-4 w-4 mr-1" /> Salas</TabsTrigger>}
        {mostra('responsaveis') && <TabsTrigger value="responsaveis"><Users className="h-4 w-4 mr-1" /> Responsáveis</TabsTrigger>}
        {mostra('auditoria') && <TabsTrigger value="auditoria"><ShieldAlert className="h-4 w-4 mr-1" /> Auditoria</TabsTrigger>}
        {mostra('etiqueta') && <TabsTrigger value="etiqueta"><Printer className="h-4 w-4 mr-1" /> Etiqueta</TabsTrigger>}
      </TabsList>
      {mostra('sessoes') && <TabsContent value="sessoes"><AbaSessoes /></TabsContent>}
      {mostra('salas') && <TabsContent value="salas"><AbaSalas /></TabsContent>}
      {mostra('responsaveis') && <TabsContent value="responsaveis"><AbaResponsaveis /></TabsContent>}
      {mostra('auditoria') && <TabsContent value="auditoria"><AbaAuditoria /></TabsContent>}
      {mostra('etiqueta') && <TabsContent value="etiqueta"><div className="space-y-4"><EtiquetaTesteForm /></div></TabsContent>}
    </Tabs>
  );
}

// ─── Aba Sessões · seleção simples por PERÍODO ───────────────────────────────
// Refino 2026-07-13 (Marcos): em vez de abrir/gerir sessão por horário solto, o
// operador vê os cultos de Kids agrupados por período (ex.: "Domingo de manhã")
// e abre/encerra o grupo inteiro num clique. Por baixo continua 1 sessão por
// culto/horário (lastro do painel/frequência) · dá pra expandir e agir por
// horário individual.
function periodoDoHorario(hora?: string): { key: string; rotulo: string; ordem: number } {
  const h = Number(String(hora || '').slice(0, 2)) || 0;
  if (h < 12) return { key: 'manha', rotulo: 'de manhã', ordem: 0 };
  if (h < 18) return { key: 'tarde', rotulo: 'à tarde', ordem: 1 };
  return { key: 'noite', rotulo: 'à noite', ordem: 2 };
}

function AbaSessoes() {
  const [sessoes, setSessoes] = useState<any[]>([]);
  const [cultos, setCultos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null); // key do grupo em ação
  const [expandido, setExpandido] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      // Fecha sessões de dias anteriores antes de listar (lazy · SEM cron) — a
      // config passa a mostrá-las como encerradas e o "Sessão atual" não oferece
      // mais culto de outro dia. Best-effort.
      try { await totemKids.sessoes.encerrarVencidas(); } catch { /* segue */ }
      // Janela de cultos: de HOJE (BRT) até +14 dias. Sessões antigas (dias
      // passados · já abertas e encerradas) NÃO aparecem mais no menu — só
      // confundiam (Marcos 2026-07-15). +14 permite pré-abrir o próximo culto.
      // Só cultos com has_kids (evita AMI/Bridge sem programação infantil).
      const hojeBRT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const fim = new Date(); fim.setDate(fim.getDate() + 14);
      const [s, c] = await Promise.all([
        totemKids.sessoes.list({ limit: 60 }),
        kpis.cultos.list({
          limit: 100,
          data_inicio: hojeBRT,
          data_fim: fim.toISOString().slice(0, 10),
        }).catch(() => []),
      ]);
      setSessoes(s);
      setCultos((c || []).filter((culto: any) => culto.service_type_has_kids === true));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  // Sessão (se houver) de cada culto, indexada por culto_id.
  const sessaoPorCulto: Record<string, any> = {};
  for (const s of sessoes) if (s.culto_id) sessaoPorCulto[s.culto_id] = s;

  // Agrupa os cultos da janela por (data + período do dia).
  const grupos = (() => {
    const mapa = new Map<string, { key: string; data: string; periodo: ReturnType<typeof periodoDoHorario>; cultos: any[] }>();
    for (const c of cultos) {
      if (!c.data) continue;
      const p = periodoDoHorario(c.hora);
      const key = `${c.data}__${p.key}`;
      if (!mapa.has(key)) mapa.set(key, { key, data: c.data, periodo: p, cultos: [] });
      mapa.get(key)!.cultos.push(c);
    }
    return Array.from(mapa.values())
      .map(g => ({ ...g, cultos: g.cultos.sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || ''))) }))
      .sort((a, b) => a.data.localeCompare(b.data) || a.periodo.ordem - b.periodo.ordem);
  })();

  function rotuloGrupo(g: { data: string; periodo: { rotulo: string } }): string {
    const dia = format(new Date(g.data + 'T00:00:00'), 'EEEE', { locale: ptBR });
    return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${g.periodo.rotulo}`;
  }

  // Períodos de HOJE (BRT) · alvo do "Sessão atual" (trocar manhã ↔ noite).
  const hojeBRT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const periodosHoje = grupos.filter((g) => g.data === hojeBRT);

  async function abrirGrupo(g: any) {
    setProcessando(g.key);
    try {
      for (const c of g.cultos) await totemKids.sessoes.garantir(c.id);
      toast.success(`${rotuloGrupo(g)} · sessões abertas`);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao abrir as sessões');
    } finally { setProcessando(null); }
  }

  async function encerrarGrupo(g: any) {
    const abertas = g.cultos.map((c: any) => sessaoPorCulto[c.id]).filter((s: any) => s && s.status === 'aberta');
    if (!abertas.length) return;
    if (!confirm(`Encerrar ${rotuloGrupo(g)}? Os KPIs de Kids serão consolidados.`)) return;
    setProcessando(g.key);
    try {
      for (const s of abertas) await totemKids.sessoes.encerrar(s.id);
      toast.success('Encerrado · KPIs consolidados');
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao encerrar');
    } finally { setProcessando(null); }
  }

  // Troca a sessão do totem pra um período de HOJE: abre o escolhido e ENCERRA
  // os outros abertos (consolida + baixa). "Trocar de verdade" (Marcos 2026-07-15).
  async function trocarPeriodo(g: any) {
    setProcessando(g.key);
    try {
      await totemKids.sessoes.trocarPeriodo(g.cultos.map((c: any) => c.id));
      toast.success(`Sessão do totem: ${rotuloGrupo(g)}`);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao trocar a sessão');
    } finally { setProcessando(null); }
  }

  async function encerrarUma(id: string) {
    if (!confirm('Encerrar essa sessão? KPIs serão consolidados.')) return;
    try { await totemKids.sessoes.encerrar(id); toast.success('Encerrada'); await carregar(); }
    catch (e: any) { toast.error(e?.message || 'Erro'); }
  }
  async function abrirUma(cultoId: string) {
    try { await totemKids.sessoes.garantir(cultoId); toast.success('Sessão aberta'); await carregar(); }
    catch (e: any) { toast.error(e?.message || 'Erro'); }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center gap-2">
          <div className="text-sm text-muted-foreground">Cultos de Kids · escolha o período pra abrir ou encerrar a sessão</div>
          <Button onClick={carregar} size="sm" variant="outline"><RefreshCw className="h-4 w-4 mr-1" /> Atualizar</Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Abra o período (ex.: <b>Domingo de manhã</b>) — os cultos do período ficam disponíveis. No check-in, o voluntário escolhe em qual culto a criança fica.
        </p>

        {/* Sessão atual do totem · trocar entre os períodos de HOJE (ex.: manhã →
            noite). Só aparece quando há +de um período hoje. Trocar ENCERRA o
            período anterior (consolida + baixa) e abre o escolhido. */}
        {periodosHoje.length > 1 && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="text-sm font-medium">Sessão atual do totem</div>
            <p className="text-xs text-muted-foreground">Toque no período de hoje que o totem deve usar. O período anterior é encerrado (consolida os números + baixa quem ficou) e o escolhido abre.</p>
            <div className="flex flex-wrap gap-2">
              {periodosHoje.map((g) => {
                const total = g.cultos.length;
                const abertas = g.cultos.filter((c: any) => sessaoPorCulto[c.id]?.status === 'aberta').length;
                const ativa = total > 0 && abertas === total;
                return (
                  <Button key={g.key} size="sm" variant={ativa ? 'default' : 'outline'}
                    className={ativa ? 'bg-pink-600 hover:bg-pink-700' : ''}
                    disabled={processando === g.key} onClick={() => trocarPeriodo(g)}>
                    {processando === g.key ? <Loader2 className="h-4 w-4 animate-spin" /> : rotuloGrupo(g)}
                    {ativa ? <span className="ml-1 text-[10px] uppercase tracking-wide">· atual</span> : null}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {carregando ? (
          <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-6" />
        ) : grupos.length === 0 ? (
          <div className="text-muted-foreground text-center py-6 text-sm">
            Nenhum culto de Kids nesta janela (últimos 7 · próximos 14 dias).
            <br />
            <Button variant="link" className="text-pink-600" onClick={() => window.open('/integracao?aba=cultos', '_blank')}>
              Abrir /integração para cadastrar cultos
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {grupos.map(g => {
              const itens = g.cultos.map((c: any) => ({ culto: c, sessao: sessaoPorCulto[c.id] }));
              const total = itens.length;
              const abertas = itens.filter((x: any) => x.sessao?.status === 'aberta').length;
              const statusRotulo = abertas === 0 ? 'nenhuma aberta' : abertas === total ? 'aberta' : `${abertas}/${total} abertas`;
              const emProc = processando === g.key;
              return (
                <div key={g.key} className="flex items-center justify-between border rounded-lg p-3 gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{rotuloGrupo(g)}</div>
                    <div className="text-xs text-muted-foreground truncate">{format(new Date(g.data + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={abertas === 0 ? 'outline' : abertas === total ? 'default' : 'secondary'}>{statusRotulo}</Badge>
                    {abertas < total && (
                      <Button size="sm" className="bg-pink-600 hover:bg-pink-700" disabled={emProc} onClick={() => abrirGrupo(g)}>
                        {emProc ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Abrir'}
                      </Button>
                    )}
                    {abertas > 0 && (
                      <Button size="sm" variant="outline" disabled={emProc} onClick={() => encerrarGrupo(g)}>Encerrar</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Aba Salas ───────────────────────────────────────────────────────────────
function AbaSalas() {
  const [salas, setSalas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<any>(null);

  async function carregar() {
    setCarregando(true);
    try { setSalas(await totemKids.salas.list()); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  function abrir(s?: any) {
    setEditando(s || { nome: '', faixa_etaria_min_meses: 0, faixa_etaria_max_meses: 156, capacidade: 30, cor: '#EC4899', ativo: true, ordem: salas.length + 1 });
    setModalAberto(true);
  }

  async function salvar() {
    if (!editando.nome?.trim()) return toast.error('Nome obrigatório');
    try {
      if (editando.id) {
        await totemKids.salas.update(editando.id, editando);
      } else {
        await totemKids.salas.create(editando);
      }
      toast.success('Sala salva');
      setModalAberto(false);
      carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  }

  async function excluir(s: any) {
    if (!window.confirm(`Excluir a sala "${s.nome}" permanentemente? Esta ação não pode ser desfeita.`)) return;
    try {
      await totemKids.salas.remove(s.id);
      toast.success('Sala excluída');
      carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao excluir sala');
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">Salas do Kids · nome, <b>faixa de idade</b> e capacidade</div>
          <Button onClick={() => abrir()} size="sm" className="bg-pink-600 hover:bg-pink-700">
            <Plus className="h-4 w-4 mr-1" /> Nova sala
          </Button>
        </div>
        {carregando ? <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-6" /> : (
          <div className="space-y-2">
            {salas.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="h-4 w-4 rounded-full" style={{ background: s.cor }} />
                  <div>
                    <div className="font-medium">{s.nome} {!s.ativo && <Badge variant="outline">inativa</Badge>}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatIdadeShort(s.faixa_etaria_min_meses)}–{formatIdadeShort(s.faixa_etaria_max_meses)} · cap {s.capacidade}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => abrir(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => excluir(s)} title="Excluir sala">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Dialog open={modalAberto} onOpenChange={(o) => !o && setModalAberto(false)}>
          <DialogContent className="z-[1100]">
            <DialogHeader><DialogTitle>{editando?.id ? 'Editar sala' : 'Nova sala'}</DialogTitle></DialogHeader>
            {editando && (
              <div className="space-y-2">
                <Input placeholder="Nome (ex: Berçário)" value={editando.nome} onChange={e => setEditando({ ...editando, nome: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium">Idade mínima</label>
                    <div className="flex items-end gap-1.5 mt-0.5">
                      <div className="flex-1">
                        <Input type="number" min={0} value={Math.floor((editando.faixa_etaria_min_meses || 0) / 12)}
                          onChange={e => setEditando({ ...editando, faixa_etaria_min_meses: (Number(e.target.value) || 0) * 12 + ((editando.faixa_etaria_min_meses || 0) % 12) })} />
                        <span className="text-[10px] text-muted-foreground">anos</span>
                      </div>
                      <div className="flex-1">
                        <Input type="number" min={0} max={11} value={(editando.faixa_etaria_min_meses || 0) % 12}
                          onChange={e => setEditando({ ...editando, faixa_etaria_min_meses: Math.floor((editando.faixa_etaria_min_meses || 0) / 12) * 12 + Math.min(11, Math.max(0, Number(e.target.value) || 0)) })} />
                        <span className="text-[10px] text-muted-foreground">meses</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Idade máxima</label>
                    <div className="flex items-end gap-1.5 mt-0.5">
                      <div className="flex-1">
                        <Input type="number" min={0} value={Math.floor((editando.faixa_etaria_max_meses || 0) / 12)}
                          onChange={e => setEditando({ ...editando, faixa_etaria_max_meses: (Number(e.target.value) || 0) * 12 + ((editando.faixa_etaria_max_meses || 0) % 12) })} />
                        <span className="text-[10px] text-muted-foreground">anos</span>
                      </div>
                      <div className="flex-1">
                        <Input type="number" min={0} max={11} value={(editando.faixa_etaria_max_meses || 0) % 12}
                          onChange={e => setEditando({ ...editando, faixa_etaria_max_meses: Math.floor((editando.faixa_etaria_max_meses || 0) / 12) * 12 + Math.min(11, Math.max(0, Number(e.target.value) || 0)) })} />
                        <span className="text-[10px] text-muted-foreground">meses</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">
                  Ex.: Berçário 0 anos 6 meses a 1 ano 11 meses · Maternal 2 a 3 anos. A criança é sugerida pra sala pela idade no check-in.
                </p>
                <div>
                  <label className="text-xs">Capacidade</label>
                  <Input type="number" value={editando.capacidade} onChange={e => setEditando({ ...editando, capacidade: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs">Cor da sala</label>
                  <div className="mt-1">
                    <ColorPicker value={editando.cor} onChange={(hex) => setEditando({ ...editando, cor: hex })} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs flex items-center gap-2">
                    <input type="checkbox" checked={editando.ativo} onChange={e => setEditando({ ...editando, ativo: e.target.checked })} />
                    Ativa
                  </label>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
                    <Button onClick={salvar} className="bg-pink-600 hover:bg-pink-700">Salvar</Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── Aba Crianças ────────────────────────────────────────────────────────────
function AbaCriancas() {
  const [criancas, setCriancas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [modalImport, setModalImport] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try { setCriancas(await totemKids.criancas.list()); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  async function sincronizarPco() {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const r: any = await totemKids.criancas.syncPco();
      toast.success(`Planning Center sincronizado · ${r.criadas} novas, ${r.atualizadas} atualizadas (${r.criancas_no_pco} crianças no PCO)`);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao sincronizar com o Planning Center');
    } finally {
      setSincronizando(false);
    }
  }

  const filtradas = busca.trim().length >= 2
    ? criancas.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()))
    : criancas;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2 items-center flex-wrap">
          <Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-xs" />
          <span className="text-sm text-muted-foreground">
            {filtradas.length} de {criancas.length}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={sincronizarPco} disabled={sincronizando}>
              {sincronizando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              {sincronizando ? 'Sincronizando…' : 'Sincronizar Planning Center'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setModalImport(true)}>
              <Upload className="h-4 w-4 mr-1" /> Importar XLSX
            </Button>
          </div>
        </div>
        <ImportarCriancasModal open={modalImport} onClose={() => setModalImport(false)} onImportado={carregar} />
        {carregando ? <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-6" /> : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filtradas.map(c => (
              <button
                type="button"
                key={c.id}
                onClick={() => setDetalheId(c.id)}
                className="w-full flex items-center gap-3 p-3 border rounded-lg text-left hover:bg-muted/40 transition cursor-pointer"
              >
                {c.foto_url ? (
                  <img data-foto-avatar="" src={c.foto_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center">
                    <Baby className="h-5 w-5 text-pink-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.nome} {c.visitante && <Badge variant="secondary" className="ml-1 text-xs">visitante</Badge>}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.idade_label || '?'} ·
                    {c.responsaveis?.[0]?.membro?.nome ? ` resp: ${c.responsaveis[0].membro.nome}` : ' sem responsável'}
                    {c.observacoes_medicas && ' · ⚠ obs médica'}
                  </div>
                </div>
              </button>
            ))}
            {filtradas.length === 0 && (
              <p className="text-muted-foreground text-center py-6">Nenhuma criança</p>
            )}
          </div>
        )}
        <DetalheCriancaModal id={detalheId} onClose={() => setDetalheId(null)} />
      </CardContent>
    </Card>
  );
}

// ─── Modal de detalhe da criança (dados + responsáveis + histórico) ──────────
function DetalheCriancaModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [crianca, setCrianca] = useState<any>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!id) { setCrianca(null); setHistorico([]); return; }
    let vivo = true;
    setCarregando(true);
    Promise.all([
      totemKids.criancas.get(id).catch(() => null),
      totemKids.criancas.historico(id).catch(() => []),
    ]).then(([c, h]) => {
      if (!vivo) return;
      setCrianca(c);
      setHistorico(Array.isArray(h) ? h : []);
    }).finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [id]);

  const fmtData = (d?: string | null) => {
    if (!d) return '—';
    try { return new Date(d.length <= 10 ? d + 'T00:00:00' : d).toLocaleDateString('pt-BR'); } catch { return d; }
  };

  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Baby className="h-5 w-5 text-pink-500" />
            {crianca?.nome || 'Detalhe da criança'}
            {crianca?.visitante && <Badge variant="secondary" className="text-xs">visitante</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
        {carregando ? (
          <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-8" />
        ) : !crianca ? (
          <p className="text-muted-foreground text-center py-6">Não foi possível carregar.</p>
        ) : (
          <div className="space-y-4 text-sm">
            {/* Dados */}
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Idade:</span> {crianca.idade_label || '—'}</div>
              <div><span className="text-muted-foreground">Nascimento:</span> {fmtData(crianca.data_nascimento)}</div>
              <div><span className="text-muted-foreground">Sexo:</span> {crianca.sexo || '—'}</div>
              <div><span className="text-muted-foreground">Família:</span> {crianca.familia?.nome || '—'}</div>
            </div>
            {crianca.observacoes_medicas && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
                <div className="font-medium text-amber-700 dark:text-amber-400">⚠ Observações médicas</div>
                <div>{crianca.observacoes_medicas}</div>
              </div>
            )}
            {crianca.necessidades_especiais && (
              <div><span className="text-muted-foreground">Necessidades especiais:</span> {crianca.necessidades_especiais}</div>
            )}

            {/* Responsáveis */}
            <div>
              <div className="font-medium mb-1">Responsáveis ({crianca.responsaveis?.length || 0})</div>
              {crianca.responsaveis?.length ? (
                <div className="space-y-1.5">
                  {crianca.responsaveis.map((r: any) => (
                    <div key={r.id || r.membro_id} className="rounded-lg border p-2.5">
                      <div className="font-medium">{r.membro?.nome || '—'} {r.parentesco && <span className="text-xs text-muted-foreground">· {r.parentesco}</span>}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.membro?.telefone || 'sem telefone'}
                        {r.autorizado_buscar && ' · autorizado a buscar'}
                        {r.contato_emergencia && ' · contato de emergência'}
                      </div>
                      {r.observacao && <div className="text-xs mt-0.5">{r.observacao}</div>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-muted-foreground">Sem responsável vinculado.</p>}
            </div>

            {/* Histórico de check-in */}
            <div>
              <div className="font-medium mb-1">Histórico de check-in ({historico.length})</div>
              {historico.length ? (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {historico.map((h: any, i: number) => (
                    <div key={h.id || i} className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs">
                      <span>{fmtData(h.data_culto || h.data)} {h.sala_nome && <span className="text-muted-foreground">· {h.sala_nome}</span>}</span>
                      <span className="text-muted-foreground">{h.culto_nome || h.sessao_nome || ''}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-muted-foreground">Nenhum check-in registrado.</p>}
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal de Importação XLSX ────────────────────────────────────────────────
function ImportarCriancasModal({ open, onClose, onImportado }: { open: boolean; onClose: () => void; onImportado: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [resultado, setResultado] = useState<any>(null);

  useEffect(() => {
    if (open) {
      setArquivo(null); setPreview(null); setResultado(null);
    }
  }, [open]);

  async function executarPreview() {
    if (!arquivo) return;
    setAnalisando(true);
    setResultado(null);
    try {
      const r = await totemKids.criancas.importar(arquivo, { dryRun: true });
      setPreview(r);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao analisar planilha');
      setPreview({ erro: e?.message, faltando: e?.faltando, colunas_encontradas: e?.colunas_encontradas });
    } finally {
      setAnalisando(false);
    }
  }

  async function executarImport() {
    if (!arquivo) return;
    if (!confirm(`Confirma importar ${preview?.total || '?'} linhas? Não dá pra desfazer em lote.`)) return;
    setImportando(true);
    try {
      const r = await totemKids.criancas.importar(arquivo, { dryRun: false });
      setResultado(r);
      toast.success(`Import OK · ${r.criadas} criadas · ${r.atualizadas} atualizadas · ${r.erros} erros`);
      onImportado();
    } catch (e: any) {
      toast.error(e?.message || 'Erro no import');
    } finally {
      setImportando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar planilha de crianças
          </DialogTitle>
          <DialogDescription>
            Cadastro em massa a partir de XLSX/CSV · idempotente (não duplica) · faz match com
            <code>mem_membros</code> existentes por CPF/telefone do responsável.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-y-auto min-h-0">
          <div className="bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-900 rounded-lg p-3 text-sm">
            <p className="font-semibold mb-1">Colunas esperadas:</p>
            <p className="text-xs text-muted-foreground">
              <b>Obrigatórias</b>: nome_crianca, responsavel_nome, responsavel_telefone<br />
              <b>Recomendadas</b>: data_nascimento, alergia, responsavel_cpf, responsavel_parentesco<br />
              <b>Opcionais</b>: sexo, observacoes, responsavel2_*, ultima_visita
            </p>
            <a
              href="/api/totem-kids/criancas/modelo-importacao"
              className="text-pink-700 dark:text-pink-300 hover:underline text-sm inline-flex items-center gap-1 mt-2"
              target="_blank" rel="noopener"
            >
              <Download className="h-3 w-3" /> Baixar modelo de planilha
            </a>
          </div>

          <div>
            <label className="text-sm font-medium block mb-2">Arquivo (.xlsx, .xls ou .csv)</label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={e => {
                setArquivo(e.target.files?.[0] || null);
                setPreview(null);
                setResultado(null);
              }}
            />
            {arquivo && (
              <p className="text-xs text-muted-foreground mt-1">
                {arquivo.name} · {(arquivo.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>

          {preview?.erro && (
            <div className="bg-red-100 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-lg p-3 text-sm">
              <p className="font-semibold text-red-900 dark:text-red-200 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> {preview.erro}
              </p>
              {preview.faltando && (
                <p className="mt-1">Faltando: <b>{preview.faltando.join(', ')}</b></p>
              )}
              {preview.colunas_encontradas && (
                <p className="text-xs mt-1">Colunas encontradas: {preview.colunas_encontradas.join(', ')}</p>
              )}
            </div>
          )}

          {preview && !preview.erro && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-lg p-3 text-sm space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Planilha válida · {preview.total} linhas
              </p>
              <p className="text-xs">Preview: {preview.preview} ok · {preview.erros} com erro</p>
              {preview.detalhes && preview.erros > 0 && (
                <details className="text-xs mt-2">
                  <summary className="cursor-pointer">Ver erros</summary>
                  <ul className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                    {preview.detalhes.filter((d: any) => d.status === 'erro').slice(0, 20).map((d: any, i: number) => (
                      <li key={i}>Linha {d.linha}: {d.msg}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {resultado && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-800 rounded-lg p-3 text-sm space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Importação concluída
              </p>
              <ul className="text-xs space-y-0.5">
                <li>✅ Criadas: <b>{resultado.criadas}</b></li>
                <li>🔄 Atualizadas: <b>{resultado.atualizadas}</b></li>
                <li>❌ Erros: <b>{resultado.erros}</b></li>
                <li>Total: {resultado.total}</li>
              </ul>
              {resultado.erros > 0 && (
                <details className="text-xs mt-2">
                  <summary className="cursor-pointer">Ver erros</summary>
                  <ul className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                    {resultado.detalhes.filter((d: any) => d.status === 'erro').slice(0, 20).map((d: any, i: number) => (
                      <li key={i}>Linha {d.linha}: {d.msg}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
            {!resultado && (
              <>
                <Button
                  variant="outline"
                  onClick={executarPreview}
                  disabled={!arquivo || analisando}
                >
                  {analisando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Analisar (preview)
                </Button>
                <Button
                  onClick={executarImport}
                  disabled={!arquivo || importando || (preview?.erro)}
                  className="bg-pink-600 hover:bg-pink-700"
                >
                  {importando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Importar
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Aba Auditoria ───────────────────────────────────────────────────────────
// Rótulo + cor de cada resultado do portão (só os anômalos precisam de atenção)
const PORTAO_RESULTADO: Record<string, { label: string; cls: string }> = {
  ok: { label: 'Saída autorizada', cls: 'text-emerald-600' },
  ja_retirada: { label: 'Código já usado', cls: 'text-red-600' },
  fora_de_sessao: { label: 'Etiqueta de culto antigo', cls: 'text-amber-600' },
  nao_reconhecido: { label: 'Código não reconhecido', cls: 'text-amber-600' },
};

function AbaAuditoria() {
  const [overrides, setOverrides] = useState<any[]>([]);
  const [scans, setScans] = useState<any[]>([]);
  const [soAnomalias, setSoAnomalias] = useState(true);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    setCarregando(true);
    try {
      const [ov, sc] = await Promise.all([
        totemKids.auditoria.overrides(),
        totemKids.portao.scans({ limit: 200 }).catch(() => []),
      ]);
      setOverrides(ov);
      setScans(sc || []);
    } finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  const scansVisiveis = soAnomalias ? scans.filter((s) => s.resultado !== 'ok') : scans;

  return (
    <div className="space-y-4">
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm text-muted-foreground">Portão de saída · bips (últimos 200)</div>
          <label className="text-xs flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={soAnomalias} onChange={(e) => setSoAnomalias(e.target.checked)} />
            Só anomalias (código reusado / culto antigo / desconhecido)
          </label>
        </div>
        {carregando ? <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-6" /> : scansVisiveis.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">
            {soAnomalias ? 'Nenhuma anomalia no portão · 👍' : 'Nenhum bip registrado ainda.'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {scansVisiveis.map((s) => {
              const meta = PORTAO_RESULTADO[s.resultado] || { label: s.resultado, cls: 'text-muted-foreground' };
              return (
                <div key={s.id} className="border rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <span className={`font-medium ${meta.cls}`}>{meta.label}</span>
                    <span className="text-muted-foreground"> · código <b className="font-mono">{s.codigo}</b></span>
                    {s.crianca_nome && <span className="text-muted-foreground"> · {s.crianca_nome}</span>}
                    {s.detalhe && <div className="text-xs text-muted-foreground truncate">{s.detalhe}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {s.created_at && format(new Date(s.created_at), 'dd/MM HH:mm')}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="text-sm text-muted-foreground">Overrides realizados (últimos 100)</div>
        {carregando ? <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-6" /> : overrides.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">Nenhum override registrado · 👍</p>
        ) : (
          <div className="space-y-2">
            {overrides.map(o => (
              <div key={o.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-amber-600" />
                      {o.crianca?.nome}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {o.sessao?.culto?.nome} · {o.checkout_at && format(new Date(o.checkout_at), "dd/MM HH:mm")}
                    </div>
                  </div>
                </div>
                <div className="text-sm mt-2">
                  Entregue por: <b>{o.responsavel_checkin_nome}</b>
                  {o.responsavel_checkout_nome && (
                    <> · Buscado por: <b>{o.responsavel_checkout_nome}</b></>
                  )}
                </div>
                {o.override_motivo && (
                  <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded text-sm">
                    <b>Motivo:</b> {o.override_motivo}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}

// ─── Aba Responsáveis · Faxina de vínculos poluídos ──────────────────────────
// O import de 22/05 jogou a família inteira como responsável de cada criança
// (ex.: criança com 18 responsáveis, 13 marcados como "mae"). Esta faxina PODA
// os vínculos que NÃO casam com nenhum guardião real (quem de fato fez o check-in
// da criança no PCO ou no nosso totem), sempre preservando contato de emergência
// e NUNCA removendo o último responsável.
function AbaResponsaveis() {
  const [carregando, setCarregando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [previa, setPrevia] = useState<any>(null);
  const [confirmar, setConfirmar] = useState(false);

  async function gerarPrevia() {
    setCarregando(true);
    setPrevia(null);
    try {
      const r: any = await totemKids.criancas.corrigirResponsaveisPco(false);
      setPrevia(r);
      if ((r?.criancas_afetadas || 0) === 0) toast.info('Nada a limpar · nenhum vínculo fora dos guardiões reais.');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao gerar a prévia');
    } finally {
      setCarregando(false);
    }
  }

  async function aplicar() {
    setAplicando(true);
    try {
      const r: any = await totemKids.criancas.corrigirResponsaveisPco(true);
      setPrevia(r);
      setConfirmar(false);
      toast.success(`Limpeza aplicada · ${r?.vinculos_removidos || 0} vínculo(s) removido(s) em ${r?.criancas_afetadas || 0} criança(s).`);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao aplicar a limpeza');
    } finally {
      setAplicando(false);
    }
  }

  const aplicado = previa?.modo === 'aplicado';
  const nCriancas = previa?.criancas_afetadas || 0;
  const nVinculos = previa?.vinculos_removidos || 0;
  const nRevisar = previa?.total_revisar || 0;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-pink-500" /> Faxina de responsáveis
          </div>
          <p className="text-sm text-muted-foreground">
            Remove os responsáveis que foram vinculados por engano no import (a família
            inteira virou responsável de cada criança). Mantém só quem casa com um
            <b> guardião real</b> — quem de fato fez o check-in da criança no Planning
            Center ou no nosso totem — além de quem está marcado como <b>contato de
            emergência</b>.
          </p>
        </div>

        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs space-y-1">
          <p className="font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" /> Leia antes de aplicar
          </p>
          <ul className="list-disc pl-4 space-y-0.5 text-amber-900/90 dark:text-amber-200/90">
            <li>Só age em crianças com <b>2 ou mais</b> responsáveis e que têm histórico de check-in.</li>
            <li><b>Nunca</b> remove o último responsável — se nenhum casar, a criança não é tocada.</li>
            <li>Contato de emergência é sempre preservado.</li>
            <li>Casos ambíguos (ex.: vários &quot;mãe&quot; sem check-in que os distinga) vão pra <b>revisão manual</b>, não são removidos.</li>
            <li>Aplicar é <b>irreversível</b> (a tabela de vínculos não tem lixeira). Sempre gere a prévia antes.</li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={gerarPrevia} disabled={carregando || aplicando}>
            {carregando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}
            {carregando ? 'Analisando…' : 'Gerar prévia (não altera nada)'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmar(true)}
            disabled={aplicando || carregando || !previa || aplicado || nVinculos === 0}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Aplicar limpeza
          </Button>
        </div>

        {previa && (
          <div className="space-y-3">
            <div className={`rounded-lg border p-3 text-sm ${aplicado ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border bg-muted/30'}`}>
              <p className="font-medium flex items-center gap-1">
                {aplicado ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Eye className="h-4 w-4" />}
                {aplicado ? 'Limpeza aplicada' : 'Prévia (nada foi alterado)'}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 text-xs">
                <div><span className="text-muted-foreground">Crianças afetadas:</span> <b>{nCriancas}</b></div>
                <div><span className="text-muted-foreground">Vínculos {aplicado ? 'removidos' : 'a remover'}:</span> <b>{nVinculos}</b></div>
                <div><span className="text-muted-foreground">Revisar manualmente:</span> <b>{nRevisar}</b></div>
                <div><span className="text-muted-foreground">Check-ins PCO:</span> <b>{previa.checkins_pco_varridos ?? 0}</b>{previa?.fonte?.pco === false && ' (indisponível)'}</div>
                <div><span className="text-muted-foreground">Crianças c/ checker PCO:</span> <b>{previa.criancas_com_checker_pco ?? 0}</b></div>
                <div><span className="text-muted-foreground">Crianças c/ check-in totem:</span> <b>{previa.criancas_com_checkin_local ?? 0}</b></div>
              </div>
            </div>

            {(previa.amostra || []).length > 0 && (
              <div>
                <div className="text-xs font-medium mb-1">Amostra (criança → manter / remover)</div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {previa.amostra.map((p: any, i: number) => (
                    <div key={i} className="rounded-lg border p-2.5 text-xs">
                      <div className="font-medium flex items-center gap-1"><Baby className="h-3.5 w-3.5 text-pink-500" /> {p.crianca}</div>
                      <div className="mt-1 text-emerald-700 dark:text-emerald-400">
                        <b>Manter:</b> {(p.manter || []).join(', ') || '—'}
                      </div>
                      <div className="text-red-600 dark:text-red-400">
                        <b>Remover:</b> {(p.remover || []).join(', ') || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(previa.revisar_manualmente || []).length > 0 && (
              <div>
                <div className="text-xs font-medium mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Revisar manualmente ({nRevisar})
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {previa.revisar_manualmente.map((r: any, i: number) => (
                    <div key={i} className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 p-2.5 text-xs">
                      <div className="font-medium">{r.crianca}</div>
                      {(r.grupos || []).map((g: any, j: number) => (
                        <div key={j} className="text-amber-800 dark:text-amber-300">
                          {g.quantidade}× &quot;{g.parentesco}&quot; sem check-in que os distinga: {(g.nomes || []).join(', ')}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <Dialog open={confirmar} onOpenChange={(o) => !o && setConfirmar(false)}>
          <DialogContent className="z-[1100]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" /> Confirmar limpeza de responsáveis
              </DialogTitle>
              <DialogDescription>
                Esta ação vai remover <b>{nVinculos}</b> vínculo(s) de responsável em
                <b> {nCriancas}</b> criança(s), conforme a prévia acima. A ação é
                <b> irreversível</b>. A criança <b>nunca</b> fica sem responsável e o
                contato de emergência é sempre preservado.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmar(false)} disabled={aplicando}>Cancelar</Button>
              <Button variant="destructive" onClick={aplicar} disabled={aplicando}>
                {aplicando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Aplicar limpeza ({nVinculos})
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
