// Módulo de Inscrições · tela de CHECK-IN do evento (SPEC-06 · F3.4).
// Padrão totem: busca por nome/CPF + leitura do QR do comprovante → marca
// `insc_checkins` (única por inscrição · duplo check-in AVISADO) → contadores
// ao vivo (inscritos × presentes, polling). "Inscrever na hora" abre o
// formulário público em modo balcão — MESMA validação do contrato, nenhum
// atalho. O dashboard já lê `compareceu` da view unificada: marcar aqui acorda
// o card de comparecimento sozinho.
//
// Leitura de QR contínua (a do voluntariado para no 1º scan — fila de porta
// precisa ler um atrás do outro), com trava de re-leitura do mesmo código.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import { inscricoesApi as api } from '../api';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft, Camera, CameraOff, CheckCircle2, Loader2, Maximize2, Minimize2,
  Search, UserPlus, Users, Undo2, AlertTriangle, History, QrCode, SwitchCamera, Bell, Mail, ExternalLink } from 'lucide-react';

type ItemLista = {
  id: string; nome_completo: string; telefone: string | null;
  numero_sorte: number | null; status: string;
  checkin_em: string | null; checkin_modo?: string | null;
  /** Opções marcadas na pergunta agrupável (ex.: ministério). Só as OPÇÕES —
   *  o texto cru da resposta não vem do servidor. */
  opcoes?: string[];
};
type Agrupamento = {
  campo: { key: string; label: string; opcoes: string[] };
  porOpcao: { opcao: string; inscritos: number; presentes: number }[];
  sem_resposta: number; nao_reconhecido: number; pessoas: number; presentes: number;
  multipla: boolean;
};
type Estado = {
  evento: { id: string; nome: string; slug: string; data: string | null; hora: string | null; local: string | null; status: string; checkin_ativo: boolean; tem_sorteio: boolean; pagamento_ativo: boolean; vagas: number | null;
    // Perguntas do formulário do evento — a inscrição de balcão precisa fazê-las.
    campos?: { key: string; label: string; tipo?: string; opcoes?: string[]; obrigatorio?: boolean }[] | null };
  inscritos: number; presentes: number; lista: ItemLista[];
  agrupamento?: Agrupamento | null;
};
type Feedback = {
  tipo: 'ok' | 'ja' | 'aviso' | 'erro';
  titulo: string; detalhe?: string;
  // pagamento pendente: guarda a inscrição pra "Confirmar entrada mesmo assim"
  pendenteId?: string;
};

type HistItem = {
  id: string; acao: string; modo: string | null; motivo: string | null;
  em: string; por_nome: string | null; override_pendente: boolean;
  nome_completo: string | null; inscricao_id: string | null;
};
type Historico = { disponivel: boolean; items: HistItem[]; aviso?: string };

const ACAO_ROTULO: Record<string, string> = {
  checkin: 'entrada',
  checkin_override_pendente: 'liberada com pendência',
  desfeito: 'desfeito',
};
const ACAO_ESTILO: Record<string, string> = {
  checkin: 'bg-emerald-500/15 text-emerald-600',
  checkin_override_pendente: 'bg-amber-500/15 text-amber-600',
  desfeito: 'bg-red-500/15 text-red-600',
};

const hora = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function InscricaoEventoCheckin() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  // "Presentes" existe pra CONFERIR na hora ("essa pessoa já entrou?") sem
  // precisar procurar nome por nome. Ordenado pelo check-in mais RECENTE: na
  // portaria a dúvida é quase sempre sobre quem acabou de passar.
  const [aba, setAba] = useState<'todos' | 'presentes' | 'faltam'>('todos');
  // Filtro por ÁREA (a resposta do formulário) — pedido do Matheus (01/09):
  // "quantas pessoas da produção vieram". `null` = todas.
  const [areaSel, setAreaSel] = useState<string | null>(null);
  const [resultadoCpf, setResultadoCpf] = useState<ItemLista[] | null>(null);
  const [buscandoCpf, setBuscandoCpf] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  // Traseira por padrão (é a que aponta pro QR de quem está na fila). A frontal
  // serve pro totem virado pra pessoa, que lê o próprio comprovante.
  const [camera, setCamera] = useState<'environment' | 'user'>('environment');
  const [fullscreen, setFullscreen] = useState(false);
  // Trilha só carrega sob demanda — a tela do dia roda em polling curto e não
  // vale puxar o ledger a cada 15s.
  const [historico, setHistorico] = useState<Historico | null>(null);
  const [carregandoHist, setCarregandoHist] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const ultimoQrRef = useRef<{ texto: string; em: number }>({ texto: '', em: 0 });
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buscaRef = useRef<HTMLInputElement | null>(null);

  function carregar() {
    if (!id) return;
    api.checkinEstado(id)
      .then((e: any) => setEstado(e))
      .catch(() => { if (!estado) toast.error('Erro ao carregar o check-in'); })
      .finally(() => setCarregando(false));
  }
  // Contador AO VIVO: recarrega em polling curto (outra pessoa marcando em
  // outro aparelho aparece aqui sem F5).
  useEffect(() => {
    carregar();
    const iv = setInterval(carregar, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Busca por CPF/telefone é SERVER-SIDE (o documento não viaja na lista da
  // tela); nome/nº da sorte filtram a lista local na hora.
  const digitos = busca.replace(/\D/g, '');
  const buscaPorDoc = digitos.length >= 8;
  useEffect(() => {
    if (!buscaPorDoc) { setResultadoCpf(null); return; }
    setBuscandoCpf(true);
    const t = setTimeout(() => {
      api.checkinBuscar(id, digitos)
        .then((r: any) => setResultadoCpf(Array.isArray(r) ? r : []))
        .catch(() => setResultadoCpf([]))
        .finally(() => setBuscandoCpf(false));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digitos, buscaPorDoc, id]);

  const listaFiltrada = useMemo(() => {
    if (!estado) return [];
    if (buscaPorDoc) return resultadoCpf || [];
    const q = norm(busca.trim());
    const base = q
      ? estado.lista.filter(i =>
          norm(i.nome_completo).includes(q)
          || String(i.numero_sorte || '') === q.replace(/\D/g, ''))
      : estado.lista;
    // ⚠️ A área recorta ANTES das abas: "presentes da Produção" é a pergunta,
    // não "presentes, e por acaso da Produção".
    const porArea = areaSel ? base.filter(i => (i.opcoes || []).includes(areaSel)) : base;
    if (aba === 'faltam') return porArea.filter(i => !i.checkin_em && i.status !== 'cancelada');
    if (aba === 'presentes') {
      return porArea.filter(i => !!i.checkin_em)
        .sort((a, b) => String(b.checkin_em).localeCompare(String(a.checkin_em)));
    }
    return porArea;
  }, [estado, busca, buscaPorDoc, resultadoCpf, aba, areaSel]);

  // Contadores dos chips: saem da lista INTEIRA, nunca do recorte visível —
  // senão o número muda quando alguém digita na busca e deixa de responder
  // "quantos entraram".
  const totais = useMemo(() => {
    // ⚠️ Com uma área escolhida, os chips passam a contar DENTRO dela — senão
    // a tela diria "39 inscritos" da Produção e "194 presentes" da igreja toda.
    const todaLista = estado?.lista || [];
    const l = areaSel ? todaLista.filter(i => (i.opcoes || []).includes(areaSel)) : todaLista;
    const presentes = l.filter(i => !!i.checkin_em).length;
    const faltam = l.filter(i => !i.checkin_em && i.status !== 'cancelada').length;
    return { todos: l.length, presentes, faltam };
  }, [estado, areaSel]);

  function mostrarFeedback(f: Feedback) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback(f);
    // pendente fica na tela até a pessoa da porta decidir; o resto se limpa
    if (f.tipo !== 'aviso' || !f.pendenteId) {
      feedbackTimer.current = setTimeout(() => setFeedback(null), 4500);
    }
  }

  async function marcar(payload: { inscricao_id?: string; token?: string; confirmar_pendente?: boolean; motivo_override?: string }) {
    const chave = payload.inscricao_id || 'qr';
    setMarcando(chave);
    try {
      const r: any = await api.checkinMarcar(id, payload);
      if (r.ja_checkin) {
        mostrarFeedback({ tipo: 'ja', titulo: r.inscricao?.nome_completo || 'Já registrado', detalhe: `Já fez check-in às ${hora(r.em)}` });
      } else {
        mostrarFeedback({
          tipo: 'ok', titulo: r.inscricao?.nome_completo || 'Check-in feito',
          detalhe: [r.inscricao?.numero_sorte ? `Nº da sorte ${r.inscricao.numero_sorte}` : null, r.pendente ? 'entrada liberada com pagamento pendente' : null].filter(Boolean).join(' · ') || undefined,
        });
      }
      setBusca('');
      buscaRef.current?.focus();
      carregar();
      if (historico) carregarHistorico();
    } catch (e: any) {
      if (e?.motivo === 'pagamento_pendente' && e?.inscricao_id) {
        mostrarFeedback({ tipo: 'aviso', titulo: e?.nome || 'Pagamento pendente', detalhe: 'O pagamento desta inscrição ainda não foi confirmado.', pendenteId: e.inscricao_id });
      } else if (e?.motivo === 'outro_evento') {
        mostrarFeedback({ tipo: 'erro', titulo: e?.nome || 'Comprovante de outro evento', detalhe: e?.message || 'Este comprovante é de outro evento.' });
      } else if (e?.motivo === 'checkin_inativo') {
        mostrarFeedback({ tipo: 'erro', titulo: 'Check-in desativado', detalhe: 'Ative o check-in deste evento pra começar a registrar.' });
        carregar();
      } else {
        mostrarFeedback({ tipo: 'erro', titulo: 'Não deu pra registrar', detalhe: e?.message || 'Tente de novo.' });
      }
    } finally { setMarcando(null); }
  }

  function liberarPendente(inscricaoId: string) {
    const motivo = window.prompt('Motivo para liberar a entrada com pagamento pendente:', 'autorizado pela liderança na portaria');
    if (!motivo?.trim()) return;
    setFeedback(null);
    marcar({ inscricao_id: inscricaoId, confirmar_pendente: true, motivo_override: motivo.trim() });
  }

  // O motivo VAI pro ledger append-only (o prompt substitui o confirm: uma
  // caixa só, e a trilha deixa de registrar sempre o mesmo texto genérico).
  async function desfazer(i: ItemLista) {
    const motivo = window.prompt(`Desfazer o check-in de ${i.nome_completo}? Informe o motivo:`, 'erro de leitura na portaria');
    if (!motivo?.trim()) return;
    try {
      await api.checkinDesfazer(id, i.id, motivo.trim());
      toast.success('Check-in desfeito');
      carregar();
      if (historico) carregarHistorico();
    } catch (e: any) { toast.error(e?.message || 'Erro ao desfazer'); }
  }

  function carregarHistorico() {
    if (!id) return;
    setCarregandoHist(true);
    api.checkinHistorico(id)
      .then((h: any) => setHistorico({ disponivel: h?.disponivel !== false, items: Array.isArray(h?.items) ? h.items : [], aviso: h?.aviso }))
      .catch((e: any) => { setHistorico({ disponivel: true, items: [] }); toast.error(e?.message || 'Erro ao carregar a trilha'); })
      .finally(() => setCarregandoHist(false));
  }
  function alternarHistorico() {
    if (historico) { setHistorico(null); return; }
    setHistorico({ disponivel: true, items: [] });
    carregarHistorico();
  }

  // ── QR de AUTOATENDIMENTO (a pessoa faz o próprio check-in) ─────────────
  // ⚠️ Carregado só quando o operador pede: o link É a credencial da porta, e
  // não precisa trafegar em toda abertura da tela.
  const [qrAuto, setQrAuto] = useState<string | null>(null);
  const [qrAberto, setQrAberto] = useState(false);
  const [qrErro, setQrErro] = useState<string | null>(null);

  // ── Aviso "use o seu QR" pra quem tem o app ─────────────────────────────
  // ⚠️ A prévia carrega ANTES de qualquer disparo porque o alcance é MENOR
  // que "os inscritos" (só quem tem conta no app). Botão sem esse número
  // deixaria quem clica achando que avisou todo mundo.
  const [avisoPrevia, setAvisoPrevia] = useState<{ inscritos_confirmados: number; com_conta_no_app: number; sem_conta_no_app: number } | null>(null);
  const [avisando, setAvisando] = useState(false);
  const [emailPrevia, setEmailPrevia] = useState<{ confirmados: number; com_email: number; sem_email: number; ja_enviados: number; faltam: number; canal_pronto: boolean } | null>(null);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [naHoraAberto, setNaHoraAberto] = useState(false);
  useEffect(() => {
    if (!id) return;
    api.checkinAvisoAppPrevia(id).then(setAvisoPrevia).catch(() => setAvisoPrevia(null));
    api.checkinAvisoEmailPrevia(id).then(setEmailPrevia).catch(() => setEmailPrevia(null));
  }, [id]);

  async function enviarComprovantesPorEmail() {
    if (!emailPrevia?.faltam) return;
    if (!window.confirm(
      `Enviar o comprovante (QR + número da sorte) para ${emailPrevia.faltam} pessoa(s) por e-mail?\n\n`
      + `Cada uma recebe o SEU — um e-mail por inscrição, com o nome dela no assunto.\n`
      + `${emailPrevia.sem_email} inscrito(s) não têm e-mail e não recebem nada.`
    )) return;
    setEnviandoEmail(true);
    try {
      const r = await api.checkinAvisoEmailEnviar(id!);
      const sobra = r.restantes ? ` · faltam ${r.restantes} (clique de novo pra continuar)` : '';
      const ruim = (r.falhas || r.recusados) ? ` · ${r.falhas} falha(s)${r.recusados ? `, ${r.recusados} recusado(s)` : ''}` : '';
      toast.success(`${r.enviados} comprovante(s) enviado(s)${sobra}${ruim}`);
      api.checkinAvisoEmailPrevia(id!).then(setEmailPrevia).catch(() => {});
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível enviar');
    } finally { setEnviandoEmail(false); }
  }

  async function avisarNoApp() {
    if (!avisoPrevia?.com_conta_no_app) return;
    if (!window.confirm(
      `Avisar ${avisoPrevia.com_conta_no_app} pessoa(s) com o app que o check-in é pelo QR?\n\n`
      + `Os outros ${avisoPrevia.sem_conta_no_app} inscritos NÃO têm conta no app e não recebem nada.`
    )) return;
    setAvisando(true);
    try {
      const r = await api.checkinAvisoAppEnviar(id!);
      toast.success(`Aviso enviado para ${r.com_conta_no_app} no app (${r.enviados} com push)`);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível enviar o aviso');
    } finally { setAvisando(false); }
  }
  const abrirQrAuto = async () => {
    setQrAberto(true); setQrErro(null);
    if (qrAuto) return;
    try {
      const r = await api.checkinQrAutoatendimento(id!);
      setQrAuto(r.url);
    } catch (e: any) {
      setQrErro(e?.message || 'Não foi possível gerar o QR.');
    }
  };

  // ── Leitor de QR (contínuo) ──────────────────────────────────────────────
  async function ligarCamera(facing: 'environment' | 'user' = camera) {
    try {
      const s = new Html5Qrcode('insc-checkin-qr');
      scannerRef.current = s;
      await s.start(
        { facingMode: facing },
        { fps: 8, qrbox: { width: 230, height: 230 } },
        (texto) => {
          const agora = Date.now();
          // mesmo QR parado na frente da câmera não re-marca em loop
          if (texto === ultimoQrRef.current.texto && agora - ultimoQrRef.current.em < 4000) return;
          ultimoQrRef.current = { texto, em: agora };
          marcar({ token: texto });
        },
        () => { /* frame sem QR — silêncio */ },
      );
      setLendo(true);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível abrir a câmera');
    }
  }
  // ⚠️ A lib não troca de câmera em voo: é parar e subir de novo. Se a nova
  // falhar (aparelho sem frontal, permissão negada), VOLTA pra que estava
  // funcionando em vez de deixar a portaria sem leitor no meio da fila.
  async function virarCamera() {
    const alvo = camera === 'environment' ? 'user' : 'environment';
    const anterior = camera;
    await desligarCamera();
    setCamera(alvo);
    try {
      await ligarCamera(alvo);
    } catch {
      setCamera(anterior);
      await ligarCamera(anterior).catch(() => {});
      toast.error('Não consegui usar a outra câmera — voltei pra anterior');
    }
  }

  async function desligarCamera() {
    const scanner = scannerRef.current;
    try {
      if (scanner?.isScanning) await scanner.stop();
    } catch { /* já parado */ }
    try { scanner?.clear(); } catch { /* DOM já desmontado */ }
    scannerRef.current = null;
    setLendo(false);
  }
  useEffect(() => () => { desligarCamera(); }, []);

  // ── Tela cheia (Fullscreen API no container — some o chrome do sistema) ──
  function alternarTelaCheia() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setFullscreen(false)).catch(() => {});
    }
  }
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  async function ativarCheckin() {
    try {
      await api.atualizarEvento(id, { checkin_ativo: true });
      toast.success('Check-in ativado');
      carregar();
    } catch (e: any) { toast.error(e?.message || 'Sem permissão pra ativar — peça a quem edita o evento'); }
  }

  if (carregando) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!estado) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-3">
      <p className="text-muted-foreground">Evento não encontrado.</p>
      <Button variant="outline" onClick={() => navigate('/inscricoes')}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar pras inscrições</Button>
    </div>
  );

  const ev = estado.evento;
  const pct = estado.inscritos ? Math.round((estado.presentes / estado.inscritos) * 100) : 0;


  const linkPublico = `${window.location.origin}/evento/${ev.slug}`;

  const FEEDBACK_COR: Record<Feedback['tipo'], { bg: string; borda: string; texto: string }> = {
    ok: { bg: 'rgba(16,185,129,0.14)', borda: 'rgba(16,185,129,0.45)', texto: '#10b981' },
    ja: { bg: 'rgba(245,158,11,0.14)', borda: 'rgba(245,158,11,0.45)', texto: '#d97706' },
    aviso: { bg: 'rgba(245,158,11,0.14)', borda: 'rgba(245,158,11,0.45)', texto: '#d97706' },
    erro: { bg: 'rgba(239,68,68,0.14)', borda: 'rgba(239,68,68,0.45)', texto: '#ef4444' },
  };

  // ⚠️ MONTADO uma vez e RENDERIZADO em UM lugar de cada vez: com a câmera
  // ligada vai colado no leitor (é pra lá que o operador olha na fila); sem
  // câmera, no topo, que é o fluxo da busca pela lista. Dois iguais na tela
  // ao mesmo tempo se leem como bug.
  const cartaoFeedback = feedback ? (
          <div className="rounded-2xl px-5 py-4 border" style={{ background: FEEDBACK_COR[feedback.tipo].bg, borderColor: FEEDBACK_COR[feedback.tipo].borda }}>
            <div className="flex items-center gap-3">
              {feedback.tipo === 'ok'
                ? <CheckCircle2 className="h-9 w-9 shrink-0" style={{ color: FEEDBACK_COR.ok.texto }} />
                : <AlertTriangle className="h-9 w-9 shrink-0" style={{ color: FEEDBACK_COR[feedback.tipo].texto }} />}
              <div className="min-w-0">
                <div className="text-xl sm:text-2xl font-extrabold break-words" style={{ color: FEEDBACK_COR[feedback.tipo].texto }}>{feedback.titulo}</div>
                {feedback.detalhe && <div className="text-sm text-muted-foreground">{feedback.detalhe}</div>}
              </div>
              <div className="ml-auto flex items-center gap-2 shrink-0">
                {feedback.pendenteId && (
                  <Button size="sm" onClick={() => liberarPendente(feedback.pendenteId!)}>
                    Liberar entrada mesmo assim
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setFeedback(null)}>Fechar</Button>
              </div>
            </div>
          </div>
  ) : null;

  return (
    // bg explícito: em tela cheia o elemento fullscreen fica sobre fundo preto
    // do navegador — sem o bg da página o vidro "vaza" o preto.
    <div ref={containerRef} className="min-h-full overflow-y-auto" style={{ background: 'var(--cbrio-bg)' }}>
      <div className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        {/* Cabeçalho: volta + contadores + ações */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button onClick={() => navigate(`/inscricoes/evento/${id}`)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {ev.nome}
          </button>
          <div className="flex gap-2">
            {/* ⚠️ Abre a busca no CADASTRO em vez do formulário público em branco:
                na porta, redigitar nome, CPF, nascimento e e-mail de quem a
                igreja já conhece é o que trava a fila (3 casos no Celebra). */}
            <Button size="sm" variant="outline" onClick={() => setNaHoraAberto(true)}
                    title="Busca a pessoa no cadastro e só pede o que falta">
              <UserPlus className="h-3.5 w-3.5 mr-1" /> Inscrever na hora
            </Button>
            <a href={linkPublico} target="_blank" rel="noreferrer">
              <Button size="sm" variant="ghost" title="Formulário público, em branco — para quem não está no cadastro">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Formulário
              </Button>
            </a>
            <Button size="sm" variant="outline" onClick={alternarTelaCheia}>
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5 mr-1" /> : <Maximize2 className="h-3.5 w-3.5 mr-1" />}
              {fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            </Button>
          </div>
        </div>

        {/* Contador ao vivo */}
        <Card className="glass-solid p-4 sm:p-5">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Check-in · {ev.nome}</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl sm:text-5xl font-extrabold tabular-nums text-primary">{estado.presentes}</span>
                <span className="text-lg text-muted-foreground font-medium">/ {estado.inscritos} inscritos</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums">{pct}%</div>
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> presentes</div>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: 'var(--track, rgba(127,127,127,0.2))' }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#00B39D,#00d9bd)' }} />
          </div>
        </Card>

        {!ev.checkin_ativo && (
          <Card className="glass-solid p-4 border-amber-500/40">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                O check-in não está ativado neste evento — dá pra ver a lista, mas não registrar.
              </div>
              <Button size="sm" onClick={ativarCheckin}>Ativar check-in</Button>
            </div>
          </Card>
        )}

        {/* No topo só quando a câmera está desligada. */}
        {!lendo && cartaoFeedback}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          {/* Busca + lista */}
          <Card className="glass-solid p-4">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={buscaRef}
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Nome, CPF, telefone ou nº da sorte…"
                autoFocus
                className="w-full rounded-xl border border-border bg-transparent pl-9 pr-3 py-3 text-base outline-none focus:border-primary"
              />
            </div>
            {buscaPorDoc && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {buscandoCpf ? 'Consultando por documento…' : `Busca por CPF/telefone (${(resultadoCpf || []).length} resultado${(resultadoCpf || []).length === 1 ? '' : 's'})`}
              </p>
            )}

            {/* ── Filtro por ÁREA (a resposta do formulário) ─────────────────
                Pedido do Matheus (01/09): "quantas pessoas da produção vieram".
                ⚠️ Aparece só quando o evento TEM pergunta com lista de opções —
                evento sem isso não ganha um filtro que não filtra nada. */}
            {estado?.agrupamento && estado.agrupamento.porOpcao.length > 1 && (
              <div className="mt-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {estado.agrupamento.campo.label}
                  </span>
                  {areaSel && (
                    <button onClick={() => setAreaSel(null)} className="text-[11px] text-primary font-semibold">
                      limpar
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {estado.agrupamento.porOpcao.map(o => (
                    <button
                      key={o.opcao}
                      onClick={() => setAreaSel(areaSel === o.opcao ? null : o.opcao)}
                      title={`${o.presentes} de ${o.inscritos} inscritos vieram`}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                        areaSel === o.opcao
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-foreground/5 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {/* ⚠️ "presentes/inscritos" JUNTOS: só o total de vindos
                          não diz se a área compareceu bem ou é grande. */}
                      {o.opcao} <span className="tabular-nums opacity-80">{o.presentes}/{o.inscritos}</span>
                    </button>
                  ))}
                </div>
                {/* ⚠️⚠️ A soma das áreas PASSA do total de pessoas quando o campo
                    é de múltipla escolha — quem marcou 2 áreas conta nas 2. Sem
                    dizer isso, alguém soma as colunas e conclui que a conta está
                    errada (a lição de "participações × pessoas" dos Grupos). */}
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  {estado.agrupamento.multipla && 'quem marcou mais de uma área conta em cada uma — a soma passa do total. '}
                  {estado.agrupamento.sem_resposta > 0 && `${estado.agrupamento.sem_resposta} sem resposta. `}
                  {estado.agrupamento.nao_reconhecido > 0 && `${estado.agrupamento.nao_reconhecido} com resposta fora da lista.`}
                </p>
              </div>
            )}

            <div className="mt-3 flex gap-1.5">
              {([
                ['todos', 'Todos', totais.todos],
                ['presentes', 'Presentes', totais.presentes],
                ['faltam', 'Faltam', totais.faltam],
              ] as const).map(([k, rotulo, n]) => (
                <button
                  key={k}
                  onClick={() => setAba(k)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    aba === k
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-foreground/5 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {rotulo} <span className="tabular-nums opacity-80">{n}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 divide-y divide-border/60 max-h-[52vh] overflow-y-auto">
              {listaFiltrada.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {busca
                    ? 'Ninguém encontrado com essa busca.'
                    : aba === 'presentes'
                      ? 'Ninguém fez check-in ainda.'
                      : aba === 'faltam'
                        ? 'Todo mundo já entrou.'
                        : 'Nenhuma inscrição ainda.'}
                </p>
              )}
              {listaFiltrada.map(i => {
                const cancelada = i.status === 'cancelada';
                const pendente = i.status === 'recebida';
                return (
                  <div key={i.id} className={`flex items-center gap-3 py-2.5 ${cancelada ? 'opacity-45' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[15px] break-words">{i.nome_completo}</div>
                      <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                        {i.numero_sorte != null && <span>Nº {i.numero_sorte}</span>}
                        {i.telefone && <span>···{String(i.telefone).slice(-4)}</span>}
                        {cancelada && <span className="text-red-500 font-medium">cancelada</span>}
                        {pendente && <span className="text-amber-600 font-medium">pagamento pendente</span>}
                      </div>
                    </div>
                    {i.checkin_em ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-600 px-2.5 py-1 text-xs font-bold">
                          <CheckCircle2 className="h-3.5 w-3.5" /> {hora(i.checkin_em)}
                        </span>
                        <button onClick={() => desfazer(i)} title="Desfazer check-in" className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/10">
                          <Undo2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <Button size="sm" disabled={cancelada || marcando === i.id} onClick={() => marcar({ inscricao_id: i.id })} className="shrink-0">
                        {marcando === i.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check-in'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="space-y-4">
            {/* QR de autoatendimento — para a pessoa fazer o próprio check-in */}
            <div className="mb-3">
              <Button variant="outline" className="w-full gap-2" onClick={abrirQrAuto}>
                <QrCode className="h-4 w-4" />
                QR de autoatendimento
              </Button>
              <p className="text-[11px] text-muted-foreground mt-1">
                Mostre numa tela ou imprima na porta: a pessoa lê, digita CPF e
                nascimento e faz o próprio check-in.
              </p>
            </div>

            {qrAberto && (
              <div
                className="fixed inset-0 z-[1100] bg-black/90 flex flex-col items-center justify-center p-6"
                onClick={() => setQrAberto(false)}
              >
                {qrErro ? (
                  <p className="text-white text-center max-w-sm">{qrErro}</p>
                ) : qrAuto ? (
                  <>
                    <div className="bg-white p-6 rounded-2xl">
                      <QRCodeSVG value={qrAuto} size={320} level="M" />
                    </div>
                    <p className="text-white/90 text-lg font-semibold mt-6">
                      Faça seu check-in
                    </p>
                    <p className="text-white/60 text-sm mt-1 text-center max-w-sm">
                      Aponte a câmera do celular · informe CPF e data de nascimento
                    </p>
                    {estado && !estado.evento.checkin_ativo && (
                      <p className="text-amber-300 text-sm mt-4 text-center max-w-sm">
                        ⚠️ O check-in deste evento está DESLIGADO — o QR não vai
                        funcionar até você ativá-lo nas configurações do evento.
                      </p>
                    )}
                    <p className="text-white/40 text-xs mt-6">toque para fechar</p>
                  </>
                ) : (
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                )}
              </div>
            )}

            {/* ⚠️ Confirmação COLADA no leitor: ela vivia só no topo da página e o
                leitor fica na coluna da direita — na porta, o operador tinha que
                ROLAR a tela pra ver o nome de quem acabou de passar (relato do
                Matheus, 29/08). */}
            {lendo && cartaoFeedback}

            {/* Leitor de QR */}
            <Card className="glass-solid p-4">
              <div className="text-sm font-semibold mb-2">Ler QR do comprovante</div>
              <div id="insc-checkin-qr" className="w-full rounded-xl overflow-hidden bg-black/20" style={{ minHeight: lendo ? 260 : 0 }} />
              <div className="flex gap-2 mt-3">
                <Button onClick={lendo ? desligarCamera : () => ligarCamera()} variant={lendo ? 'destructive' : 'default'} className="flex-1 gap-2">
                  {lendo ? <><CameraOff className="h-4 w-4" /> Parar leitura</> : <><Camera className="h-4 w-4" /> Ligar câmera</>}
                </Button>
                {/* Só aparece com a câmera ligada: virar câmera desligada não
                    tem efeito visível e se lê como botão quebrado. */}
                {lendo && (
                  <Button
                    onClick={virarCamera}
                    variant="ghost"
                    className="gap-2 shrink-0"
                    title={camera === 'environment' ? 'Usar a câmera frontal' : 'Usar a câmera traseira'}
                  >
                    <SwitchCamera className="h-4 w-4" />
                    {camera === 'environment' ? 'Frontal' : 'Traseira'}
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                A leitura fica ligada direto — aponte um QR atrás do outro. Quem não tiver o comprovante entra pela busca ao lado.
              </p>
            </Card>

            {/* Avisar quem tem o app — o alcance vai DECLARADO no próprio card,
                senão "avisar os inscritos" se lê como se chegasse aos 334. */}
            {avisoPrevia && (
              <Card className="glass-solid p-4">
                <div className="text-sm font-semibold mb-1">Avisar pelo app</div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                  Manda um aviso no app dizendo pra apresentar o QR na entrada. O toque
                  abre a inscrição da pessoa, com o comprovante.
                  {' '}<strong>{avisoPrevia.com_conta_no_app}</strong> de{' '}
                  {avisoPrevia.inscritos_confirmados} inscritos têm conta no app — os
                  outros {avisoPrevia.sem_conta_no_app} não recebem nada.
                </p>
                <Button
                  onClick={avisarNoApp}
                  disabled={avisando || !avisoPrevia.com_conta_no_app || !ev.checkin_ativo}
                  variant="outline"
                  className="w-full gap-2"
                >
                  {avisando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                  {avisoPrevia.com_conta_no_app ? `Avisar ${avisoPrevia.com_conta_no_app} no app` : 'Ninguém tem o app'}
                </Button>
              </Card>
            )}

            {/* Comprovante por e-mail — o canal que realmente alcança o evento:
                324 dos 334 inscritos têm e-mail, contra 32 com o app. */}
            {emailPrevia && (
              <Card className="glass-solid p-4">
                <div className="text-sm font-semibold mb-1">Mandar o comprovante por e-mail</div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                  Cada pessoa recebe o <strong>seu</strong> QR e o número da sorte — um e-mail por
                  inscrição, com o nome dela no assunto.
                  {' '}<strong>{emailPrevia.com_email}</strong> de {emailPrevia.confirmados} têm e-mail
                  {emailPrevia.ja_enviados ? ` · ${emailPrevia.ja_enviados} já receberam` : ''}
                  {emailPrevia.sem_email ? ` · ${emailPrevia.sem_email} sem e-mail` : ''}.
                </p>
                {!emailPrevia.canal_pronto && (
                  <p className="text-[11px] text-amber-600 mb-2">
                    O canal de e-mail não está configurado — nada sai enquanto isso.
                  </p>
                )}
                <Button
                  onClick={enviarComprovantesPorEmail}
                  disabled={enviandoEmail || !emailPrevia.faltam || !emailPrevia.canal_pronto}
                  variant="outline"
                  className="w-full gap-2"
                >
                  {enviandoEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {emailPrevia.faltam ? `Enviar para ${emailPrevia.faltam}` : 'Todos já receberam'}
                </Button>
              </Card>
            )}

            {/* Trilha da portaria (ledger append-only) — responde "quem liberou
                a entrada dessa pessoa com pagamento pendente?" na própria tela. */}
            <Card className="glass-solid p-4">
              <button onClick={alternarHistorico} className="w-full flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4 text-primary" />
                Trilha da portaria
                <span className="ml-auto text-xs text-muted-foreground">{historico ? 'ocultar' : 'ver'}</span>
              </button>
              {historico && (
                <div className="mt-3">
                  {carregandoHist && <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>}
                  {!carregandoHist && historico.disponivel === false && (
                    <p className="text-xs text-amber-600">{historico.aviso || 'Trilha indisponível no banco.'}</p>
                  )}
                  {!carregandoHist && historico.disponivel !== false && historico.items.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum movimento registrado ainda.</p>
                  )}
                  <div className="divide-y divide-border/60 max-h-[40vh] overflow-y-auto">
                    {historico.items.map(h => (
                      <div key={h.id} className="py-2 text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${ACAO_ESTILO[h.acao] || 'bg-foreground/10 text-muted-foreground'}`}>
                            {ACAO_ROTULO[h.acao] || h.acao}
                          </span>
                          <span className="font-medium break-words">{h.nome_completo || 'Inscrição'}</span>
                          <span className="ml-auto text-muted-foreground">{hora(h.em)}</span>
                        </div>
                        <div className="text-muted-foreground mt-0.5">
                          {h.por_nome || 'operador não identificado'}{h.modo ? ` · ${h.modo === 'qr' ? 'QR' : 'busca'}` : ''}{h.motivo ? ` — ${h.motivo}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
      <ModalInscreverNaHora
        eventoId={id!}
        campos={ev.campos || []}
        aberto={naHoraAberto}
        onFechar={() => setNaHoraAberto(false)}
        onPronto={(nome, num) => {
          mostrarFeedback({ tipo: 'ok', titulo: nome, detalhe: num != null ? `Inscrito · nº da sorte ${num}` : 'Inscrito' });
          carregar();
        }}
      />

    </div>
  );
}

// ── Inscrever na hora, a partir do CADASTRO ──────────────────────────────
// Pedido do Matheus (29/08): buscar a pessoa na membresia e só preencher o
// que falta. Quem inscreve é a espinha canônica — aqui é só o pré-preenchimento.
function ModalInscreverNaHora({
  eventoId, campos, aberto, onFechar, onPronto,
}: {
  eventoId: string;
  campos: { key: string; label: string; tipo?: string; opcoes?: string[]; obrigatorio?: boolean }[];
  aberto: boolean;
  onFechar: () => void;
  onPronto: (nome: string, numeroSorte: number | null) => void;
}) {
  const [q, setQ] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [pessoas, setPessoas] = useState<any[] | null>(null);
  const [sel, setSel] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [dados, setDados] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) { setQ(''); setPessoas(null); setSel(null); setForm({}); setDados({}); }
  }, [aberto]);

  // Busca com respiro: digitar "maria" não dispara 5 consultas.
  useEffect(() => {
    if (!aberto || q.trim().length < 3) { setPessoas(null); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      try { const r = await api.buscarPessoaCadastro(eventoId, q.trim()); setPessoas(r.pessoas || []); }
      catch { setPessoas([]); }
      finally { setBuscando(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q, aberto, eventoId]);

  function escolher(p: any) {
    setSel(p);
    // ⚠️ Só o que o cadastro TEM entra pré-preenchido. O que falta fica vazio e
    // marcado — é o "avise para preencher" do pedido.
    setForm({
      nome_completo: p.nome || '', cpf: p.cpf || '', telefone: p.telefone || '',
      email: p.email || '', data_nascimento: p.data_nascimento || '', sexo: p.sexo || '',
    });
  }

  const faltando = (sel?.falta || []) as string[];
  const rotuloFalta: Record<string, string> = {
    nome: 'nome completo', cpf: 'CPF', telefone: 'telefone',
    email: 'e-mail', nascimento: 'nascimento', genero: 'sexo',
  };

  async function enviar() {
    setEnviando(true);
    try {
      const r = await api.inscreverNaHora(eventoId, {
        nome_completo: form.nome_completo?.trim(),
        cpf: (form.cpf || '').replace(/\D/g, ''),
        telefone: (form.telefone || '').replace(/\D/g, ''),
        email: form.email?.trim(),
        data_nascimento: form.data_nascimento,
        sexo: form.sexo,
        endereco: null,
        // ⚠️ Consentimento de TERCEIRO: quem marca é o operador, no balcão. O
        // texto gravado diz isso — registrar como aceite do titular seria
        // fabricar prova legal (lei de 25/08).
        aceita_termos: true,
        whatsapp_optin: false,
        dados,
        website: '',
      });
      onPronto(form.nome_completo || sel?.nome || 'Inscrição', r?.numero_sorte ?? null);
      onFechar();
    } catch (e: any) {
      toast.error([e?.message, e?.detalhe].filter(Boolean).join(' · ') || 'Erro ao inscrever');
    } finally { setEnviando(false); }
  }

  if (!aberto) return null;
  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-lg flex flex-col max-h-[88vh]">
        <DialogHeader><DialogTitle>Inscrever na hora</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
          {!sel ? (
            <>
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Nome, CPF ou telefone…"
                className="w-full rounded-xl border border-border bg-transparent px-3 py-3 text-base outline-none focus:border-primary"
              />
              <p className="text-[11px] text-muted-foreground">
                Busca no cadastro da membresia. O que já estiver lá vem preenchido.
              </p>
              {buscando && <p className="text-sm text-muted-foreground py-3">Procurando…</p>}
              {pessoas && !pessoas.length && !buscando && (
                <p className="text-sm text-muted-foreground py-3">
                  Ninguém encontrado. Use o formulário público para cadastrar do zero.
                </p>
              )}
              <div className="divide-y divide-border/60">
                {(pessoas || []).map((p) => (
                  <button
                    key={p.id} onClick={() => escolher(p)} disabled={p.ja_inscrita}
                    className={`w-full text-left py-2.5 ${p.ja_inscrita ? 'opacity-50 cursor-not-allowed' : 'hover:bg-foreground/5'}`}
                  >
                    <div className="font-semibold text-[15px]">{p.nome}</div>
                    <div className="text-xs text-muted-foreground flex gap-2 flex-wrap mt-0.5">
                      {p.ja_inscrita
                        ? <span className="text-emerald-600 font-medium">já inscrita neste evento</span>
                        : p.completo
                          ? <span className="text-emerald-600">cadastro completo</span>
                          : <span className="text-amber-600">falta: {p.falta_rotulos?.join(' · ')}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{sel.nome}</div>
                <Button size="sm" variant="ghost" onClick={() => setSel(null)}>Trocar</Button>
              </div>
              {faltando.length > 0 && (
                <p className="text-[12px] text-amber-600">
                  Falta preencher: {faltando.map((f) => rotuloFalta[f] || f).join(' · ')}
                </p>
              )}
              {([
                ['nome_completo', 'Nome completo', 'text', 'nome'],
                ['cpf', 'CPF', 'text', 'cpf'],
                ['telefone', 'Celular', 'text', 'telefone'],
                ['email', 'E-mail', 'email', 'email'],
                ['data_nascimento', 'Nascimento', 'date', 'nascimento'],
              ] as const).map(([k, rotulo, tipo, chave]) => (
                <label key={k} className="block">
                  <span className={`text-xs ${faltando.includes(chave) ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>
                    {rotulo}{faltando.includes(chave) ? ' · falta preencher' : ''}
                  </span>
                  <input
                    type={tipo} value={form[k] || ''}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-transparent px-3 py-2.5 outline-none focus:border-primary"
                  />
                </label>
              ))}
              <div>
                <span className={`text-xs ${faltando.includes('genero') ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>
                  Sexo{faltando.includes('genero') ? ' · falta preencher' : ''}
                </span>
                <div className="flex gap-2 mt-1">
                  {(['masculino', 'feminino'] as const).map((g) => (
                    <button
                      key={g} onClick={() => setForm((f) => ({ ...f, sexo: g }))}
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm capitalize ${form.sexo === g ? 'border-primary text-primary font-semibold' : 'border-border text-muted-foreground'}`}
                    >{g}</button>
                  ))}
                </div>
              </div>
              {/* Perguntas do formulário do evento — a espinha recusa sem as obrigatórias. */}
              {(campos || []).map((c) => (
                <div key={c.key}>
                  <span className="text-xs text-muted-foreground">{c.label}{c.obrigatorio ? ' *' : ''}</span>
                  {c.opcoes?.length ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {c.opcoes.map((o) => {
                        const sels = String(dados[c.key] || '').split(',').map(x => x.trim()).filter(Boolean);
                        const on = c.tipo === 'multi' ? sels.includes(o) : dados[c.key] === o;
                        return (
                          <button
                            key={o}
                            onClick={() => setDados((d) => {
                              if (c.tipo !== 'multi') return { ...d, [c.key]: o };
                              const s = new Set(sels);
                              if (s.has(o)) s.delete(o); else s.add(o);
                              return { ...d, [c.key]: [...s].join(', ') };
                            })}
                            className={`rounded-full border px-3 py-1.5 text-xs ${on ? 'border-primary text-primary font-semibold' : 'border-border text-muted-foreground'}`}
                          >{o}</button>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      value={dados[c.key] || ''}
                      onChange={(e) => setDados((d) => ({ ...d, [c.key]: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-transparent px-3 py-2.5 outline-none focus:border-primary"
                    />
                  )}
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                O aceite dos termos é registrado como <strong>declarado no balcão</strong>, não como
                aceite digitado pela pessoa. O opt-in de WhatsApp não é marcado por terceiro.
              </p>
            </>
          )}
        </div>
        {sel && (
          <div className="flex gap-2 pt-3">
            <Button variant="ghost" onClick={onFechar} className="flex-1">Cancelar</Button>
            <Button onClick={enviar} disabled={enviando} className="flex-1 gap-2">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Inscrever
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
