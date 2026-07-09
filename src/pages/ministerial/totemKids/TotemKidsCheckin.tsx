// ============================================================================
// Totem Kids · Tela de Check-in (manned)
// ============================================================================
// Voluntário opera. Busca pelo nome da criança, encontra, confirma com a mãe,
// imprime 2 etiquetas (criança + responsável). Equivalente ao PC Check-Ins.
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Baby, Printer, AlertTriangle, Plus, ArrowLeft, Loader2, CheckCircle2, Phone, Settings, LogOut, Sparkles, UserPlus, ShieldCheck, Maximize, Lock, Check, Camera, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from 'sonner';
import { totemKids } from '@/api';
import { TotemKidsConfigTabs } from '@/pages/admin/totemKids/TotemKidsAdmin';
import TotemKidsCheckout from './TotemKidsCheckout';
import QrScanner from '@/pages/ministerial/voluntariado/components/checkin/QrScanner';
import { formatIdade, formatIdadeShort } from './lib/idade';
import { imprimirEtiquetas, reimprimirEtiqueta } from './lib/imprimir';
import confetti from 'canvas-confetti';
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
  ativo?: boolean;
  motivo_inativacao?: string | null;
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

  // Multi-culto: outros cultos do dia (com Kids) em que a criança também fica
  const [cultosDia, setCultosDia] = useState<any[]>([]);
  const [cultosExtras, setCultosExtras] = useState<string[]>([]);

  // Modal de cadastro novo
  const [modalNovo, setModalNovo] = useState(false);

  // Pré-check-in pelo app · o responsável preparou no celular e gerou um código
  const [preCodigo, setPreCodigo] = useState('');
  const [preBuscando, setPreBuscando] = useState(false);
  const [scanAberto, setScanAberto] = useState(false);
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
  // Check-in ↔ Check-out sem recarregar: alterna só o corpo (mantém o totem).
  const [tela, setTela] = useState<'checkin' | 'checkout'>('checkin');

  // Última etiqueta impressa · permite REIMPRIMIR sem novo check-in (se borrou/falhou).
  const [ultimaEtiqueta, setUltimaEtiqueta] = useState<Parameters<typeof imprimirEtiquetas>[0] | null>(null);

  // Layout configurável da etiqueta (tamanho/posição da logo, fonte do nome)
  const [etqLayout, setEtqLayout] = useState<Parameters<typeof imprimirEtiquetas>[0]['layout']>(undefined);
  useEffect(() => {
    totemKids.etiquetaConfig.get().then((c: any) => {
      if (c) setEtqLayout({ logoTamanho: c.logo_tamanho, logoPosicao: c.logo_posicao, nomeTamanho: c.nome_tamanho });
    }).catch(() => {});
  }, []);

  // Check-in ABERTO da criança selecionada nessa sessão: etiqueta perdida →
  // reimprimir (mesmo código); novo check-in só depois do check-out.
  const [checkinAberto, setCheckinAberto] = useState<any>(null);
  const [reimprimindoAberto, setReimprimindoAberto] = useState(false);
  // Check-ins abertos em OUTRAS sessões (culto anterior sem check-out) — não
  // impedem o novo check-in; o totem avisa e oferece regularizar.
  const [abertosAnteriores, setAbertosAnteriores] = useState<any[]>([]);
  const [checkoutAnteriorId, setCheckoutAnteriorId] = useState<string | null>(null);

  // Monta o payload da etiqueta (usado no check-in novo E na reimpressão).
  function montarDadosEtiqueta(c: Crianca, args: {
    checkinId: string; salaNome: string; salaCor?: string | null; salaLogoUrl?: string | null; respNome: string;
    codigo: string; codigoBarras?: string | null; cultoNome?: string | null; cultoData?: string | null;
  }): Parameters<typeof imprimirEtiquetas>[0] {
    const alergiaLabel = c.tem_alergia ? (c.alergia_qual || 'sim') : null;
    const necessidadeLabel = [
      c.tem_espectro ? `Espectro${c.espectro_qual ? `: ${c.espectro_qual}` : ''}` : '',
      c.tem_limitacao_fisica ? `Limitação${c.limitacao_fisica_qual ? `: ${c.limitacao_fisica_qual}` : ''}` : '',
    ].filter(Boolean).join(' · ') || null;
    // Aniversário na semana (próximos 7 dias) → etiqueta personalizada
    const aniversarioSemana = (() => {
      if (!c.data_nascimento) return false;
      const mmdd = (dt: Date) => `${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const hoje = new Date();
      const dias: string[] = [];
      for (let i = 0; i < 7; i++) { const dt = new Date(hoje); dt.setDate(hoje.getDate() + i); dias.push(mmdd(dt)); }
      return dias.includes(String(c.data_nascimento).slice(5, 10));
    })();
    const cultoDiaHora = args.cultoNome
      ? `${args.cultoNome}${args.cultoData ? ` · ${format(new Date(args.cultoData + 'T00:00:00'), 'dd/MM', { locale: ptBR })}` : ''}`
      : undefined;
    return {
      checkinId: args.checkinId,
      estacaoId: null,
      crianca: {
        nome: c.nome,
        idadeLabel: formatIdade(c.idade_meses),
        salaNome: args.salaNome,
        salaCor: args.salaCor,
        salaLogoUrl: args.salaLogoUrl,
        observacoesMedicas: c.observacoes_medicas,
        alergia: alergiaLabel,
        necessidade: necessidadeLabel,
        fotoAutorizada: !!c.foto_url,
        aniversarioSemana,
      },
      responsavel: { nome: args.respNome },
      codigoSeguranca: args.codigo,
      codigoBarras: args.codigoBarras || args.codigo,
      dataHora: format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
      cultoNome: args.cultoNome || undefined,
      cultoDiaHora,
      layout: etqLayout,
    };
  }

  async function consultarCheckinAberto(sessaoId: string, criancaId: string) {
    try {
      const r: any = await totemKids.checkin.aberto(sessaoId, criancaId);
      setCheckinAberto(r?.checkin || null);
      setAbertosAnteriores(Array.isArray(r?.abertos_anteriores) ? r.abertos_anteriores : []);
    } catch { setCheckinAberto(null); setAbertosAnteriores([]); }
  }

  useEffect(() => {
    setCheckinAberto(null);
    setAbertosAnteriores([]);
    if (!crianca?.id || !sessao?.id) return;
    consultarCheckinAberto(sessao.id, crianca.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crianca?.id, sessao?.id]);

  // Reimprime SÓ a etiqueta da criança do check-in ABERTO (perdeu/borrou) ·
  // mesmo código · a do responsável não precisa (decisão do Matheus 2026-07-07).
  async function reimprimirCheckinAberto() {
    if (!crianca || !checkinAberto) return;
    setReimprimindoAberto(true);
    try {
      const dados = montarDadosEtiqueta(crianca, {
        checkinId: checkinAberto.id,
        salaNome: checkinAberto.sala?.nome || '',
        salaCor: checkinAberto.sala?.cor || null,
        salaLogoUrl: checkinAberto.sala?.logo_url || null,
        respNome: checkinAberto.responsavel_checkin_nome || '',
        codigo: checkinAberto.codigo_seguranca,
        codigoBarras: checkinAberto.codigo_barras,
        cultoNome: checkinAberto.sessao?.culto?.nome || null,
        cultoData: checkinAberto.sessao?.culto?.data || null,
      });
      await reimprimirEtiqueta(dados, 'crianca', 'Etiqueta perdida — reimpressão pelo totem');
      toast.success(`Etiqueta da criança reimpressa · mesmo código ${checkinAberto.codigo_seguranca}`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao reimprimir a etiqueta');
    } finally { setReimprimindoAberto(false); }
  }

  // Regulariza o culto anterior: faz o check-out esquecido (método 'painel').
  async function checkoutCultoAnterior(checkinId: string) {
    if (checkoutAnteriorId) return;
    setCheckoutAnteriorId(checkinId);
    try {
      await totemKids.checkout.realizar({ checkin_id: checkinId, metodo: 'painel' });
      toast.success('Check-out do culto anterior registrado');
      if (crianca?.id && sessao?.id) await consultarCheckinAberto(sessao.id, crianca.id);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao fazer o check-out do culto anterior');
    } finally { setCheckoutAnteriorId(null); }
  }
  const [reimprimindo, setReimprimindo] = useState(false);
  async function reimprimir() {
    if (!ultimaEtiqueta) return;
    setReimprimindo(true);
    // Só a etiqueta da CRIANÇA — a do responsável não precisa na reimpressão.
    try { await reimprimirEtiqueta(ultimaEtiqueta, 'crianca', 'Reimpressão pelo totem (não saiu direito)'); toast.success('Etiqueta da criança reenviada pra impressora'); }
    catch (e: unknown) { toast.error((e as { message?: string })?.message || 'Erro ao reimprimir'); }
    finally { setReimprimindo(false); }
  }

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
    let stored = '';
    try { stored = localStorage.getItem(PIN_KEY) || ''; } catch { stored = ''; }
    if (!stored) { setPinSetup(true); setPinInput(''); setPinErro(''); setPinModal(true); }
    else ativarTotem();
  }
  function pedirSairTotem() {
    setPinSetup(false); setPinInput(''); setPinErro(''); setPinModal(true);
  }
  function confirmarPin() {
    const typed = pinInput.trim();
    if (pinSetup) {
      if (typed.length < 4) { setPinErro('O PIN precisa ter ao menos 4 dígitos'); return; }
      try { localStorage.setItem(PIN_KEY, typed); } catch { /* storage indisponível · segue */ }
      setPinSetup(false);
      setPinModal(false); setPinInput(''); setPinErro('');
      ativarTotem();
    } else {
      let stored = '';
      try { stored = (localStorage.getItem(PIN_KEY) || '').trim(); } catch { stored = ''; }
      // Fail-open quando NÃO há PIN salvo (storage limpo/indisponível) — não prende
      // o voluntário no modo totem. Com PIN salvo, exige o PIN correto.
      if (!stored || typed === stored) {
        setPinModal(false); setPinInput(''); setPinErro('');
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
  }, []);

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
  async function buscarPreCheckin(codigoArg?: string) {
    const cod = (codigoArg ?? preCodigo).trim().toUpperCase();
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

  // QR do pré-check-in (app) → extrai o código e aplica. O QR do app contém o
  // código; se vier como URL, pega o último segmento.
  function onScanQR(text: string) {
    setScanAberto(false);
    let limpo = String(text || '').trim();
    if (limpo.includes('/')) limpo = limpo.split('/').filter(Boolean).pop() || limpo;
    const m = limpo.match(/[A-Za-z0-9]{4,8}/);
    const cod = (m ? m[0] : limpo).toUpperCase();
    setPreCodigo(cod);
    buscarPreCheckin(cod);
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
      const payload: Record<string, unknown> = {
        sessao_id: sessao.id,
        crianca_id: crianca.id,
        sala_id: salaSelecionada,
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

      // Monta os dados da etiqueta e imprime. Guarda pra permitir REIMPRIMIR
      // (se a impressão falhar/borrar) sem criar outro check-in.
      const dadosEtiqueta = montarDadosEtiqueta(crianca, {
        checkinId: r.checkin.id,
        salaNome: r.sala.nome,
        salaCor: r.sala.cor,
        salaLogoUrl: r.sala.logo_url,
        respNome: r.responsavel.nome,
        codigo: r.codigo_seguranca,
        codigoBarras: r.codigo_barras,
        cultoNome: r.sessao.culto?.nome || null,
        cultoData: r.sessao.culto?.data || null,
      });
      await imprimirEtiquetas(dadosEtiqueta);
      setUltimaEtiqueta(dadosEtiqueta);

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
      setCultosExtras([]);
      setResultados([]);

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
      const err = e as { status?: number; message?: string; checkin_existente?: unknown };
      // Já existe check-in ABERTO: carrega o banner de reimpressão da etiqueta.
      if (err?.status === 409 && crianca && sessao?.id) {
        consultarCheckinAberto(sessao.id, crianca.id);
      }
      toast.error(err?.message || 'Erro no check-in');
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
      <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustes do totem</DialogTitle>
          <DialogDescription>Sessões, estações e teste de etiqueta — sem sair do totem.</DialogDescription>
        </DialogHeader>
        <TotemKidsConfigTabs aba={ajustesAba} onAba={setAjustesAba} abas={['sessoes', 'etiqueta']} />
      </DialogContent>
    </Dialog>
  );

  return (
    // ⚠️ REGRA DE EMPILHAMENTO DESTA TELA (não regredir · Diego 2026-07-07/08):
    // wrapper do modo totem = z-[40] (acima do header z-30, ABAIXO dos portais
    // do Radix, que ficam TODOS no padrão z-50). NUNCA pôr z-index em
    // DialogContent/SelectContent aqui: com z uniforme, a ordem do DOM empilha
    // certo (select/confirmação abertos por último pintam por cima). Foi um
    // cinto z-[80] num dialog que escondeu os dropdowns internos dele (z-50
    // atrás do pai) e travou os cliques. Exceção legítima: o par 1100/1200 do
    // TotemKidsAdmin (dialog aninhado + select), que é consistente entre si.
    <div className={totemMode ? 'fixed inset-0 z-[40] overflow-y-auto' : ''}>
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
              {sessao ? (
                <>
                  {sessao.culto?.nome}
                  {sessao.culto?.data && ` · ${format(new Date(sessao.culto.data + 'T00:00:00'), 'dd/MM', { locale: ptBR })}`}
                </>
              ) : 'Sem sessão aberta'}
              <Settings className="h-3 w-3 opacity-60" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <KidsZoneRelogio />
          <KidsZoneToggle ativo={tela} onCheckin={() => setTela('checkin')} onCheckout={() => setTela('checkout')} />
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

      {scanAberto && (
        <Dialog open onOpenChange={(o) => { if (!o) setScanAberto(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Escanear QR do app</DialogTitle>
              <DialogDescription>Aponte a câmera pro QR do pré-check-in do responsável.</DialogDescription>
            </DialogHeader>
            <QrScanner onScan={onScanQR} onError={(e) => toast.error(e || 'Erro ao abrir a câmera')} />
          </DialogContent>
        </Dialog>
      )}

      {tela === 'checkout' ? (
        <TotemKidsCheckout embutido />
      ) : !sessao ? (
        <div className="text-center py-14 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-3xl shadow-lg shadow-pink-500/30">🧸</div>
          <p className="text-lg text-slate-600">Nenhuma sessão aberta no momento</p>
          <p className="text-sm text-slate-400">Abra uma sessão aqui mesmo pra iniciar o check-in.</p>
          <Button onClick={() => abrirAjustes('sessoes')} className="bg-gradient-to-r from-orange-400 to-pink-500 hover:opacity-90 text-white font-bold">
            <Settings className="h-4 w-4 mr-1" /> Gerenciar sessões
          </Button>
        </div>
      ) : !crianca ? (
        <div className="space-y-6">
          {/* Último check-in · reimprimir etiqueta (se borrou/falhou) sem novo check-in */}
          {ultimaEtiqueta && (
            <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 flex flex-wrap items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-emerald-900 dark:text-emerald-100">
                  Check-in feito · {ultimaEtiqueta.crianca?.nome}
                </div>
                <div className="text-sm text-emerald-700 dark:text-emerald-300">
                  Código <b className="font-mono tracking-widest">{ultimaEtiqueta.codigoSeguranca}</b> · a etiqueta não saiu direito? Imprima de novo.
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={reimprimir} disabled={reimprimindo} variant="outline" className="border-emerald-400 text-emerald-700 dark:text-emerald-300">
                  {reimprimindo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
                  Imprimir de novo
                </Button>
                <Button onClick={() => setUltimaEtiqueta(null)} variant="ghost" size="sm">Ok</Button>
              </div>
            </div>
          )}
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
                onClick={() => buscarPreCheckin()}
                disabled={preBuscando || !preCodigo.trim()}
                className="w-full h-12 bg-gradient-to-r from-orange-400 to-pink-500 hover:opacity-90 text-white font-bold text-base rounded-xl"
              >
                {preBuscando ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Aplicar código'}
              </Button>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="flex-1 h-px bg-slate-200" /> ou <span className="flex-1 h-px bg-slate-200" />
              </div>
              <Button variant="outline" onClick={() => setScanAberto(true)}
                className="w-full h-12 rounded-xl border-2 font-semibold gap-2">
                <Camera className="h-5 w-5" /> Escanear QR do app
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
                  type="search"
                  name="busca-crianca"
                  placeholder="Ex.: Sofia, Lucas, Helena... ou telefone"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  className="pl-10 h-14 text-lg rounded-xl border-2 border-slate-200 bg-slate-50 focus:bg-white text-slate-700"
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                />
                {/* Campo isca oculto: o Chrome joga o autofill de e-mail aqui em vez
                    do campo de busca (heurística de "primeiro input"). */}
                <input type="text" name="fake-email" autoComplete="off" tabIndex={-1} aria-hidden="true"
                  style={{ position: 'absolute', opacity: 0, height: 0, width: 0, pointerEvents: 'none' }} />
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
                      {c.ativo === false && (
                        <Badge variant="outline" className="text-xs border-amber-500 text-amber-600" title={c.motivo_inativacao || 'Reativa ao fazer o check-in'}>
                          inativa
                        </Badge>
                      )}
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
          checkinAberto={checkinAberto}
          onReimprimirEtiqueta={reimprimirCheckinAberto}
          reimprimindoEtiqueta={reimprimindoAberto}
          abertosAnteriores={abertosAnteriores}
          onCheckoutAnterior={checkoutCultoAnterior}
          checkoutAnteriorId={checkoutAnteriorId}
          atualizarCrianca={(patch: Partial<Crianca>) => setCrianca(c => (c ? { ...c, ...patch } : c))}
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
        <DialogContent className="max-w-xs">
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
            name="totem-pin"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
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

// ── Pop-up: detalhes + edição da ficha da criança (protegido por senha do Kids) ──
function ModalDetalhesCrianca({ crianca, atualizarCrianca, onClose }: {
  crianca: Crianca; atualizarCrianca: (p: Partial<Crianca>) => void; onClose: () => void;
}) {
  const [fase, setFase] = useState<'senha' | 'edit'>('senha');
  const [senhaDefinida, setSenhaDefinida] = useState<boolean | null>(null);
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [criandoSenha, setCriandoSenha] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  useEffect(() => {
    totemKids.editSenha.status()
      .then((r: any) => setSenhaDefinida(!!r?.definida))
      .catch(() => setSenhaDefinida(false));
  }, []);

  async function verificar() {
    setVerificando(true); setErro('');
    try {
      const r: any = await totemKids.editSenha.verificar(senha);
      if (r?.naoDefinida) { setSenhaDefinida(false); setErro(''); }
      else if (r?.ok) setFase('edit');
      else { setErro('Senha incorreta.'); setSenha(''); }
    } catch (e: unknown) { setErro((e as { message?: string })?.message || 'Erro'); }
    finally { setVerificando(false); }
  }
  async function criarSenha() {
    if (novaSenha.trim().length < 4) { setErro('A senha precisa ter ao menos 4 caracteres.'); return; }
    setSalvandoSenha(true); setErro('');
    try {
      await totemKids.editSenha.definir(novaSenha.trim());
      toast.success('Senha de edição criada');
      setSenhaDefinida(true); setCriandoSenha(false); setNovaSenha('');
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      setErro(err?.status === 403 ? 'Só líderes do Kids (Mari/Milena) ou administradores (Matheus/Marcos Paulo) podem criar a senha.' : (err?.message || 'Erro ao criar a senha.'));
    } finally { setSalvandoSenha(false); }
  }

  // ── form de edição ──
  const [form, setForm] = useState({
    nome: crianca.nome || '',
    data_nascimento: crianca.data_nascimento || '',
    observacoes_medicas: crianca.observacoes_medicas || '',
    visitante: !!crianca.visitante,
    tem_alergia: !!crianca.tem_alergia, alergia_qual: crianca.alergia_qual || '',
    tem_espectro: !!crianca.tem_espectro, espectro_qual: crianca.espectro_qual || '',
    tem_limitacao_fisica: !!crianca.tem_limitacao_fisica, limitacao_fisica_qual: crianca.limitacao_fisica_qual || '',
  });
  const setF = (k: string, v: unknown) => setForm(s => ({ ...s, [k]: v }));
  const [resps, setResps] = useState(() => crianca.responsaveis.map(r => ({ membro_id: r.membro_id, nome: r.membro?.nome || '', telefone: r.membro?.telefone || '', parentesco: r.parentesco || 'outro', foto_url: r.membro?.foto_url || null })));
  const [salvando, setSalvando] = useState(false);
  const [capturaResp, setCapturaResp] = useState<string | null>(null); // membro_id em captura de foto

  async function salvarTudo() {
    if (form.nome.trim().length < 2) { setErro('Nome da criança muito curto.'); return; }
    setSalvando(true); setErro('');
    try {
      const patch = {
        nome: form.nome.trim(),
        data_nascimento: form.data_nascimento || null,
        observacoes_medicas: form.observacoes_medicas.trim() || null,
        visitante: form.visitante,
        tem_alergia: form.tem_alergia, alergia_qual: form.tem_alergia ? form.alergia_qual.trim() || null : null,
        tem_espectro: form.tem_espectro, espectro_qual: form.tem_espectro ? form.espectro_qual.trim() || null : null,
        tem_limitacao_fisica: form.tem_limitacao_fisica, limitacao_fisica_qual: form.tem_limitacao_fisica ? form.limitacao_fisica_qual.trim() || null : null,
      };
      await totemKids.criancas.update(crianca.id, patch);
      // Responsáveis com nome e/ou telefone alterado. A mudança grava no
      // cadastro CENTRAL (mem_membros) e o backend propaga pros espelhos
      // (conta de usuário, voluntariado) — mesmo número em todo o sistema.
      for (const r of resps) {
        const orig = crianca.responsaveis.find(x => x.membro_id === r.membro_id);
        const patchResp: Record<string, string> = {};
        if (r.nome.trim().length >= 2 && r.nome.trim() !== (orig?.membro?.nome || '')) patchResp.nome = r.nome.trim();
        const telLimpo = r.telefone.replace(/\D/g, '');
        const telOrig = String(orig?.membro?.telefone || '');
        if (r.telefone.trim() && telLimpo.length >= 10 && r.telefone.trim() !== telOrig) patchResp.telefone = r.telefone.trim();
        if (Object.keys(patchResp).length) {
          await totemKids.criancas.updateResponsavelMembro(r.membro_id, patchResp);
        }
        // Parentesco vive no VÍNCULO (kids_responsaveis), não no membro.
        if (r.parentesco && r.parentesco !== (orig?.parentesco || '')) {
          await totemKids.criancas.updateResponsavelVinculo(crianca.id, r.membro_id, { parentesco: r.parentesco });
        }
      }
      atualizarCrianca({
        ...patch,
        responsaveis: crianca.responsaveis.map(r => {
          const m = resps.find(x => x.membro_id === r.membro_id);
          if (!m) return r;
          return {
            ...r,
            membro: {
              ...(r.membro || {}),
              id: r.membro?.id || r.membro_id,
              nome: m.nome.trim() || r.membro?.nome || '',
              telefone: m.telefone.trim() || r.membro?.telefone || null,
            },
          };
        }),
      } as Partial<Crianca>);
      toast.success('Ficha atualizada');
      onClose();
    } catch (e: unknown) { setErro((e as { message?: string })?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  async function removerResp(membroId: string) {
    if (resps.length <= 1) { toast.error('A criança precisa ter ao menos um responsável.'); return; }
    if (!window.confirm('Remover este responsável da criança? (não apaga o cadastro da pessoa, só o vínculo)')) return;
    try {
      await totemKids.criancas.removeResponsavelVinculo(crianca.id, membroId);
      setResps(list => list.filter(x => x.membro_id !== membroId));
      atualizarCrianca({ responsaveis: crianca.responsaveis.filter(x => x.membro_id !== membroId) } as Partial<Crianca>);
      toast.success('Responsável removido');
    } catch (e: unknown) { toast.error((e as { message?: string })?.message || 'Erro ao remover'); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fase === 'edit' ? `Editar ficha · ${crianca.nome.split(' ')[0]}` : 'Editar ficha da criança'}</DialogTitle>
          <DialogDescription>
            {fase === 'edit' ? 'Corrija os dados da criança e dos responsáveis.' : 'Por segurança, a edição exige a senha do Kids.'}
          </DialogDescription>
        </DialogHeader>

        {fase === 'senha' ? (
          <div className="space-y-3">
            {senhaDefinida === false ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 p-3 text-sm">
                  Ainda não há senha de edição. Ela pode ser criada por um <b>líder do Kids</b> (Mari Gaia / Milena Rochet)
                  ou por um <b>administrador do sistema</b> (Matheus / Marcos Paulo).
                </div>
                {!criandoSenha ? (
                  <Button variant="outline" className="w-full" onClick={() => { setCriandoSenha(true); setErro(''); }}>
                    Sou líder ou administrador · criar senha
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Input type="password" inputMode="numeric" autoComplete="new-password" placeholder="Nova senha (mín. 4)"
                      value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') criarSenha(); }} className="h-12 text-center text-lg" />
                    <div className="flex gap-2">
                      <Button variant="ghost" className="flex-1" onClick={() => { setCriandoSenha(false); setErro(''); }}>Cancelar</Button>
                      <Button className="flex-1 bg-pink-600 hover:bg-pink-700" onClick={criarSenha} disabled={salvandoSenha}>
                        {salvandoSenha ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar senha'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Input type="password" inputMode="numeric" autoComplete="new-password" autoFocus placeholder="Senha do Kids"
                  value={senha} onChange={e => setSenha(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') verificar(); }} className="h-12 text-center text-lg" />
                <Button className="w-full bg-pink-600 hover:bg-pink-700" onClick={verificar} disabled={verificando || senhaDefinida === null}>
                  {verificando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Desbloquear edição'}
                </Button>
              </div>
            )}
            {erro && <p className="text-sm text-destructive text-center">{erro}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Nome da criança</label>
              <Input value={form.nome} onChange={e => setF('nome', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Nascimento</label>
                <Input type="date" value={form.data_nascimento} onChange={e => setF('data_nascimento', e.target.value)} />
              </div>
              <label className="flex items-center gap-2 mt-6 text-sm cursor-pointer">
                <input type="checkbox" checked={form.visitante} onChange={e => setF('visitante', e.target.checked)} /> Visitante
              </label>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Observações médicas</label>
              <Input value={form.observacoes_medicas} onChange={e => setF('observacoes_medicas', e.target.value)} placeholder="ex.: usa inalador" />
            </div>
            <div className="space-y-2 rounded-lg border border-border p-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.tem_alergia} onChange={e => setF('tem_alergia', e.target.checked)} /> Alergia
              </label>
              {form.tem_alergia && <Input value={form.alergia_qual} onChange={e => setF('alergia_qual', e.target.value)} placeholder="Qual alergia?" />}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.tem_espectro} onChange={e => setF('tem_espectro', e.target.checked)} /> Espectro autista
              </label>
              {form.tem_espectro && <Input value={form.espectro_qual} onChange={e => setF('espectro_qual', e.target.value)} placeholder="Detalhe (opcional)" />}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.tem_limitacao_fisica} onChange={e => setF('tem_limitacao_fisica', e.target.checked)} /> Limitação física
              </label>
              {form.tem_limitacao_fisica && <Input value={form.limitacao_fisica_qual} onChange={e => setF('limitacao_fisica_qual', e.target.value)} placeholder="Detalhe (opcional)" />}
            </div>
            {resps.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Responsáveis</label>
                <div className="space-y-2">
                  {resps.map((r, i) => {
                    const orig = crianca.responsaveis.find(x => x.membro_id === r.membro_id);
                    return (
                      <div key={r.membro_id} className="rounded-lg border border-border p-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground">Responsável {i + 1}</span>
                          {resps.length > 1 && (
                            <button type="button" onClick={() => removerResp(r.membro_id)} className="text-muted-foreground hover:text-red-500" title="Remover responsável"><X className="h-3.5 w-3.5" /></button>
                          )}
                        </div>
                        <Input value={r.nome} placeholder="Nome do responsável"
                          onChange={e => setResps(list => list.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} />
                        <Input value={r.telefone} placeholder="Telefone (WhatsApp)" inputMode="tel"
                          onChange={e => setResps(list => list.map((x, j) => j === i ? { ...x, telefone: e.target.value } : x))} />
                        <Select value={r.parentesco} onValueChange={v => setResps(list => list.map((x, j) => j === i ? { ...x, parentesco: v } : x))}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Parentesco" /></SelectTrigger>
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
                        <div className="flex items-center gap-2">
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                            {r.foto_url ? <img src={r.foto_url} alt="" className="h-full w-full object-cover" /> : <Camera className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCapturaResp(r.membro_id)}>
                            {r.foto_url ? 'Refazer foto' : 'Tirar foto'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Alterar aqui atualiza o cadastro da pessoa no sistema inteiro (membresia, voluntariado etc.).
                </p>
              </div>
            )}
            {erro && <p className="text-sm text-destructive text-center">{erro}</p>}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={salvando}>Cancelar</Button>
              <Button className="flex-1 bg-pink-600 hover:bg-pink-700" onClick={salvarTudo} disabled={salvando}>
                {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Salvar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
      {capturaResp && (
        <WebcamCaptura
          titulo="Foto do responsável"
          salvando={false}
          onCapturar={async (dataUrl) => {
            const mid = capturaResp;
            try {
              await totemKids.criancas.uploadFotoResponsavel(mid, dataUrl);
              setResps(list => list.map(x => x.membro_id === mid ? { ...x, foto_url: dataUrl } : x));
              atualizarCrianca({ responsaveis: crianca.responsaveis.map(rr => rr.membro_id === mid ? { ...rr, membro: { ...(rr.membro || {}), id: rr.membro?.id || mid, foto_url: dataUrl } } : rr) } as Partial<Crianca>);
              toast.success('Foto do responsável atualizada');
            } catch (e: unknown) { toast.error((e as { message?: string })?.message || 'Erro ao salvar a foto'); }
            setCapturaResp(null);
          }}
          onFechar={() => setCapturaResp(null)}
        />
      )}
    </Dialog>
  );
}

// ── Captura de foto pela webcam (getUserMedia) · usada no check-in ──
function WebcamCaptura({ titulo, salvando, onCapturar, onFechar }: {
  titulo: string; salvando: boolean; onCapturar: (dataUrl: string) => void; onFechar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [erro, setErro] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false })
      .then(stream => {
        if (cancel) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      })
      .catch(() => setErro('Não consegui acessar a câmera. Confira a permissão e se a webcam está conectada.'));
    return () => { cancel = true; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  function capturar() {
    const v = videoRef.current; if (!v) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth || 640; canvas.height = v.videoHeight || 480;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    setPreview(canvas.toDataURL('image/jpeg', 0.85));
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>Enquadre a criança e toque em Capturar.</DialogDescription>
        </DialogHeader>
        {erro ? (
          <p className="text-sm text-destructive text-center py-6">{erro}</p>
        ) : preview ? (
          <div className="space-y-3">
            <img src={preview} alt="" className="w-full rounded-xl object-cover" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPreview(null)} disabled={salvando}>Refazer</Button>
              <Button className="flex-1 bg-pink-600 hover:bg-pink-700" onClick={() => onCapturar(preview)} disabled={salvando}>
                {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Usar foto
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black aspect-[4/3] object-cover" />
            <Button className="w-full bg-pink-600 hover:bg-pink-700" onClick={capturar}><Camera className="h-4 w-4 mr-1" /> Capturar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
  checkinAberto: any;
  onReimprimirEtiqueta: () => void;
  reimprimindoEtiqueta: boolean;
  abertosAnteriores: any[];
  onCheckoutAnterior: (checkinId: string) => void;
  checkoutAnteriorId: string | null;
  atualizarCrianca: (patch: Partial<Crianca>) => void;
  onResponsavelCadastrado: () => void;
}) {
  const { crianca, salas, salaSelecionada, setSalaSelecionada,
    responsavelSelecionado, setResponsavelSelecionado,
    cultosDia, cultosExtras, setCultosExtras,
    usarRespManual, setUsarRespManual,
    respManualNome, setRespManualNome, respManualTel, setRespManualTel,
    atualizarCrianca,
    onCancelar, onConfirmar, imprimindo,
    checkinAberto, onReimprimirEtiqueta, reimprimindoEtiqueta,
    abertosAnteriores, onCheckoutAnterior, checkoutAnteriorId,
    onResponsavelCadastrado } = props;

  // Auto-abre modal de cadastro se criança chegar sem responsável
  const [modalCadResp, setModalCadResp] = useState(false);
  useEffect(() => {
    if (crianca.responsaveis.filter(r => r.autorizado_buscar).length === 0) {
      setModalCadResp(true);
    }
  }, [crianca.id, crianca.responsaveis]);

  // Foto por webcam + pop-up de detalhes/edição da ficha (protegido por senha do Kids).
  const [camAberta, setCamAberta] = useState(false);
  const [salvandoFoto, setSalvandoFoto] = useState(false);
  const [detalhesOpen, setDetalhesOpen] = useState(false);

  async function salvarFoto(dataUrl: string) {
    setSalvandoFoto(true);
    try {
      const r: any = await totemKids.criancas.uploadFoto(crianca.id, dataUrl);
      atualizarCrianca({ foto_url: r?.foto_url || r?.url || r?.signedUrl || dataUrl });
      setCamAberta(false);
      toast.success('Foto da criança atualizada');
    } catch (e: unknown) { toast.error((e as { message?: string })?.message || 'Erro ao salvar foto'); }
    finally { setSalvandoFoto(false); }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start gap-4">
          {/* Avatar + botão de foto (webcam) */}
          <button type="button" onClick={() => setCamAberta(true)} title="Tirar/atualizar foto da criança"
            className="relative h-20 w-20 rounded-full shrink-0 group">
            {crianca.foto_url ? (
              <img src={crianca.foto_url} alt="" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="h-20 w-20 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center">
                <Baby className="h-10 w-10 text-pink-500" />
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 rounded-full bg-pink-600 text-white flex items-center justify-center shadow ring-2 ring-background">
              <Camera className="h-3.5 w-3.5" />
            </span>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span className="truncate">{crianca.nome}</span>
              <button type="button" onClick={() => setDetalhesOpen(true)} title="Editar ficha da criança (exige senha do Kids)"
                className="text-muted-foreground hover:text-pink-600 shrink-0"><Pencil className="h-4 w-4" /></button>
            </h2>
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

        {camAberta && (
          <WebcamCaptura
            titulo={`Foto de ${crianca.nome.split(' ')[0]}`}
            salvando={salvandoFoto}
            onCapturar={salvarFoto}
            onFechar={() => setCamAberta(false)}
          />
        )}

        {detalhesOpen && (
          <ModalDetalhesCrianca
            crianca={crianca}
            atualizarCrianca={atualizarCrianca}
            onClose={() => setDetalhesOpen(false)}
          />
        )}

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

        {/* Culto ANTERIOR sem check-out: avisa e oferece regularizar — NÃO
            impede o novo check-in deste culto. */}
        {abertosAnteriores.length > 0 && (
          <div className="rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-300 dark:border-sky-800 p-3 space-y-2">
            <p className="text-sm">
              <b>{crianca.nome.split(' ')[0]}</b> ainda consta presente em outro culto — o check-out não foi feito:
            </p>
            {abertosAnteriores.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-sky-200 dark:border-sky-900 px-2.5 py-1.5">
                <span className="text-sm min-w-0 truncate">
                  {a.sessao?.culto?.nome || 'Culto'}
                  {a.sessao?.culto?.data ? ` · ${format(new Date(a.sessao.culto.data + 'T00:00:00'), 'dd/MM', { locale: ptBR })}` : ''}
                  <span className="text-xs text-muted-foreground"> · código {a.codigo_seguranca}</span>
                </span>
                <Button size="sm" variant="outline" className="shrink-0 border-sky-400 text-sky-700 dark:text-sky-300"
                  disabled={!!checkoutAnteriorId} onClick={() => onCheckoutAnterior(a.id)}>
                  {checkoutAnteriorId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Fazer check-out'}
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Isso não impede o check-in de agora — é só pra regularizar o registro do culto anterior.
            </p>
          </div>
        )}

        {/* Criança já com check-in ABERTO: reimprimir a etiqueta (perdida/borrada)
            sem criar outro check-in. Novo check-in só depois do check-out. */}
        {checkinAberto && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 p-3 space-y-2">
            <p className="text-sm">
              <b>{crianca.nome.split(' ')[0]}</b> já está com check-in nessa sessão · código{' '}
              <b className="font-mono tracking-widest">{checkinAberto.codigo_seguranca}</b>
              {checkinAberto.sala?.nome ? <> · sala <b>{checkinAberto.sala.nome}</b></> : null}.
            </p>
            <p className="text-xs text-muted-foreground">
              Perdeu a etiqueta? Imprima de novo — sai com o mesmo código. Um novo check-in só é
              possível depois do check-out (quando a criança sai e volta).
            </p>
            <Button onClick={onReimprimirEtiqueta} disabled={reimprimindoEtiqueta} variant="outline"
              className="w-full border-amber-400 text-amber-700 dark:text-amber-300">
              {reimprimindoEtiqueta ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
              Imprimir etiqueta de novo
            </Button>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button
            size="lg"
            onClick={onConfirmar}
            disabled={imprimindo || !!checkinAberto}
            title={checkinAberto ? 'Já existe check-in aberto — reimprima a etiqueta ou faça o check-out antes.' : undefined}
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
  // Responsáveis (modo novo · vários)
  const [resps, setResps] = useState<any[]>([{ nome: '', telefone: '', cpf: '', parentesco: 'mae', autorizado_buscar: true, foto: null }]);
  // Foto da criança + consentimento de uso de imagem (marketing) + alvo da webcam
  const [fotoCrianca, setFotoCrianca] = useState<string | null>(null);
  const [consentMkt, setConsentMkt] = useState(false);
  const [captura, setCaptura] = useState<{ tipo: 'crianca' } | { tipo: 'resp'; i: number } | null>(null);
  const setResp = (i: number, patch: any) => setResps(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addResp = () => setResps(rs => [...rs, { nome: '', telefone: '', cpf: '', parentesco: 'outro', autorizado_buscar: true, foto: null }]);
  const delResp = (i: number) => setResps(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs);
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
      setResps([{ nome: '', telefone: '', cpf: '', parentesco: 'mae', autorizado_buscar: true, foto: null }]);
      setFotoCrianca(null); setConsentMkt(false); setCaptura(null);
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
      observacoes_medicas: obsMed.trim() || null, consent_marketing: consentMkt,
      tem_alergia: temAlergia, alergia_qual: temAlergia ? alergiaQual.trim() || null : null,
      tem_espectro: temEspectro, espectro_qual: temEspectro ? espectroQual.trim() || null : null,
      tem_limitacao_fisica: temLimitacao, limitacao_fisica_qual: temLimitacao ? limitacaoQual.trim() || null : null,
    };
    let body: any;
    let validos: any[] = [];
    if (modo === 'amigo') {
      if (!amigoSel) { toast.error('Escolha a criança de quem o visitante é amigo'); return; }
      body = { crianca, amigo_de_crianca_id: amigoSel.id };
    } else {
      validos = resps.filter(r => r.nome.trim() && r.telefone.trim());
      if (!validos.length) { toast.error('Informe ao menos um responsável (nome e telefone)'); return; }
      body = { crianca, responsaveis: validos.map(x => ({ nome: x.nome.trim(), telefone: x.telefone.trim(), cpf: x.cpf?.trim() || null, parentesco: x.parentesco, autorizado_buscar: x.autorizado_buscar })) };
    }
    setSalvando(true);
    try {
      const r = await totemKids.criancas.create(body);
      // Fotos best-effort (não travam o cadastro). r.responsaveis volta na ordem dos validos.
      const cid = r?.crianca?.id;
      if (cid && fotoCrianca) { try { await totemKids.criancas.uploadFoto(cid, fotoCrianca); } catch { /* noop */ } }
      const retResps = Array.isArray(r?.responsaveis) ? r.responsaveis : [];
      for (let i = 0; i < retResps.length; i++) {
        if (validos[i]?.foto && retResps[i]?.id) { try { await totemKids.criancas.uploadFotoResponsavel(retResps[i].id, validos[i].foto); } catch { /* noop */ } }
      }
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
            <div className="flex items-center gap-3 pt-1">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {fotoCrianca ? <img src={fotoCrianca} alt="" className="h-full w-full object-cover" /> : <Baby className="h-6 w-6 text-muted-foreground" />}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setCaptura({ tipo: 'crianca' })}>
                <Camera className="h-4 w-4 mr-1" /> {fotoCrianca ? 'Refazer foto' : 'Tirar foto'}
              </Button>
              {fotoCrianca && <Button type="button" variant="ghost" size="sm" onClick={() => setFotoCrianca(null)}>Remover</Button>}
            </div>
            <label className="flex items-start gap-2 text-xs rounded-md border border-border p-2 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={consentMkt} onChange={e => setConsentMkt(e.target.checked)} />
              <span>Autoriza o <b>uso da imagem da criança</b> para divulgação/marketing (redes sociais, site, etc.)</span>
            </label>
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
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-pink-700 dark:text-pink-300">Responsáveis</div>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addResp}><Plus className="h-3.5 w-3.5" /> Adicionar</Button>
              </div>
              {resps.map((r, i) => (
                <div key={i} className="rounded-md border border-border p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Responsável {i + 1}</span>
                    {resps.length > 1 && <button type="button" onClick={() => delResp(i)} className="text-muted-foreground hover:text-red-500"><X className="h-3.5 w-3.5" /></button>}
                  </div>
                  <Input placeholder="Nome do responsável *" value={r.nome} onChange={e => setResp(i, { nome: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Telefone *" value={r.telefone} onChange={e => setResp(i, { telefone: e.target.value })} />
                    <Input placeholder="CPF (opcional)" value={r.cpf} onChange={e => setResp(i, { cpf: e.target.value })} />
                  </div>
                  <Select value={r.parentesco} onValueChange={v => setResp(i, { parentesco: v })}>
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {r.foto ? <img src={r.foto} alt="" className="h-full w-full object-cover" /> : <Camera className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCaptura({ tipo: 'resp', i })}>{r.foto ? 'Refazer foto' : 'Tirar foto'}</Button>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="checkbox" checked={r.autorizado_buscar} onChange={e => setResp(i, { autorizado_buscar: e.target.checked })} />
                      Autorizado a buscar
                    </label>
                  </div>
                </div>
              ))}
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
      {captura && (
        <WebcamCaptura
          titulo={captura.tipo === 'crianca' ? 'Foto da criança' : 'Foto do responsável'}
          salvando={false}
          onCapturar={(dataUrl) => { if (captura.tipo === 'crianca') setFotoCrianca(dataUrl); else setResp(captura.i, { foto: dataUrl }); setCaptura(null); }}
          onFechar={() => setCaptura(null)}
        />
      )}
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
