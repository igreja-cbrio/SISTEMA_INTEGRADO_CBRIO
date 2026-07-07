// ============================================================================
// Totem Kids · Painel ao vivo (mobile-first · pedido da Milena 06/07)
// ============================================================================
// Abre no celular e vê rápido: quantas crianças em cada culto do dia, por sala,
// e ao tocar numa criança abre a ficha dela com o contato dos responsáveis
// (ligar / WhatsApp). Atualiza a cada 15s. Coordenadora encerra a sessão daqui.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { Baby, Users, Loader2, CheckCircle2, ShieldAlert, RefreshCw, PowerOff, AlertTriangle, Heart, ChevronLeft, Phone, MessageCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { totemKids } from '@/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

type CultoDia = {
  culto_id: string;
  sessao_id: string;
  culto_nome: string;
  service_type_name: string | null;
  abrir_em: string | null;
  status: string;
  presentes: number;
  sairam: number;
  decisoes: number;
  total: number;
};

type PainelSala = {
  sessao_id: string;
  culto_id: string;
  data_culto: string;
  culto_nome: string;
  status: string;
  sala_id: string | null;
  sala_nome: string | null;
  sala_cor: string | null;
  capacidade: number | null;
  total_checkins: number;
  criancas_presentes: number;
  criancas_saidas: number;
  decisoes_jesus: number;
  overrides: number;
  ocupacao_pct: number | null;
};

type CriancaNaSala = {
  id: string;
  crianca_id: string;
  checkin_at: string;
  checkout_at: string | null;
  codigo_seguranca: string;
  responsavel_checkin_nome: string;
  fez_decisao_jesus: boolean;
  observacoes_no_dia: string | null;
  total_decisoes_historico: number;
  crianca: {
    id: string;
    nome: string;
    data_nascimento: string | null;
    foto_url: string | null;
    observacoes_medicas: string | null;
    idade_label: string;
  };
};

type Responsavel = {
  id: string;
  parentesco: string | null;
  autorizado_buscar: boolean;
  contato_emergencia: boolean;
  membro: { id: string; nome: string; telefone: string | null; email: string | null } | null;
};
type CriancaDetalhe = {
  id: string;
  nome: string;
  foto_url: string | null;
  idade_label: string;
  observacoes_medicas: string | null;
  tem_alergia: boolean | null;
  alergia_qual: string | null;
  tem_espectro: boolean | null;
  espectro_qual: string | null;
  tem_limitacao_fisica: boolean | null;
  limitacao_fisica_qual: string | null;
  responsaveis: Responsavel[] | null;
};

// Normaliza o telefone pra link (55 + DDD + número, só dígitos).
function digitsTel(tel?: string | null): string | null {
  if (!tel) return null;
  let d = String(tel).replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 11 && !d.startsWith('55')) d = '55' + d;
  return d;
}

export default function TotemKidsPainel() {
  const { isAdmin, modulePerms } = useAuth();
  const navigate = useNavigate();
  const [cultosDia, setCultosDia] = useState<CultoDia[]>([]);
  const [dataDia, setDataDia] = useState<string>('');
  const [cultoSel, setCultoSel] = useState<CultoDia | null>(null);
  const cultoSelRef = useRef<string | null>(null);
  const [dados, setDados] = useState<PainelSala[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [encerrando, setEncerrando] = useState(false);

  // Modal de detalhe da sala + drilldown na criança
  const [salaDetalhe, setSalaDetalhe] = useState<PainelSala | null>(null);
  const [criancasNaSala, setCriancasNaSala] = useState<CriancaNaSala[]>([]);
  const [carregandoSala, setCarregandoSala] = useState(false);
  const [salvandoDecisao, setSalvandoDecisao] = useState<string | null>(null);
  const [criancaSelId, setCriancaSelId] = useState<string | null>(null);
  const [criancaDet, setCriancaDet] = useState<CriancaDetalhe | null>(null);
  const [carregandoCrianca, setCarregandoCrianca] = useState(false);
  // Check-out direto do painel
  const [criancaSelCheckin, setCriancaSelCheckin] = useState<CriancaNaSala | null>(null);
  const [fazendoCheckout, setFazendoCheckout] = useState(false);
  const [overridePainel, setOverridePainel] = useState(false);
  const [overrideMotivoPainel, setOverrideMotivoPainel] = useState('');

  const podeEncerrar = isAdmin || (modulePerms?.kids?.escrita ?? 0) >= 3;
  const podeMarcarDecisao = isAdmin || (modulePerms?.kids?.escrita ?? 0) >= 2;

  async function selecionarCulto(c: CultoDia) {
    cultoSelRef.current = c.culto_id;
    setCultoSel(c);
    setRefreshing(true);
    try {
      const d = await totemKids.painel.aoVivo(c.sessao_id);
      setDados(d);
    } finally {
      setRefreshing(false);
    }
  }

  async function carregar(silent = false) {
    if (!silent) setRefreshing(true);
    try {
      const resp = await totemKids.painel.dia();
      const cultos: CultoDia[] = resp?.cultos || [];
      setCultosDia(cultos);
      setDataDia(resp?.data || '');
      // Mantém a seleção; senão prioriza culto aberto; senão o 1º.
      const sel =
        cultos.find(c => c.culto_id === cultoSelRef.current) ||
        cultos.find(c => c.status === 'aberta') ||
        cultos[0] ||
        null;
      setCultoSel(sel);
      cultoSelRef.current = sel?.culto_id || null;
      if (sel?.sessao_id) {
        const d = await totemKids.painel.aoVivo(sel.sessao_id);
        setDados(d);
      } else {
        setDados([]);
      }
    } finally {
      setCarregando(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    carregar();
    const interval = setInterval(() => carregar(true), 15000);
    return () => clearInterval(interval);
  }, []);

  async function abrirDetalheSala(s: PainelSala) {
    if (!s.sala_id) return;
    setSalaDetalhe(s);
    setCriancaSelId(null);
    setCriancaDet(null);
    setCarregandoSala(true);
    try {
      const lista = await totemKids.painel.sala(s.sala_id, s.sessao_id);
      setCriancasNaSala(lista);
    } finally {
      setCarregandoSala(false);
    }
  }

  async function abrirCrianca(criancaId: string) {
    setCriancaSelId(criancaId);
    setCriancaDet(null);
    setCarregandoCrianca(true);
    try {
      const det = await totemKids.criancas.get(criancaId);
      setCriancaDet(det);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao carregar a criança');
      setCriancaSelId(null);
    } finally {
      setCarregandoCrianca(false);
    }
  }

  async function toggleDecisao(c: CriancaNaSala) {
    if (salvandoDecisao) return;
    const novoValor = !c.fez_decisao_jesus;
    setSalvandoDecisao(c.id);
    try {
      await totemKids.checkin.atualizar(c.id, { fez_decisao_jesus: novoValor });
      setCriancasNaSala(prev => prev.map(x => x.id === c.id ? { ...x, fez_decisao_jesus: novoValor } : x));
      if (novoValor) {
        const sequencia = (c.total_decisoes_historico || 0) + 1;
        const sufixo = sequencia === 1 ? '1ª' : `${sequencia}ª`;
        toast.success(
          sequencia === 1
            ? `${c.crianca.nome} aceitou Jesus · 1ª decisão registrada 🙏`
            : `${c.crianca.nome} renovou a decisão · ${sufixo} vez (já tinha ${sequencia - 1})`,
          { duration: 5000 }
        );
      } else {
        toast.info(`Decisão desmarcada de ${c.crianca.nome}`);
      }
      carregar(true);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro');
    } finally {
      setSalvandoDecisao(null);
    }
  }

  // Check-out da criança direto do painel ao vivo (entrega pra responsável
  // autorizado ou override do supervisor com motivo). Fecha o grupo multi-culto.
  async function fazerCheckoutPainel(metodo: 'responsavel_autorizado' | 'override_supervisor', resp?: Responsavel) {
    if (!criancaSelCheckin || fazendoCheckout) return;
    const payload: Record<string, unknown> = { checkin_id: criancaSelCheckin.id, metodo };
    if (metodo === 'responsavel_autorizado') {
      if (!resp?.membro?.nome) { toast.error('Responsável sem nome'); return; }
      payload.responsavel_id = resp.membro.id;
      payload.responsavel_nome = resp.membro.nome;
    } else {
      if (overrideMotivoPainel.trim().length < 10) { toast.error('Descreva o motivo (mín. 10 caracteres)'); return; }
      payload.override_motivo = overrideMotivoPainel.trim();
      payload.responsavel_nome = 'Retirada autorizada pelo supervisor';
    }
    setFazendoCheckout(true);
    try {
      await totemKids.checkout.realizar(payload);
      toast.success(`Check-out de ${criancaSelCheckin.crianca.nome} registrado`);
      setCriancaSelId(null); setCriancaDet(null); setCriancaSelCheckin(null);
      setOverridePainel(false); setOverrideMotivoPainel('');
      if (salaDetalhe) await abrirDetalheSala(salaDetalhe);
      carregar(true);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao fazer check-out');
    } finally {
      setFazendoCheckout(false);
    }
  }

  // Desfaz um check-out feito sem querer → a criança volta a constar presente.
  async function desfazerCheckoutPainel() {
    if (!criancaSelCheckin || fazendoCheckout) return;
    setFazendoCheckout(true);
    try {
      await totemKids.checkout.desfazer(criancaSelCheckin.id);
      toast.success(`${criancaSelCheckin.crianca.nome} voltou pra sala (check-in refeito)`);
      setCriancaSelId(null); setCriancaDet(null); setCriancaSelCheckin(null);
      if (salaDetalhe) await abrirDetalheSala(salaDetalhe);
      carregar(true);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao refazer o check-in');
    } finally {
      setFazendoCheckout(false);
    }
  }

  async function encerrarSessao() {
    if (!cultoSel) return;
    if (!confirm(`Encerrar a sessão de ${cultoSel.culto_nome}? Vai consolidar ${cultoSel.presentes} criança(s) no culto.`)) return;
    setEncerrando(true);
    try {
      await totemKids.sessoes.encerrar(cultoSel.sessao_id);
      toast.success('Sessão encerrada · KPIs consolidados');
      carregar();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao encerrar');
    } finally {
      setEncerrando(false);
    }
  }

  const totalPresentes = dados.reduce((s, d) => s + (d.criancas_presentes || 0), 0);
  const totalSaidas = dados.reduce((s, d) => s + (d.criancas_saidas || 0), 0);
  const totalDecisoes = dados.reduce((s, d) => s + (d.decisoes_jesus || 0), 0);
  const totalOverrides = dados.reduce((s, d) => s + (d.overrides || 0), 0);

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }

  if (!cultosDia.length) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <button onClick={() => navigate('/kids')} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"><ChevronLeft className="h-4 w-4" /> Voltar ao Kids</button>
        <h1 className="text-xl sm:text-2xl font-bold text-pink-700 dark:text-pink-300">Kids · Painel ao vivo</h1>
        <Card className="mt-4">
          <CardContent className="p-8 text-center">
            <Baby className="h-12 w-12 text-pink-500 mx-auto mb-3" />
            <p>Nenhum culto com Kids hoje.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => carregar()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button onClick={() => navigate('/kids')} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-1"><ChevronLeft className="h-4 w-4" /> Voltar ao Kids</button>
          <h1 className="text-xl sm:text-2xl font-bold text-pink-700 dark:text-pink-300 leading-tight">Kids · Painel ao vivo</h1>
          <p className="text-xs sm:text-sm text-muted-foreground capitalize">
            {dataDia && format(new Date(dataDia + 'T00:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => carregar()} title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          {podeEncerrar && cultoSel?.status === 'aberta' && (
            <Button variant="destructive" size="sm" onClick={encerrarSessao} disabled={encerrando}>
              {encerrando ? <Loader2 className="h-4 w-4 sm:mr-1 animate-spin" /> : <PowerOff className="h-4 w-4 sm:mr-1" />}
              <span className="hidden sm:inline">Encerrar</span>
            </Button>
          )}
        </div>
      </div>

      {/* Cultos do dia · toque pra ver cada culto */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Cultos de hoje</div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {cultosDia.map(c => {
            const ativo = cultoSel?.culto_id === c.culto_id;
            return (
              <button
                key={c.culto_id}
                onClick={() => selecionarCulto(c)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${
                  ativo ? 'border-pink-500 bg-pink-50 dark:bg-pink-950/40' : 'bg-card hover:border-pink-300'
                }`}
                style={{ minWidth: 108 }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold truncate max-w-[120px]">
                    {c.service_type_name || c.culto_nome}
                  </span>
                  {c.status === 'aberta' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" title="Em andamento" />
                  )}
                </div>
                <div className="text-2xl font-bold text-pink-600 leading-tight">{c.presentes}</div>
                <div className="text-[10px] text-muted-foreground">
                  presentes{c.total > c.presentes ? ` · ${c.total} no total` : ''}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Totais do culto selecionado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Card><CardContent className="p-3 sm:p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Presentes</div>
          <div className="text-2xl sm:text-3xl font-bold text-pink-600">{totalPresentes}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 sm:p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Saíram</div>
          <div className="text-2xl sm:text-3xl font-bold">{totalSaidas}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 sm:p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Decisões</div>
          <div className="text-2xl sm:text-3xl font-bold text-emerald-600 flex items-center gap-1">
            {totalDecisoes} {totalDecisoes > 0 && <CheckCircle2 className="h-5 w-5" />}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-3 sm:p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Overrides</div>
          <div className={`text-2xl sm:text-3xl font-bold flex items-center gap-1 ${totalOverrides > 0 ? 'text-amber-600' : ''}`}>
            {totalOverrides} {totalOverrides > 0 && <ShieldAlert className="h-5 w-5" />}
          </div>
        </CardContent></Card>
      </div>

      {/* Salas do culto selecionado */}
      <div className="space-y-2">
        <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" /> Por sala
        </h2>
        {dados.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground">
            Ainda sem check-ins neste culto.
          </CardContent></Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2 sm:gap-3">
            {dados.map(d => (
              <Card
                key={d.sala_id || 'sem-sala'}
                className={d.sala_id ? 'cursor-pointer active:scale-[.99] hover:shadow-md transition' : ''}
                onClick={() => d.sala_id && abrirDetalheSala(d)}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: d.sala_cor || '#888' }} />
                      <span className="font-semibold truncate">{d.sala_nome || '(sem sala)'}</span>
                    </div>
                    <Badge variant={d.ocupacao_pct && d.ocupacao_pct > 90 ? 'destructive' : 'secondary'}>
                      {d.criancas_presentes}{d.capacidade ? `/${d.capacidade}` : ''}
                    </Badge>
                  </div>
                  <div className="flex gap-4 text-xs sm:text-sm text-muted-foreground">
                    <span>Saíram: <b className="text-foreground">{d.criancas_saidas}</b></span>
                    {d.decisoes_jesus > 0 && <span className="text-emerald-600">Decisões: {d.decisoes_jesus}</span>}
                    {d.overrides > 0 && <span className="text-amber-600">Override: {d.overrides}</span>}
                  </div>
                  {d.capacidade && d.ocupacao_pct != null && (
                    <div className="h-2 bg-muted rounded-full overflow-hidden mt-3">
                      <div className="h-full transition-all" style={{ width: `${Math.min(d.ocupacao_pct, 100)}%`, background: d.sala_cor || '#EC4899' }} />
                    </div>
                  )}
                  {d.sala_id && (
                    <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                      Ver crianças <ArrowRight className="h-3 w-3" />
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal · sala → lista de crianças ↔ ficha da criança (drilldown mobile) */}
      <Dialog open={!!salaDetalhe} onOpenChange={(o) => { if (!o) { setSalaDetalhe(null); setCriancaSelId(null); setCriancaDet(null); setCriancaSelCheckin(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          {/* ── Ficha da criança ── */}
          {criancaSelId ? (
            <>
              <DialogHeader className="p-4 pb-2 border-b">
                <DialogTitle className="flex items-center gap-2">
                  <button onClick={() => { setCriancaSelId(null); setCriancaDet(null); setCriancaSelCheckin(null); }} className="text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  Ficha da criança
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto min-h-0 p-4">
                {carregandoCrianca || !criancaDet ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-pink-500" /></div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      {criancaDet.foto_url ? (
                        <img src={criancaDet.foto_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                      ) : (
                        <div className="h-16 w-16 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center">
                          <Baby className="h-8 w-8 text-pink-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-lg font-bold leading-tight">{criancaDet.nome}</p>
                        <p className="text-sm text-muted-foreground">{criancaDet.idade_label}</p>
                      </div>
                    </div>

                    {/* Saúde / atenção */}
                    {(criancaDet.observacoes_medicas || criancaDet.tem_alergia || criancaDet.tem_espectro || criancaDet.tem_limitacao_fisica) && (
                      <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-sm font-semibold">
                          <AlertTriangle className="h-4 w-4" /> Atenção
                        </div>
                        {criancaDet.observacoes_medicas && <p className="text-sm">{criancaDet.observacoes_medicas}</p>}
                        {criancaDet.tem_alergia && <p className="text-sm">Alergia: {criancaDet.alergia_qual || 'sim'}</p>}
                        {criancaDet.tem_espectro && <p className="text-sm">Espectro: {criancaDet.espectro_qual || 'sim'}</p>}
                        {criancaDet.tem_limitacao_fisica && <p className="text-sm">Limitação física: {criancaDet.limitacao_fisica_qual || 'sim'}</p>}
                      </div>
                    )}

                    {/* Responsáveis + contato */}
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Responsáveis</div>
                      {!(criancaDet.responsaveis && criancaDet.responsaveis.length) ? (
                        <p className="text-sm text-muted-foreground">Sem responsável cadastrado.</p>
                      ) : (
                        <div className="space-y-2">
                          {criancaDet.responsaveis.map(r => {
                            const tel = digitsTel(r.membro?.telefone);
                            return (
                              <div key={r.id} className="rounded-lg border p-3">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="min-w-0">
                                    <p className="font-medium truncate">{r.membro?.nome || '—'}</p>
                                    <p className="text-xs text-muted-foreground capitalize">
                                      {r.parentesco || 'responsável'}
                                      {r.autorizado_buscar && ' · pode buscar'}
                                      {r.contato_emergencia && ' · emergência'}
                                    </p>
                                    {r.membro?.telefone && <p className="text-sm mt-0.5">{r.membro.telefone}</p>}
                                  </div>
                                  {tel && (
                                    <div className="flex gap-2 shrink-0">
                                      <a href={`tel:+${tel}`} className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-muted hover:bg-accent" title="Ligar">
                                        <Phone className="h-4 w-4" />
                                      </a>
                                      <a href={`https://wa.me/${tel}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-emerald-500 text-white hover:bg-emerald-600" title="WhatsApp">
                                        <MessageCircle className="h-4 w-4" />
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Fazer check-out direto do painel */}
                    {criancaSelCheckin && (
                      criancaSelCheckin.checkout_at ? (
                        <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-center">
                          <p className="text-sm text-muted-foreground">Esta criança já saiu (check-out feito).</p>
                          <p className="text-xs text-muted-foreground">Foi sem querer? Refaça o check-in:</p>
                          <Button variant="outline" className="w-full" disabled={fazendoCheckout} onClick={desfazerCheckoutPainel}>
                            {fazendoCheckout ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                            Fazer check-in de novo
                          </Button>
                        </div>
                      ) : (
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Fazer check-out</div>
                          <p className="text-xs text-muted-foreground mb-2">Entregue para um responsável autorizado:</p>
                          <div className="space-y-2">
                            {(criancaDet.responsaveis || []).filter(r => r.autorizado_buscar && r.membro).map(r => (
                              <Button key={r.id} variant="outline" className="w-full justify-start h-auto py-3"
                                disabled={fazendoCheckout} onClick={() => fazerCheckoutPainel('responsavel_autorizado', r)}>
                                <CheckCircle2 className="h-5 w-5 mr-2 text-green-600 shrink-0" />
                                <span className="text-left">Entregar para {r.membro?.nome}{r.parentesco ? ` · ${r.parentesco}` : ''}</span>
                              </Button>
                            ))}
                            {!(criancaDet.responsaveis || []).some(r => r.autorizado_buscar && r.membro) && (
                              <p className="text-sm text-muted-foreground">Nenhum responsável autorizado cadastrado — use o override abaixo.</p>
                            )}
                          </div>
                          {!overridePainel ? (
                            <button className="mt-3 text-xs text-amber-700 dark:text-amber-400 inline-flex items-center gap-1 hover:underline"
                              onClick={() => setOverridePainel(true)}>
                              <ShieldAlert className="h-4 w-4" /> Outra pessoa (registrar motivo)
                            </button>
                          ) : (
                            <div className="mt-3 space-y-2 rounded-lg border border-amber-300 dark:border-amber-800 p-3">
                              <textarea value={overrideMotivoPainel} onChange={e => setOverrideMotivoPainel(e.target.value)}
                                placeholder="Motivo (mín. 10 caracteres). Ex.: 'Mãe autorizou pelo WhatsApp que a tia Cláudia busca; conferi a identidade.'"
                                className="w-full rounded-md border border-border bg-background p-2 text-sm min-h-[70px]" />
                              <div className="flex gap-2">
                                <Button variant="ghost" className="flex-1" onClick={() => { setOverridePainel(false); setOverrideMotivoPainel(''); }}>Cancelar</Button>
                                <Button className="flex-1 bg-amber-600 hover:bg-amber-700" disabled={fazendoCheckout || overrideMotivoPainel.trim().length < 10}
                                  onClick={() => fazerCheckoutPainel('override_supervisor')}>
                                  {fazendoCheckout ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check-out com override'}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── Lista de crianças da sala ── */
            <>
              <DialogHeader className="p-4 pb-2 border-b">
                <DialogTitle className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: salaDetalhe?.sala_cor || '#888' }} />
                  {salaDetalhe?.sala_nome}
                  <Badge variant="secondary" className="ml-1">
                    {salaDetalhe?.criancas_presentes} presente{salaDetalhe?.criancas_presentes === 1 ? '' : 's'}
                  </Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto min-h-0 p-4">
                {carregandoSala ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-pink-500" /></div>
                ) : criancasNaSala.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">Sem check-ins nessa sala ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {criancasNaSala.map(c => {
                      const ehDecisaoMarcada = c.fez_decisao_jesus;
                      const sequenciaAtual = ehDecisaoMarcada ? (c.total_decisoes_historico || 1) : (c.total_decisoes_historico || 0) + 1;
                      return (
                        <div
                          key={c.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border ${
                            ehDecisaoMarcada ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800' : 'bg-card'
                          } ${c.checkout_at ? 'opacity-60' : ''}`}
                        >
                          <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => { setCriancaSelCheckin(c); setOverridePainel(false); setOverrideMotivoPainel(''); abrirCrianca(c.crianca_id); }}>
                            {c.crianca.foto_url ? (
                              <img src={c.crianca.foto_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center">
                                <Baby className="h-5 w-5 text-pink-500" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{c.crianca.nome}</span>
                                <span className="text-xs text-muted-foreground">{c.crianca.idade_label} · cod {c.codigo_seguranca}</span>
                                {c.checkout_at && <Badge variant="outline" className="text-xs">saiu</Badge>}
                                {c.crianca.observacoes_medicas && <AlertTriangle className="h-3 w-3 text-amber-600" aria-label={c.crianca.observacoes_medicas} />}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                Trazida por {c.responsavel_checkin_nome} · toque pra ver contato
                              </div>
                            </div>
                          </button>

                          {podeMarcarDecisao && !c.checkout_at && (
                            <Button
                              size="sm"
                              variant={ehDecisaoMarcada ? 'default' : 'outline'}
                              disabled={!!salvandoDecisao}
                              onClick={() => toggleDecisao(c)}
                              className={ehDecisaoMarcada ? 'bg-emerald-600 hover:bg-emerald-700 text-white shrink-0' : 'shrink-0'}
                            >
                              {salvandoDecisao === c.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Heart className={`h-4 w-4 sm:mr-1 ${ehDecisaoMarcada ? 'fill-white' : ''}`} />
                                  <span className="hidden sm:inline">
                                    {ehDecisaoMarcada ? `Sim · ${sequenciaAtual}ª` : c.total_decisoes_historico > 0 ? `Marcar (${c.total_decisoes_historico + 1}ª)` : 'Decisão'}
                                  </span>
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
