// ============================================================================
// Totem Kids · Tela de Check-in (manned)
// ============================================================================
// Voluntário opera. Busca pelo nome da criança, encontra, confirma com a mãe,
// imprime 2 etiquetas (criança + responsável). Equivalente ao PC Check-Ins.
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Baby, Printer, AlertTriangle, Plus, ArrowLeft, Loader2, CheckCircle2, Phone, Settings, LogOut, Sparkles, UserPlus, Tablet, ShieldCheck, Maximize, Lock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from 'sonner';
import { totemKids } from '@/api';
import { TotemKidsConfigTabs } from '@/pages/admin/totemKids/TotemKidsAdmin';
import { formatIdade, formatIdadeShort } from './lib/idade';
import { imprimirEtiquetas } from './lib/imprimir';
import confetti from 'canvas-confetti';
import { getEstacaoPareada } from './lib/estacaoPareada';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Crianca = {
  id: string;
  nome: string;
  data_nascimento: string | null;
  foto_url: string | null;
  observacoes_medicas: string | null;
  tem_espectro: boolean | null;
  espectro_qual: string | null;
  tem_alergia: boolean | null;
  alergia_qual: string | null;
  tem_limitacao_fisica: boolean | null;
  limitacao_fisica_qual: string | null;
  visitante: boolean;
  idade_meses: number | null;
  idade_label: string;
  familia: { id: string; nome: string } | null;
  responsaveis: Array<{
    membro_id: string;
    parentesco: string | null;
    autorizado_buscar: boolean;
    membro: { id: string; nome: string; telefone: string | null; foto_url: string | null } | null;
  }>;
};

type Sala = { id: string; nome: string; cor: string; capacidade: number; faixa_etaria_min_meses: number; faixa_etaria_max_meses: number };
type Sessao = { id: string; culto: { id: string; nome: string; data: string } | null };

// Confete comemorativo ao concluir o check-in da criança.
function dispararConfete() {
  const cores = ['#ec4899', '#00B39D', '#f59e0b', '#8b5cf6', '#3b82f6'];
  try {
    confetti({ particleCount: 90, spread: 72, startVelocity: 42, origin: { y: 0.65 }, colors: cores });
    setTimeout(() => confetti({ particleCount: 45, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: cores }), 120);
    setTimeout(() => confetti({ particleCount: 45, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: cores }), 120);
  } catch { /* sem-op se WebGL/canvas indisponível */ }
}

import { KidsZoneShell, KidsZoneRelogio, KidsZoneToggle } from './KidsZoneShell';

export default function TotemKidsCheckin() {
  const navigate = useNavigate();
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Busca
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Crianca[]>([]);
  const [buscando, setBuscando] = useState(false);

  // Seleção
  const [crianca, setCrianca] = useState<Crianca | null>(null);
  const [salaSelecionada, setSalaSelecionada] = useState<string>('');
  const [responsavelSelecionado, setResponsavelSelecionado] = useState<string>('');
  const [respManualNome, setRespManualNome] = useState('');
  const [respManualTel, setRespManualTel] = useState('');
  const [usarRespManual, setUsarRespManual] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);

  // Pagers (pulseira/coaster entregue a família · opcional)
  const [pagers, setPagers] = useState<any[]>([]);
  const [pagerSelecionado, setPagerSelecionado] = useState<string>('');

  // Multi-culto: outros cultos do dia (com Kids) em que a criança também fica
  const [cultosDia, setCultosDia] = useState<any[]>([]);
  const [cultosExtras, setCultosExtras] = useState<string[]>([]);

  // Modal de cadastro novo
  const [modalNovo, setModalNovo] = useState(false);

  // Pré-check-in pelo app · o responsável preparou no celular e gerou um código
  const [preCodigo, setPreCodigo] = useState('');
  const [preBuscando, setPreBuscando] = useState(false);
  const [preCheckin, setPreCheckin] = useState<{
    pre_checkin_id: string;
    responsavel: { membro_id: string; nome: string; telefone: string | null };
  } | null>(null);
  const [preFila, setPreFila] = useState<string[]>([]);     // crianca_ids ainda não confirmados
  const [preCheckinIds, setPreCheckinIds] = useState<string[]>([]); // checkins já criados

  // Modo totem · trava o tablet em tela cheia; sair exige PIN (como no totem de membros)
  const [totemMode, setTotemMode] = useState(false);
  const [pinModal, setPinModal] = useState(false);
  const [pinSetup, setPinSetup] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinErro, setPinErro] = useState('');

  // Ajustes do totem (engrenagem): Sessões / Config / Testar etiqueta — sem sair do totem.
  const [ajustesOpen, setAjustesOpen] = useState(false);
  const [ajustesAba, setAjustesAba] = useState('sessoes');

  const buscaRef = useRef<HTMLInputElement>(null);

  const PIN_KEY = 'cbrio-totem-kids-pin';

  function abrirAjustes(aba: string = 'sessoes') { setAjustesAba(aba); setAjustesOpen(true); }
  // Recarrega a sessão atual (após mexer em sessões/config pela engrenagem).
  function recarregarSessao() {
    totemKids.sessoes.atual().then((s: any) => {
      setSessao(s);
      if (s?.culto?.data) {
        totemKids.cultosDoDia(String(s.culto.data).slice(0, 10))
          .then((cs: any[]) => setCultosDia((cs || []).filter((c: any) => c.id !== s.culto?.id)))
          .catch(() => setCultosDia([]));
      }
    }).catch(() => {});
    totemKids.salas.list().then(setSalas).catch(() => {});
  }

  function ativarTotem() {
    document.documentElement.requestFullscreen?.().catch(() => {});
    setTotemMode(true);
  }
  function iniciarModoTotem() {
    const stored = localStorage.getItem(PIN_KEY);
    if (!stored) { setPinSetup(true); setPinInput(''); setPinErro(''); setPinModal(true); }
    else ativarTotem();
  }
  function pedirSairTotem() {
    setPinSetup(false); setPinInput(''); setPinErro(''); setPinModal(true);
  }
  function confirmarPin() {
    if (pinSetup) {
      if (pinInput.length < 4) { setPinErro('O PIN precisa ter ao menos 4 dígitos'); return; }
      localStorage.setItem(PIN_KEY, pinInput);
      setPinModal(false); setPinInput('');
      ativarTotem();
    } else {
      const stored = localStorage.getItem(PIN_KEY) || '';
      if (pinInput === stored) {
        setPinModal(false); setPinInput('');
        setTotemMode(false);
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      } else { setPinErro('PIN incorreto'); setPinInput(''); }
    }
  }

  // Carrega sessão atual + salas
  useEffect(() => {
    Promise.all([totemKids.sessoes.atual(), totemKids.salas.list()])
      .then(([s, sl]) => {
        setSessao(s);
        setSalas(sl);
        // Outros cultos do dia (com Kids) pro check-in multi-culto
        if (s?.culto?.data) {
          totemKids.cultosDoDia(String(s.culto.data).slice(0, 10))
            .then((cs: any[]) => setCultosDia((cs || []).filter(c => c.id !== s.culto?.id)))
            .catch(() => setCultosDia([]));
        }
      })
      .finally(() => setCarregando(false));
    carregarPagers();
  }, []);

  // Pagers disponíveis = ativos e não em uso por outra criança agora
  async function carregarPagers() {
    try {
      const [lista, uso] = await Promise.all([
        totemKids.pagers.list({ ativo: 'true' }),
        totemKids.pagers.emUso().catch(() => ({})),
      ]);
      const disponiveis = (lista || []).filter((p: any) => !uso?.[p.id]);
      setPagers(disponiveis);
    } catch { setPagers([]); }
  }

  // Foco no input após limpar seleção
  useEffect(() => {
    if (!crianca) {
      setTimeout(() => buscaRef.current?.focus(), 50);
    }
  }, [crianca]);

  // Busca debounced
  useEffect(() => {
    if (busca.trim().length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(() => {
      totemKids.criancas.buscar(busca.trim())
        .then((data) => setResultados(data))
        .finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  // Sala sugerida (auto-seleciona com base na idade)
  useEffect(() => {
    if (!crianca?.idade_meses) return;
    const sugerida = salas.find(s =>
      s.faixa_etaria_min_meses <= (crianca.idade_meses || 0) &&
      s.faixa_etaria_max_meses >= (crianca.idade_meses || 0)
    );
    if (sugerida) setSalaSelecionada(sugerida.id);
  }, [crianca, salas]);

  // Em modo pré-check-in: pré-seleciona o responsável que preparou no app
  // (só se ele constar como autorizado a buscar a criança · segurança).
  useEffect(() => {
    if (!crianca || !preCheckin) return;
    const resp = (crianca.responsaveis || []).find(
      r => r.membro_id === preCheckin.responsavel.membro_id && r.autorizado_buscar
    );
    if (resp) {
      setResponsavelSelecionado(preCheckin.responsavel.membro_id);
      setUsarRespManual(false);
    }
  }, [crianca, preCheckin]);

  // Voluntário digita/escaneia o código do app → carrega responsável + filhos
  // e enfileira pra confirmar um a um (o check-in real continua manual).
  async function buscarPreCheckin() {
    const cod = preCodigo.trim().toUpperCase();
    if (cod.length < 4) {
      toast.error('Digite o código do app');
      return;
    }
    setPreBuscando(true);
    try {
      const r = await totemKids.preCheckin.buscarCodigo(cod);
      const ids: string[] = (r.criancas || []).map((c: { id: string }) => c.id);
      if (!ids.length) {
        toast.error('Nenhuma criança ativa neste pré-check-in');
        return;
      }
      setPreCheckin({ pre_checkin_id: r.pre_checkin_id, responsavel: r.responsavel });
      setPreCheckinIds([]);
      setPreFila(ids);
      setPreCodigo('');
      toast.success(`Pré-check-in de ${r.responsavel.nome} · ${ids.length} criança(s)`, { duration: 4000 });
      await carregarCriancaDaFila(ids[0]);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Código inválido ou expirado');
    } finally {
      setPreBuscando(false);
    }
  }

  async function carregarCriancaDaFila(criancaId: string) {
    try {
      const c = await totemKids.criancas.get(criancaId);
      setCrianca(c);
    } catch {
      toast.error('Erro ao carregar a criança do pré-check-in');
    }
  }

  // Encerra o modo pré-check-in (concluído ou cancelado) e limpa o estado.
  function encerrarPreCheckin() {
    setPreCheckin(null);
    setPreFila([]);
    setPreCheckinIds([]);
  }

  async function abrirSessao() {
    // Atalho · cria sessão pro culto mais próximo (admin pode usar)
    toast.info('Sessão precisa ser criada na admin de Sessões antes do culto', { duration: 5000 });
  }

  async function confirmarCheckin() {
    if (!sessao || !crianca || !salaSelecionada) {
      toast.error('Falta selecionar sala');
      return;
    }
    if (!usarRespManual && !responsavelSelecionado) {
      toast.error('Selecione o responsável que está trazendo');
      return;
    }
    if (usarRespManual && (!respManualNome.trim() || !respManualTel.trim())) {
      toast.error('Preencha nome e telefone do responsável manual');
      return;
    }

    setImprimindo(true);
    try {
      const estacao = getEstacaoPareada();
      const payload: Record<string, unknown> = {
        sessao_id: sessao.id,
        crianca_id: crianca.id,
        sala_id: salaSelecionada,
        estacao_id: estacao?.id || null,
        pager_id: pagerSelecionado || null,
        cultos_extras: cultosExtras,
      };
      if (usarRespManual) {
        payload.responsavel_nome_manual = respManualNome.trim();
        payload.responsavel_telefone_manual = respManualTel.trim();
        payload.responsavel_parentesco = 'outro';
      } else {
        const resp = crianca.responsaveis.find(r => r.membro_id === responsavelSelecionado);
        payload.responsavel_id = responsavelSelecionado;
        payload.responsavel_parentesco = resp?.parentesco || 'outro';
      }

      const r = await totemKids.checkin.criar(payload);

      // Saúde em destaque na etiqueta
      const alergiaLabel = crianca.tem_alergia ? (crianca.alergia_qual || 'sim') : null;
      const necessidadeLabel = [
        crianca.tem_espectro ? `Espectro${crianca.espectro_qual ? `: ${crianca.espectro_qual}` : ''}` : '',
        crianca.tem_limitacao_fisica ? `Limitação${crianca.limitacao_fisica_qual ? `: ${crianca.limitacao_fisica_qual}` : ''}` : '',
      ].filter(Boolean).join(' · ') || null;
      // Aniversário na semana (próximos 7 dias) → etiqueta personalizada
      const aniversarioSemana = (() => {
        if (!crianca.data_nascimento) return false;
        const mmdd = (dt: Date) => `${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        const hoje = new Date();
        const dias: string[] = [];
        for (let i = 0; i < 7; i++) { const dt = new Date(hoje); dt.setDate(hoje.getDate() + i); dias.push(mmdd(dt)); }
        return dias.includes(String(crianca.data_nascimento).slice(5, 10));
      })();
      const cultoDiaHora = r.sessao.culto?.nome
        ? `${r.sessao.culto.nome}${r.sessao.culto.data ? ` · ${format(new Date(r.sessao.culto.data + 'T00:00:00'), 'dd/MM', { locale: ptBR })}` : ''}`
        : undefined;

      // Dispara impressão
      await imprimirEtiquetas({
        checkinId: r.checkin.id,
        estacaoId: estacao?.id || null,
        crianca: {
          nome: r.crianca.nome,
          idadeLabel: formatIdade(crianca.idade_meses),
          salaNome: r.sala.nome,
          salaCor: r.sala.cor,
          observacoesMedicas: r.crianca.observacoes_medicas,
          alergia: alergiaLabel,
          necessidade: necessidadeLabel,
          fotoAutorizada: !!crianca.foto_url,
          aniversarioSemana,
        },
        responsavel: { nome: r.responsavel.nome },
        codigoSeguranca: r.codigo_seguranca,
        codigoBarras: r.codigo_barras,
        dataHora: format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
        cultoNome: r.sessao.culto?.nome,
        cultoDiaHora,
      });

      toast.success(`${r.crianca.nome} · check-in OK · código ${r.codigo_seguranca}`, { duration: 4000 });
      dispararConfete();

      // Reset
      setCrianca(null);
      setBusca('');
      setSalaSelecionada('');
      setResponsavelSelecionado('');
      setUsarRespManual(false);
      setRespManualNome('');
      setRespManualTel('');
      setPagerSelecionado('');
      setCultosExtras([]);
      setResultados([]);
      carregarPagers();          // o pager usado some da lista de disponíveis

      // Em modo pré-check-in: avança a fila de filhos; ao acabar, marca usado.
      if (preCheckin && crianca) {
        const idsFeitos = [...preCheckinIds, r.checkin.id];
        const restante = preFila.filter(id => id !== crianca.id);
        setPreCheckinIds(idsFeitos);
        setPreFila(restante);
        if (restante.length > 0) {
          toast.info(`Faltam ${restante.length} · próxima criança`, { duration: 3000 });
          await carregarCriancaDaFila(restante[0]);
        } else {
          try {
            await totemKids.preCheckin.consumir(preCheckin.pre_checkin_id, { checkin_ids: idsFeitos });
          } catch { /* não bloqueia o fluxo · o check-in real já foi feito */ }
          toast.success('Pré-check-in concluído · todas as crianças entraram', { duration: 5000 });
          encerrarPreCheckin();
        }
      }
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro no check-in');
    } finally {
      setImprimindo(false);
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }

  // Diálogo de ajustes do totem (engrenagem / clique na sessão) — Sessões, Config
  // e Testar etiqueta, tudo sem sair do totem. Ao fechar, recarrega a sessão.
  const ajustesDialog = (
    <Dialog open={ajustesOpen} onOpenChange={(o) => { setAjustesOpen(o); if (!o) recarregarSessao(); }}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto z-[80]">
        <DialogHeader>
          <DialogTitle>Ajustes do totem</DialogTitle>
          <DialogDescription>Sessões, salas, estações, pagers e teste de etiqueta — sem sair do totem.</DialogDescription>
        </DialogHeader>
        <TotemKidsConfigTabs aba={ajustesAba} onAba={setAjustesAba} />
      </DialogContent>
    </Dialog>
  );

  if (!sessao) {
    return (
      <div className={totemMode ? 'fixed inset-0 z-[60] overflow-y-auto' : ''}>
      <KidsZoneShell fullscreen={totemMode}>
        <div className="text-center py-14 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-3xl shadow-lg shadow-pink-500/30">🧸</div>
          <h1 className="text-2xl font-black tracking-tight">Totem Kids</h1>
          <p className="text-lg text-slate-600">Nenhuma sessão aberta no momento</p>
          <p className="text-sm text-slate-400">Abra uma sessão aqui mesmo pra iniciar o check-in.</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Button onClick={() => abrirAjustes('sessoes')} className="bg-gradient-to-r from-orange-400 to-pink-500 hover:opacity-90 text-white font-bold">
              <Settings className="h-4 w-4 mr-1" /> Gerenciar sessões
            </Button>
            {totemMode ? (
              <Button variant="destructive" onClick={pedirSairTotem}><Lock className="h-4 w-4 mr-1" /> Sair do modo totem</Button>
            ) : (
              <Button variant="outline" onClick={() => navigate('/ministerial/kids')}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao Kids</Button>
            )}
          </div>
        </div>
        {ajustesDialog}
      </KidsZoneShell>
      </div>
    );
  }

  const estacaoPareada = getEstacaoPareada();

  return (
    <div className={totemMode ? 'fixed inset-0 z-[60] overflow-y-auto' : ''}>
    <KidsZoneShell fullscreen={totemMode}>
      {/* Barra do topo · logo, sessão, relógio e alternância check-in/check-out */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 mb-6 border-b border-dashed border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-2xl shadow-lg shadow-pink-500/30">🧸</div>
          <div>
            <p className="text-lg font-black leading-none">Totem Kids</p>
            {/* Sessão atual · clicável pra abrir/fechar/trocar sem sair do totem */}
            <button onClick={() => abrirAjustes('sessoes')} title="Gerenciar sessão (abrir/fechar/trocar)"
              className="text-xs font-medium text-slate-400 tracking-wide inline-flex items-center gap-1 hover:text-pink-600 transition-colors">
              {sessao.culto?.nome}
              {sessao.culto?.data && ` · ${format(new Date(sessao.culto.data + 'T00:00:00'), "EEE, dd/MM", { locale: ptBR })}`}
              <Settings className="h-3 w-3 opacity-60" />
            </button>
            {estacaoPareada ? (
              <Badge variant="secondary" className="mt-1 text-[10px]">
                <Tablet className="h-3 w-3 mr-1" /> {estacaoPareada.nome}
              </Badge>
            ) : (
              <Badge variant="outline" className="mt-1 text-[10px] text-amber-600 border-amber-400">
                <Tablet className="h-3 w-3 mr-1" /> Sem estação pareada
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <KidsZoneRelogio />
          <KidsZoneToggle ativo="checkin" onCheckout={() => navigate('/ministerial/totem-kids/checkout')} />
          {/* Engrenagem discreta · ajustes (sessões, config, etiqueta) sem sair do totem */}
          <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-pink-600" onClick={() => abrirAjustes('sessoes')} title="Ajustes · sessões, configurações e testar etiqueta">
            <Settings className="h-5 w-5" />
          </Button>
          {totemMode ? (
            <Button variant="destructive" size="sm" onClick={pedirSairTotem}>
              <Lock className="h-4 w-4 md:mr-1" /> <span className="hidden md:inline">Sair do modo totem</span>
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/kids')}>
                <ArrowLeft className="h-4 w-4 md:mr-1" /> <span className="hidden md:inline">Kids</span>
              </Button>
              <Button variant="default" size="sm" className="bg-pink-600 hover:bg-pink-700" onClick={iniciarModoTotem}>
                <Maximize className="h-4 w-4 md:mr-1" /> <span className="hidden md:inline">Modo totem</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {ajustesDialog}

      {!crianca ? (
        <div className="space-y-6">
          {/* Título central */}
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Vamos fazer o check-in! 🎈</h1>
            <p className="text-slate-500 mt-2 text-sm sm:text-base">
              Digite o código do app do responsável ou busque a criança pelo nome.
            </p>
          </div>

          {/* Duas colunas: código do app | ou | busca por nome */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1.4fr] gap-6 items-start">
            {/* ESQUERDA · código do app (pré-check-in) */}
            <div className="rounded-2xl border-2 border-slate-100 bg-slate-50/70 p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-orange-100 text-orange-500 flex items-center justify-center text-base">🔑</span>
                <h2 className="font-bold text-slate-700 text-sm sm:text-base">Código do app do responsável</h2>
              </div>
              <Input
                placeholder="EX.: 6UCHWQ"
                value={preCodigo}
                onChange={e => setPreCodigo(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') buscarPreCheckin(); }}
                className="h-16 text-center text-3xl tracking-[0.4em] uppercase font-black text-slate-700 rounded-xl border-2 border-slate-200 bg-white"
                maxLength={8}
                autoCapitalize="characters"
              />
              <Button
                onClick={buscarPreCheckin}
                disabled={preBuscando || !preCodigo.trim()}
                className="w-full h-12 bg-gradient-to-r from-orange-400 to-pink-500 hover:opacity-90 text-white font-bold text-base rounded-xl"
              >
                {preBuscando ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Aplicar código'}
              </Button>
              <p className="text-xs text-slate-400 text-center">
                Confira a criança com o responsável antes de imprimir — a entrada continua presencial.
              </p>
            </div>

            {/* divisor */}
            <div className="hidden lg:flex flex-col items-center self-stretch pt-4">
              <div className="w-px flex-1 bg-slate-200" />
              <span className="my-2 w-10 h-10 rounded-full bg-slate-100 text-slate-400 text-xs font-bold flex items-center justify-center border border-slate-200">ou</span>
              <div className="w-px flex-1 bg-slate-200" />
            </div>
            <div className="flex lg:hidden items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-bold text-slate-400">ou busque pelo nome</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {/* DIREITA · busca por nome */}
            <div className="rounded-2xl border-2 border-slate-100 p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-fuchsia-100 text-fuchsia-500 flex items-center justify-center text-base">🔍</span>
                <h2 className="font-bold text-slate-700 text-sm sm:text-base">Buscar pelo nome da criança</h2>
              </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input
                  ref={buscaRef}
                  placeholder="Ex.: Sofia, Lucas, Helena... ou telefone"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  className="pl-10 h-14 text-lg rounded-xl border-2 border-slate-200 bg-slate-50 focus:bg-white text-slate-700"
                  autoFocus
                />
              </div>
              <Button
                onClick={() => setModalNovo(true)}
                variant="default"
                size="lg"
                className="h-14 bg-pink-600 hover:bg-pink-700 whitespace-nowrap rounded-xl"
              >
                <Plus className="h-5 w-5 mr-1" /> Nova criança
              </Button>
            </div>

            {buscando && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-5 w-5 animate-spin text-pink-500" />
              </div>
            )}

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {resultados.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCrianca(c)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-pink-50 dark:hover:bg-pink-950/30 transition"
                >
                  {c.foto_url ? (
                    <img src={c.foto_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center">
                      <Baby className="h-6 w-6 text-pink-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{c.nome}</span>
                      {c.visitante && <Badge variant="secondary" className="text-xs">visitante</Badge>}
                      {(c.tem_alergia || c.tem_espectro || c.tem_limitacao_fisica) && (
                        <AlertTriangle className="h-4 w-4 text-red-500" aria-label="Atenção · saúde" />
                      )}
                      {c.observacoes_medicas && (
                        <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Observação médica" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.idade_label || '?'} · {c.familia?.nome || 'sem família'}
                    </div>
                  </div>
                </button>
              ))}
              {!buscando && busca.trim().length >= 2 && resultados.length === 0 && (
                <div className="text-center py-6 space-y-3 border-2 border-dashed border-pink-200 dark:border-pink-900 rounded-lg">
                  <p className="text-muted-foreground">Nenhuma criança encontrada com "{busca}"</p>
                  <Button onClick={() => setModalNovo(true)} variant="default" className="bg-pink-600 hover:bg-pink-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Cadastrar "{busca}" como criança nova
                  </Button>
                </div>
              )}
              {!buscando && busca.trim().length < 2 && resultados.length === 0 && (
                <p className="text-center py-6 text-sm text-muted-foreground">
                  Digite o nome da criança ou clique em <b>Nova criança</b> pra cadastrar.
                </p>
              )}
            </div>
            </div>
          </div>

          {/* rodapé de ajuda */}
          <p className="text-center text-xs text-slate-400">
            Precisa de ajuda pra localizar a criança? Chame um voluntário da recepção do Kids. 💛
          </p>
        </div>
      ) : (
        <>
        {preCheckin && (
          <div className="rounded-lg border border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-violet-800 dark:text-violet-200">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>
                Pré-check-in de <b>{preCheckin.responsavel.nome}</b> · faltam <b>{preFila.length}</b> criança(s)
              </span>
            </div>
            <Button variant="ghost" size="sm" className="text-violet-700 dark:text-violet-300" onClick={() => { setCrianca(null); encerrarPreCheckin(); }}>
              Sair do app
            </Button>
          </div>
        )}
        <CheckinSelecao
          crianca={crianca}
          salas={salas}
          salaSelecionada={salaSelecionada}
          setSalaSelecionada={setSalaSelecionada}
          responsavelSelecionado={responsavelSelecionado}
          setResponsavelSelecionado={setResponsavelSelecionado}
          pagers={pagers}
          pagerSelecionado={pagerSelecionado}
          setPagerSelecionado={setPagerSelecionado}
          cultosDia={cultosDia}
          cultosExtras={cultosExtras}
          setCultosExtras={setCultosExtras}
          usarRespManual={usarRespManual}
          setUsarRespManual={setUsarRespManual}
          respManualNome={respManualNome}
          setRespManualNome={setRespManualNome}
          respManualTel={respManualTel}
          setRespManualTel={setRespManualTel}
          onCancelar={() => { setCrianca(null); if (preCheckin) encerrarPreCheckin(); }}
          onConfirmar={confirmarCheckin}
          imprimindo={imprimindo}
          onResponsavelCadastrado={async () => {
            // Recarrega dados da criança (com os responsáveis novos)
            try {
              const fresh = await totemKids.criancas.get(crianca.id);
              setCrianca({ ...crianca, responsaveis: fresh.responsaveis || [] });
            } catch { /* mantem state atual */ }
          }}
        />
        </>
      )}

      <ModalNovaCrianca
        open={modalNovo}
        onClose={() => setModalNovo(false)}
        nomeInicial={busca}
        onCadastrado={(criancaCriada) => {
          setModalNovo(false);
          setCrianca(criancaCriada as Crianca);
          setBusca('');
        }}
      />

      {/* Modo totem · cria/pede PIN */}
      <Dialog open={pinModal} onOpenChange={(o) => { if (!o) { setPinModal(false); setPinInput(''); setPinErro(''); } }}>
        <DialogContent className="max-w-xs z-[80]">
          <DialogHeader>
            <DialogTitle>{pinSetup ? 'Ativar modo totem' : 'Sair do modo totem'}</DialogTitle>
            <DialogDescription>
              {pinSetup
                ? 'Crie um PIN. Ele será pedido pra sair do modo totem (trava o tablet na tela de check-in).'
                : 'Digite o PIN pra sair do modo totem.'}
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmarPin(); }}
            className="text-center text-2xl tracking-widest font-mono h-14"
            maxLength={8}
          />
          {pinErro && <p className="text-sm text-red-500 text-center">{pinErro}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { setPinModal(false); setPinInput(''); setPinErro(''); }}>Cancelar</Button>
            <Button className="flex-1 bg-pink-600 hover:bg-pink-700" onClick={confirmarPin}>
              {pinSetup ? 'Ativar' : 'Sair'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </KidsZoneShell>
    </div>
  );
}

// ── Subcomponente: tela de confirmação após selecionar criança ──
function CheckinSelecao(props: {
  crianca: Crianca;
  salas: Sala[];
  salaSelecionada: string;
  setSalaSelecionada: (s: string) => void;
  responsavelSelecionado: string;
  setResponsavelSelecionado: (s: string) => void;
  pagers: any[];
  pagerSelecionado: string;
  setPagerSelecionado: (s: string) => void;
  cultosDia: any[];
  cultosExtras: string[];
  setCultosExtras: (v: string[]) => void;
  usarRespManual: boolean;
  setUsarRespManual: (b: boolean) => void;
  respManualNome: string;
  setRespManualNome: (s: string) => void;
  respManualTel: string;
  setRespManualTel: (s: string) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
  imprimindo: boolean;
  onResponsavelCadastrado: () => void;
}) {
  const { crianca, salas, salaSelecionada, setSalaSelecionada,
    responsavelSelecionado, setResponsavelSelecionado,
    pagers, pagerSelecionado, setPagerSelecionado,
    cultosDia, cultosExtras, setCultosExtras,
    usarRespManual, setUsarRespManual,
    respManualNome, setRespManualNome, respManualTel, setRespManualTel,
    onCancelar, onConfirmar, imprimindo, onResponsavelCadastrado } = props;

  // Auto-abre modal de cadastro se criança chegar sem responsável
  const [modalCadResp, setModalCadResp] = useState(false);
  useEffect(() => {
    if (crianca.responsaveis.filter(r => r.autorizado_buscar).length === 0) {
      setModalCadResp(true);
    }
  }, [crianca.id, crianca.responsaveis]);

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start gap-4">
          {crianca.foto_url ? (
            <img src={crianca.foto_url} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="h-20 w-20 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center">
              <Baby className="h-10 w-10 text-pink-500" />
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-2xl font-bold">{crianca.nome}</h2>
            <p className="text-muted-foreground">
              {formatIdade(crianca.idade_meses) || 'idade não informada'}
              {crianca.familia?.nome && <> · {crianca.familia.nome}</>}
              {crianca.visitante && <> · <Badge variant="secondary" className="ml-1">visitante</Badge></>}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancelar}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Outra criança
          </Button>
        </div>

        {(crianca.tem_alergia || crianca.tem_espectro || crianca.tem_limitacao_fisica) && (
          <div className="bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div className="space-y-0.5">
              <div className="font-semibold text-red-700 dark:text-red-300">ATENÇÃO · SAÚDE</div>
              {crianca.tem_alergia && <div className="text-sm"><b>Alergia:</b> {crianca.alergia_qual || 'sim'}</div>}
              {crianca.tem_espectro && <div className="text-sm"><b>Espectro autista:</b> {crianca.espectro_qual || 'sim'}</div>}
              {crianca.tem_limitacao_fisica && <div className="text-sm"><b>Limitação física:</b> {crianca.limitacao_fisica_qual || 'sim'}</div>}
            </div>
          </div>
        )}
        {crianca.observacoes_medicas && (
          <div className="bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <div className="font-semibold">ATENÇÃO MÉDICA</div>
              <div className="text-sm">{crianca.observacoes_medicas}</div>
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-2">Sala</label>
          <Select value={salaSelecionada} onValueChange={setSalaSelecionada}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Selecione a sala" />
            </SelectTrigger>
            <SelectContent>
              {salas.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: s.cor }} />
                    {s.nome}
                    <span className="text-muted-foreground text-xs ml-2">
                      ({formatIdadeShort(s.faixa_etaria_min_meses)}–{formatIdadeShort(s.faixa_etaria_max_meses)})
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {pagers.length > 0 && (
          <div>
            <label className="text-sm font-medium block mb-2">
              Pager da família <span className="text-muted-foreground font-normal">(opcional · vibra no pickup)</span>
            </label>
            <Select value={pagerSelecionado || 'nenhum'} onValueChange={(v) => setPagerSelecionado(v === 'nenhum' ? '' : v)}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Sem pager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Sem pager</SelectItem>
                {pagers.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.rotulo || `Pager ${p.numero}`} <span className="text-muted-foreground text-xs ml-1">(nº {p.numero})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {cultosDia.length > 0 && (
          <div>
            <label className="text-sm font-medium block mb-2">
              Fica em mais de um culto? <span className="text-muted-foreground font-normal">(marque os outros · 1 etiqueta só)</span>
            </label>
            <div className="space-y-2">
              {cultosDia.map((c: any) => {
                const marcado = cultosExtras.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCultosExtras(marcado ? cultosExtras.filter(x => x !== c.id) : [...cultosExtras, c.id])}
                    className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${marcado ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}
                  >
                    <span className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 ${marcado ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>
                      {marcado && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="font-medium">{c.nome}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-2">Quem está trazendo</label>
          {!usarRespManual ? (
            <>
              <div className="space-y-2">
                {crianca.responsaveis.filter(r => r.autorizado_buscar).map(r => (
                  <button
                    key={r.membro_id}
                    onClick={() => setResponsavelSelecionado(r.membro_id)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-lg border transition ${
                      responsavelSelecionado === r.membro_id
                        ? 'bg-pink-50 dark:bg-pink-950/30 border-pink-500'
                        : 'bg-card hover:bg-muted'
                    }`}
                  >
                    {r.membro?.foto_url ? (
                      <img src={r.membro.foto_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                        {(r.membro?.nome || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.membro?.nome}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {r.parentesco && <span>{r.parentesco}</span>}
                        {r.membro?.telefone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {r.membro.telefone}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
                {crianca.responsaveis.length === 0 && (
                  <div className="text-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg p-3">
                    <p className="font-semibold mb-1">⚠ Sem responsáveis cadastrados</p>
                    <p className="text-muted-foreground text-xs">
                      Cadastre o responsável agora pra deixar o histórico completo, ou clique em "Outro responsável" pra registrar manualmente.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                <Button
                  variant="default"
                  size="sm"
                  className="bg-pink-600 hover:bg-pink-700"
                  onClick={() => setModalCadResp(true)}
                >
                  <Plus className="h-4 w-4 mr-1" /> Cadastrar responsável
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUsarRespManual(true)}
                >
                  Outro responsável (manual · não cadastra)
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="Nome do responsável"
                value={respManualNome}
                onChange={e => setRespManualNome(e.target.value)}
              />
              <Input
                placeholder="Telefone"
                value={respManualTel}
                onChange={e => setRespManualTel(e.target.value)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setUsarRespManual(false); setRespManualNome(''); setRespManualTel(''); }}
              >
                Voltar à lista
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            size="lg"
            onClick={onConfirmar}
            disabled={imprimindo}
            className="bg-pink-600 hover:bg-pink-700 text-white"
          >
            {imprimindo ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Imprimindo...</>
            ) : (
              <><Printer className="h-5 w-5 mr-2" /> Imprimir & Confirmar</>
            )}
          </Button>
        </div>
      </CardContent>

      <ModalCadastrarResponsavel
        open={modalCadResp}
        onClose={() => setModalCadResp(false)}
        criancaId={crianca.id}
        criancaNome={crianca.nome}
        onCadastrado={() => {
          setModalCadResp(false);
          onResponsavelCadastrado();
        }}
      />
    </Card>
  );
}

// ── Modal de cadastro de criança nova (first visit) ──
function ModalNovaCrianca(props: {
  open: boolean;
  onClose: () => void;
  nomeInicial: string;
  onCadastrado: (c: Crianca) => void;
}) {
  const [modo, setModo] = useState<'novo' | 'amigo'>('novo');
  const [criancaNome, setCriancaNome] = useState('');
  const [criancaNasc, setCriancaNasc] = useState('');
  const [criancaSexo, setCriancaSexo] = useState('');
  // Saúde
  const [temAlergia, setTemAlergia] = useState(false);
  const [alergiaQual, setAlergiaQual] = useState('');
  const [temEspectro, setTemEspectro] = useState(false);
  const [espectroQual, setEspectroQual] = useState('');
  const [temLimitacao, setTemLimitacao] = useState(false);
  const [limitacaoQual, setLimitacaoQual] = useState('');
  const [obsMed, setObsMed] = useState('');
  // Responsável (modo novo)
  const [respNome, setRespNome] = useState('');
  const [respTel, setRespTel] = useState('');
  const [respCpf, setRespCpf] = useState('');
  const [respParentesco, setRespParentesco] = useState('mae');
  // Amigo de (modo amigo)
  const [amigoBusca, setAmigoBusca] = useState('');
  const [amigoResultados, setAmigoResultados] = useState<any[]>([]);
  const [amigoBuscando, setAmigoBuscando] = useState(false);
  const [amigoSel, setAmigoSel] = useState<any>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (props.open) {
      setModo('novo'); setCriancaNome(props.nomeInicial); setCriancaNasc(''); setCriancaSexo('');
      setTemAlergia(false); setAlergiaQual(''); setTemEspectro(false); setEspectroQual('');
      setTemLimitacao(false); setLimitacaoQual(''); setObsMed('');
      setRespNome(''); setRespTel(''); setRespCpf(''); setRespParentesco('mae');
      setAmigoBusca(''); setAmigoResultados([]); setAmigoSel(null);
    }
  }, [props.open, props.nomeInicial]);

  useEffect(() => {
    if (modo !== 'amigo' || amigoBusca.trim().length < 2) { setAmigoResultados([]); return; }
    setAmigoBuscando(true);
    const t = setTimeout(() => {
      totemKids.criancas.buscar(amigoBusca.trim())
        .then((d: any) => setAmigoResultados(Array.isArray(d) ? d : []))
        .finally(() => setAmigoBuscando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [amigoBusca, modo]);

  const Toggle = ({ on, set, label }: { on: boolean; set: (b: boolean) => void; label: string }) => (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <span className="text-sm">{label}</span>
      <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
        <button type="button" onClick={() => set(false)} className={`px-3 py-1 ${!on ? 'bg-muted font-medium' : ''}`}>Não</button>
        <button type="button" onClick={() => set(true)} className={`px-3 py-1 ${on ? 'bg-pink-600 text-white font-medium' : ''}`}>Sim</button>
      </div>
    </div>
  );

  async function salvar() {
    if (!criancaNome.trim()) { toast.error('Informe o nome da criança'); return; }
    const crianca: any = {
      nome: criancaNome.trim(), data_nascimento: criancaNasc || null, sexo: criancaSexo || null,
      observacoes_medicas: obsMed.trim() || null,
      tem_alergia: temAlergia, alergia_qual: temAlergia ? alergiaQual.trim() || null : null,
      tem_espectro: temEspectro, espectro_qual: temEspectro ? espectroQual.trim() || null : null,
      tem_limitacao_fisica: temLimitacao, limitacao_fisica_qual: temLimitacao ? limitacaoQual.trim() || null : null,
    };
    let body: any;
    if (modo === 'amigo') {
      if (!amigoSel) { toast.error('Escolha a criança de quem o visitante é amigo'); return; }
      body = { crianca, amigo_de_crianca_id: amigoSel.id };
    } else {
      if (!respNome.trim() || !respTel.trim()) { toast.error('Nome e telefone do responsável são obrigatórios'); return; }
      body = { crianca, responsavel: { nome: respNome.trim(), telefone: respTel.trim(), cpf: respCpf.trim() || null, parentesco: respParentesco } };
    }
    setSalvando(true);
    try {
      const r = await totemKids.criancas.create(body);
      toast.success(`${r.crianca.nome} cadastrada · pronto pra check-in`);
      const detalhe = await totemKids.criancas.buscar(criancaNome.trim());
      const found = detalhe.find((c: { id: string }) => c.id === r.crianca.id) || r.crianca;
      props.onCadastrado(found as Crianca);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao cadastrar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Cadastrar criança · visitante</DialogTitle>
          <DialogDescription>Dados mínimos · LGPD com menores. Sem CPF da criança.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
        {/* Modo */}
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30 text-xs">
          <button type="button" onClick={() => setModo('novo')} className={`px-3 py-1.5 rounded-md ${modo === 'novo' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>Novo cadastro</button>
          <button type="button" onClick={() => setModo('amigo')} className={`px-3 py-1.5 rounded-md ${modo === 'amigo' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>Amigo de uma criança</button>
        </div>

        <div className="space-y-4">
          <div className="border-b pb-3 space-y-2">
            <div className="text-sm font-semibold text-pink-700 dark:text-pink-300">Criança</div>
            <Input placeholder="Nome da criança *" value={criancaNome} onChange={e => setCriancaNome(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={criancaNasc} onChange={e => setCriancaNasc(e.target.value)} />
              <Select value={criancaSexo} onValueChange={setCriancaSexo}>
                <SelectTrigger><SelectValue placeholder="Sexo (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Menino</SelectItem>
                  <SelectItem value="F">Menina</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Saúde */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-pink-700 dark:text-pink-300">Saúde</div>
            <Toggle on={temAlergia} set={setTemAlergia} label="Tem alergia" />
            {temAlergia && <Input placeholder="Qual alergia?" value={alergiaQual} onChange={e => setAlergiaQual(e.target.value)} />}
            <Toggle on={temEspectro} set={setTemEspectro} label="Está no espectro autista" />
            {temEspectro && <Input placeholder="Qual? (nível, observações)" value={espectroQual} onChange={e => setEspectroQual(e.target.value)} />}
            <Toggle on={temLimitacao} set={setTemLimitacao} label="Tem limitação física / deficiência" />
            {temLimitacao && <Input placeholder="Qual limitação?" value={limitacaoQual} onChange={e => setLimitacaoQual(e.target.value)} />}
            <Input placeholder="Mais informações (medicação, cuidados...)" value={obsMed} onChange={e => setObsMed(e.target.value)} />
          </div>

          {/* Responsável OU amigo */}
          {modo === 'novo' ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-pink-700 dark:text-pink-300">Responsável</div>
              <Input placeholder="Nome do responsável *" value={respNome} onChange={e => setRespNome(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Telefone *" value={respTel} onChange={e => setRespTel(e.target.value)} />
                <Input placeholder="CPF (opcional)" value={respCpf} onChange={e => setRespCpf(e.target.value)} />
              </div>
              <Select value={respParentesco} onValueChange={setRespParentesco}>
                <SelectTrigger><SelectValue placeholder="Parentesco" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mae">Mãe</SelectItem>
                  <SelectItem value="pai">Pai</SelectItem>
                  <SelectItem value="padrasto">Padrasto</SelectItem>
                  <SelectItem value="madrasta">Madrasta</SelectItem>
                  <SelectItem value="avo_a">Avô/Avó</SelectItem>
                  <SelectItem value="tio_a">Tio/Tia</SelectItem>
                  <SelectItem value="irmao_a">Irmão/Irmã</SelectItem>
                  <SelectItem value="tutor">Tutor</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-pink-700 dark:text-pink-300">Amigo de quem?</div>
              <p className="text-xs text-muted-foreground">O visitante será liberado pelos mesmos responsáveis da criança escolhida (quem traz, retira os dois).</p>
              {amigoSel ? (
                <div className="flex items-center gap-2 rounded-lg border border-pink-400/40 p-2">
                  <Baby className="h-4 w-4 text-pink-600" />
                  <div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{amigoSel.nome}</div>{amigoSel.idade_label && <div className="text-xs text-muted-foreground">{amigoSel.idade_label}</div>}</div>
                  <Button variant="ghost" size="sm" onClick={() => setAmigoSel(null)}>trocar</Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Buscar criança cadastrada (ex.: Benjamin)..." value={amigoBusca} onChange={e => setAmigoBusca(e.target.value)} />
                  </div>
                  {amigoBuscando && <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-pink-500" /></div>}
                  {!amigoBuscando && amigoResultados.length > 0 && (
                    <div className="max-h-44 overflow-y-auto space-y-1">
                      {amigoResultados.map((c: any) => (
                        <button key={c.id} type="button" onClick={() => setAmigoSel(c)} className="w-full flex items-center gap-2 rounded-md border border-border p-2 text-left hover:border-pink-400/50">
                          <Baby className="h-4 w-4 text-pink-500" />
                          <div className="flex-1 min-w-0"><div className="text-sm truncate">{c.nome}</div>{c.idade_label && <div className="text-xs text-muted-foreground">{c.idade_label}</div>}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={props.onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando} className="bg-pink-600 hover:bg-pink-700">
              {salvando ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Cadastrar</>}
            </Button>
          </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
// ── Modal: cadastrar responsável rápido (auto-abre se criança sem responsável) ──
function ModalCadastrarResponsavel(props: {
  open: boolean;
  onClose: () => void;
  criancaId: string;
  criancaNome: string;
  onCadastrado: () => void;
}) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [parentesco, setParentesco] = useState('mae');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (props.open) {
      setNome(''); setTelefone(''); setCpf(''); setParentesco('mae');
    }
  }, [props.open]);

  async function salvar() {
    if (!nome.trim()) return toast.error('Nome obrigatório');
    if (!telefone.trim()) return toast.error('Telefone obrigatório');
    setSalvando(true);
    try {
      await totemKids.criancas.addResponsavelRapido(props.criancaId, {
        nome: nome.trim(),
        telefone: telefone.trim(),
        cpf: cpf.trim() || null,
        parentesco,
      });
      toast.success(`Responsável de ${props.criancaNome} cadastrado`);
      props.onCadastrado();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-w-md max-h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-pink-500" /> Cadastrar responsável
          </DialogTitle>
          <DialogDescription>
            {props.criancaNome} ainda não tem responsável vinculado.
            Cadastre quem está trazendo agora pra deixar o histórico completo · pode fechar e seguir manual se preferir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 flex-1 overflow-y-auto min-h-0">
          <Input placeholder="Nome do responsável *" value={nome} onChange={e => setNome(e.target.value)} autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Telefone *" value={telefone} onChange={e => setTelefone(e.target.value)} />
            <Input placeholder="CPF (opcional)" value={cpf} onChange={e => setCpf(e.target.value)} />
          </div>
          <Select value={parentesco} onValueChange={setParentesco}>
            <SelectTrigger><SelectValue placeholder="Parentesco" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mae">Mãe</SelectItem>
              <SelectItem value="pai">Pai</SelectItem>
              <SelectItem value="padrasto">Padrasto</SelectItem>
              <SelectItem value="madrasta">Madrasta</SelectItem>
              <SelectItem value="avo_a">Avô/Avó</SelectItem>
              <SelectItem value="tio_a">Tio/Tia</SelectItem>
              <SelectItem value="irmao_a">Irmão/Irmã</SelectItem>
              <SelectItem value="tutor">Tutor</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={props.onClose} disabled={salvando}>
              Pular agora
            </Button>
            <Button onClick={salvar} disabled={salvando} className="bg-pink-600 hover:bg-pink-700">
              {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Cadastrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
