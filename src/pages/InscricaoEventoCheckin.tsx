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
import { inscricoesApi as api } from '../api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft, Camera, CameraOff, CheckCircle2, Loader2, Maximize2, Minimize2,
  Search, UserPlus, Users, Undo2, AlertTriangle,
} from 'lucide-react';

type ItemLista = {
  id: string; nome_completo: string; telefone: string | null;
  numero_sorte: number | null; status: string;
  checkin_em: string | null; checkin_modo?: string | null;
};
type Estado = {
  evento: { id: string; nome: string; slug: string; data: string | null; hora: string | null; local: string | null; status: string; checkin_ativo: boolean; tem_sorteio: boolean; pagamento_ativo: boolean; vagas: number | null };
  inscritos: number; presentes: number; lista: ItemLista[];
};
type Feedback = {
  tipo: 'ok' | 'ja' | 'aviso' | 'erro';
  titulo: string; detalhe?: string;
  // pagamento pendente: guarda a inscrição pra "Confirmar entrada mesmo assim"
  pendenteId?: string;
};

const hora = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function InscricaoEventoCheckin() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [resultadoCpf, setResultadoCpf] = useState<ItemLista[] | null>(null);
  const [buscandoCpf, setBuscandoCpf] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

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
    if (!q) return estado.lista;
    return estado.lista.filter(i =>
      norm(i.nome_completo).includes(q)
      || String(i.numero_sorte || '') === q.replace(/\D/g, ''));
  }, [estado, busca, buscaPorDoc, resultadoCpf]);

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

  async function desfazer(i: ItemLista) {
    if (!window.confirm(`Desfazer o check-in de ${i.nome_completo}?`)) return;
    try {
      await api.checkinDesfazer(id, i.id);
      toast.success('Check-in desfeito');
      carregar();
    } catch (e: any) { toast.error(e?.message || 'Erro ao desfazer'); }
  }

  // ── Leitor de QR (contínuo) ──────────────────────────────────────────────
  async function ligarCamera() {
    try {
      const s = new Html5Qrcode('insc-checkin-qr');
      scannerRef.current = s;
      await s.start(
        { facingMode: 'environment' },
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
            <a href={linkPublico} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" title="Abre o formulário público — mesma validação, nenhum atalho">
                <UserPlus className="h-3.5 w-3.5 mr-1" /> Inscrever na hora
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

        {/* Feedback do último registro (grande — dá pra ler de longe na porta) */}
        {feedback && (
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
        )}

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

            <div className="mt-3 divide-y divide-border/60 max-h-[52vh] overflow-y-auto">
              {listaFiltrada.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {busca ? 'Ninguém encontrado com essa busca.' : 'Nenhuma inscrição ainda.'}
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

          {/* Leitor de QR */}
          <Card className="glass-solid p-4">
            <div className="text-sm font-semibold mb-2">Ler QR do comprovante</div>
            <div id="insc-checkin-qr" className="w-full rounded-xl overflow-hidden bg-black/20" style={{ minHeight: lendo ? 260 : 0 }} />
            <Button onClick={lendo ? desligarCamera : ligarCamera} variant={lendo ? 'destructive' : 'default'} className="w-full mt-3 gap-2">
              {lendo ? <><CameraOff className="h-4 w-4" /> Parar leitura</> : <><Camera className="h-4 w-4" /> Ligar câmera</>}
            </Button>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              A leitura fica ligada direto — aponte um QR atrás do outro. Quem não tiver o comprovante entra pela busca ao lado.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
