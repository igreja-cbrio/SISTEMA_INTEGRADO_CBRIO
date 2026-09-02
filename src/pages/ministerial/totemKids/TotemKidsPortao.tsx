// ============================================================================
// Totem Kids · PORTÃO DE SAÍDA (estação de validação de check-out)
// ============================================================================
// Fica no computador da porta do corredor, em tela cheia, com um leitor de
// código de barras USB (modo teclado/HID). O pai bipa o RECIBO antes de entrar:
//   VERDE  → saída registrada no sistema + mostra a SALA (pra onde ir)
//   ÂMBAR  → anomalia (código já usado / culto antigo / não reconhecido) —
//            NÃO bloqueia: "pode seguir, confirmação na sala" · fica logado
// A custódia real continua na sala (professora confere recibo × etiqueta da
// criança). Regra de ouro: o portão nunca resolve exceção.
// O leitor digita o código (4 chars) + Enter no input invisível sempre focado;
// o voluntário também pode digitar na mão (etiqueta amassada).
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { totemKids } from '@/api';
import { ehFalhaDeRedeOuServidor } from '@/lib/falhaDeRede';
import { ScanLine, CheckCircle2, AlertTriangle, DoorOpen } from 'lucide-react';

type ScanResposta = {
  resultado: 'ok' | 'ja_retirada' | 'fora_de_sessao' | 'nao_reconhecido';
  crianca?: string | null;
  sala?: { nome: string; cor?: string | null } | null;
  retirada_em?: string | null;
};

type Tela =
  | { estado: 'pronto' }
  | { estado: 'validando' }
  | { estado: 'ok'; r: ScanResposta }
  | { estado: 'anomalia'; r: ScanResposta }
  | { estado: 'offline'; desde: number; tentativas: number };

const MSG_ANOMALIA: Record<string, string> = {
  ja_retirada: 'Este código já foi usado numa retirada',
  fora_de_sessao: 'Etiqueta de um culto anterior',
  nao_reconhecido: 'Código não reconhecido',
};

// Beeps via WebAudio (o leitor já bipa na leitura; estes distinguem o RESULTADO)
function beep(tipo: 'ok' | 'alerta') {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const tocar = (freq: number, inicio: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      o.type = 'sine';
      g.gain.setValueAtTime(0.25, ctx.currentTime + inicio);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + dur);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + inicio);
      o.stop(ctx.currentTime + inicio + dur + 0.05);
    };
    if (tipo === 'ok') { tocar(880, 0, 0.12); tocar(1320, 0.14, 0.16); }
    else { tocar(240, 0, 0.5); }
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch { /* sem áudio · segue */ }
}

const fmtHora = (iso?: string | null) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
};

export default function TotemKidsPortao() {
  const [tela, setTela] = useState<Tela>({ estado: 'pronto' });
  const [valor, setValor] = useState('');
  const [sessao, setSessao] = useState<{ culto?: { nome?: string } } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const voltarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guarda anti-releitura: leitor em modo apresentação relê a mesma etiqueta
  // se ela ficar sob o feixe — ignora o MESMO código repetido em < 4s.
  const ultimo = useRef<{ codigo: string; t: number } | null>(null);

  // Sessão aberta (informativo pro voluntário da porta) · re-checa a cada 60s
  useEffect(() => {
    let vivo = true;
    const carregar = () => totemKids.sessoes.atual().then((s: unknown) => { if (vivo) setSessao(s as typeof sessao); }).catch(() => {});
    carregar();
    const id = setInterval(carregar, 60_000);
    return () => { vivo = false; clearInterval(id); };
  }, []);

  // Foco eterno no input (o leitor é um teclado) · qualquer clique refoca
  useEffect(() => {
    const focar = () => inputRef.current?.focus();
    focar();
    const id = setInterval(focar, 2000);
    document.addEventListener('click', focar);
    return () => { clearInterval(id); document.removeEventListener('click', focar); };
  }, []);

  // Tela cheia acesa (best-effort · nem todo navegador suporta)
  useEffect(() => {
    let lock: { release?: () => Promise<void> } | null = null;
    (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } })
      .wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release?.().catch(() => {}); };
  }, []);

  const agendarVolta = useCallback((ms: number) => {
    if (voltarTimer.current) clearTimeout(voltarTimer.current);
    voltarTimer.current = setTimeout(() => setTela({ estado: 'pronto' }), ms);
  }, []);

  const submeter = useCallback(async (bruto: string) => {
    const codigo = bruto.toUpperCase().trim();
    setValor('');
    if (!codigo) return;
    const agora = Date.now();
    if (ultimo.current && ultimo.current.codigo === codigo && agora - ultimo.current.t < 4000) return;
    ultimo.current = { codigo, t: agora };

    setTela({ estado: 'validando' });
    try {
      const r: ScanResposta = await totemKids.portao.scan(codigo);
      if (r.resultado === 'ok') {
        beep('ok');
        setTela({ estado: 'ok', r });
        agendarVolta(3500);
      } else {
        beep('alerta');
        setTela({ estado: 'anomalia', r });
        agendarVolta(6000);
      }
    } catch (e) {
      // ⚠️ Portão NUNCA trava a fila — degrada pro fluxo manual. Isso não muda.
      beep('alerta');
      // ⚠️⚠️ O QUE MUDOU (02/09/2026): o modo offline agora é PEGAJOSO.
      // Antes, `agendarVolta(5000)` devolvia a tela para "Aproxime a etiqueta"
      // 5 s depois da falha — e o voluntário seguia bipando um leitor que não
      // validava nada, achando que estava funcionando. A tela MENTIA.
      // Agora ela fica, contando as tentativas, até um scan dar certo.
      // ⚠️ O campo continua ativo: quem bipar de novo tenta de novo. Ficar
      // preso seria trocar uma mentira por uma trava.
      setTela((t) => ({
        estado: 'offline',
        desde: t.estado === 'offline' ? t.desde : Date.now(),
        tentativas: t.estado === 'offline' ? t.tentativas + 1 : 1,
      }));
      // ⚠️ Sem `agendarVolta`: é justamente o que fazia a tela voltar a mentir.
      if (voltarTimer.current) clearTimeout(voltarTimer.current);
      // Erro de NEGÓCIO (4xx) não é queda — vale registrar no console pra
      // diagnóstico, mas a tela é a mesma: a conferência é na sala.
      if (!ehFalhaDeRedeOuServidor(e)) console.warn('[portao] recusa do servidor:', e);
    }
  }, [agendarVolta]);

  const corSala = tela.estado === 'ok' ? (tela.r.sala?.cor || '#10b981') : '#10b981';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-white select-none">
      {/* Barra do topo · identifica a estação + sessão aberta */}
      <div className="flex items-center justify-between px-6 py-3 text-slate-300 border-b border-white/10">
        <div className="flex items-center gap-2 font-bold tracking-wide">
          <DoorOpen className="h-5 w-5 text-emerald-400" /> Portão Kids · Saída
        </div>
        <div className="text-sm">
          {sessao?.culto?.nome
            ? <span className="text-emerald-300">Sessão aberta · {sessao.culto.nome}</span>
            : <span className="text-amber-300">Nenhuma sessão aberta</span>}
        </div>
      </div>

      {/* Input invisível · o leitor de código de barras digita aqui */}
      <input
        ref={inputRef}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submeter(valor); }}
        autoFocus
        autoComplete="off"
        aria-label="Código da etiqueta"
        className="absolute opacity-0 pointer-events-none h-0 w-0"
      />

      {/* Corpo em tela cheia por estado */}
      {tela.estado === 'pronto' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 text-center">
          <div className="relative">
            <ScanLine className="h-32 w-32 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-5xl font-black tracking-tight">Aproxime a etiqueta do leitor</h1>
            <p className="text-slate-400 mt-4 text-2xl">Bipou? Pode entrar no corredor e buscar seu filho na sala.</p>
          </div>
          <p className="text-slate-500 text-sm">Etiqueta amassada não leu? O voluntário digita o código de 4 letras.</p>
        </div>
      )}

      {tela.estado === 'validando' && (
        <div className="flex-1 flex items-center justify-center">
          <ScanLine className="h-24 w-24 text-slate-400 animate-spin" />
        </div>
      )}

      {tela.estado === 'ok' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center" style={{ background: 'linear-gradient(180deg, #065f46 0%, #047857 100%)' }}>
          <CheckCircle2 className="h-36 w-36 text-white drop-shadow-lg" />
          <div>
            <h1 className="text-6xl font-black tracking-tight">{tela.r.crianca || 'Liberado'}</h1>
            {tela.r.sala && (
              <div className="mt-6 inline-flex items-center gap-3 rounded-2xl px-8 py-4 text-4xl font-black shadow-xl" style={{ background: corSala }}>
                Sala {tela.r.sala.nome}
              </div>
            )}
            <p className="text-emerald-100 mt-6 text-2xl">Pode entrar · a professora confere a etiqueta na sala.</p>
          </div>
        </div>
      )}

      {tela.estado === 'anomalia' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center" style={{ background: 'linear-gradient(180deg, #78350f 0%, #92400e 100%)' }}>
          <AlertTriangle className="h-32 w-32 text-amber-200" />
          <div>
            <h1 className="text-5xl font-black tracking-tight">
              {MSG_ANOMALIA[tela.r.resultado] || 'Atenção'}
              {tela.r.resultado === 'ja_retirada' && tela.r.retirada_em ? ` (às ${fmtHora(tela.r.retirada_em)})` : ''}
            </h1>
            {tela.r.crianca && <p className="text-amber-100 mt-3 text-3xl font-bold">{tela.r.crianca}</p>}
            <p className="text-amber-100 mt-6 text-3xl font-bold">Pode seguir — confirmação na sala.</p>
            <p className="text-amber-200/80 mt-2 text-lg">O aviso ficou registrado pra equipe do Kids.</p>
          </div>
        </div>
      )}

      {tela.estado === 'offline' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center bg-amber-950">
          <AlertTriangle className="h-24 w-24 text-amber-300" />
          <div>
            <h1 className="text-4xl font-black text-amber-100">SEM SISTEMA</h1>
            {/* ⚠️ A frase tem que dizer a PRÓXIMA AÇÃO. Voluntário rotaciona
                toda semana — não há o que ele "lembre" do treinamento. */}
            <p className="text-amber-50 mt-4 text-3xl font-bold">
              A conferência é na sala, com o recibo.
            </p>
            <p className="text-amber-200/90 mt-3 text-xl">
              Pode seguir com a fila normalmente. Nada é perdido — a equipe do Kids registra depois.
            </p>
            <p className="text-amber-300/70 mt-6 text-base tabular-nums">
              {tela.tentativas} tentativa{tela.tentativas > 1 ? 's' : ''} sem resposta ·
              {' '}desde {new Date(tela.desde).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-amber-300/70 mt-1 text-base">
              Bipe outra etiqueta para tentar de novo. Esta tela sai sozinha quando o sistema voltar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
