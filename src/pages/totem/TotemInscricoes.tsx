// ============================================================================
// Totem de Inscrições · quiosque (2026-08-05 · Fase 0)
//
// Rota PÚBLICA (fora do ProtectedRoute): quem se autentica é o EQUIPAMENTO, por
// credencial de dispositivo — não uma conta de e-mail/senha compartilhada num
// PC de hall. Ver src/lib/totemEstacao.ts e backend/routes/totem.js.
//
// Fase 0 entrega o esqueleto: pareamento → atração, com heartbeat e
// auto-despareamento quando a equipe revoga. O fluxo de inscrição e o Pix
// entram na Fase 1 (etapas próprias, teclado virtual, regras de idle/LGPD).
//
// ⚠️ Tema sólido de propósito (o vidro NÃO se aplica a totem · CLAUDE.md) e
// ⚠️ NENHUM dado de pessoa em storage, em momento nenhum.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  lerCredencial, limparCredencial, parear, eu, ErroTotem,
  EVENTO_DESPAREADO, type EstacaoTotem,
} from '../../lib/totemEstacao';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // espelha o backend (sem O/0/I/1)
const CODIGO_LEN = 8;

type Etapa = 'carregando' | 'nao_pareada' | 'atracao' | 'sem_rede';

export default function TotemInscricoes() {
  const [etapa, setEtapa] = useState<Etapa>('carregando');
  const [estacao, setEstacao] = useState<EstacaoTotem | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => new Date());

  const relogio = useRef<number | null>(null);

  // ── Confirma a credencial com o servidor (e bate o ponto) ──
  const confirmar = useCallback(async () => {
    if (!lerCredencial()) { setEtapa('nao_pareada'); return; }
    try {
      const r = await eu();
      setEstacao(r.estacao);
      setAviso(null);
      setEtapa('atracao');
    } catch (e) {
      const err = e as ErroTotem;
      if (err.limparCredencial) {
        // A equipe revogou (ou o token expirou): o `limparCredencial` do lib já
        // apagou o storage. Volta pro pareamento com a razão na tela.
        setEtapa('nao_pareada');
        setAviso(err.message);
        return;
      }
      if (err.reason === 'ip_nao_permitido') {
        // ⚠️ NÃO desparear: a credencial está boa, a rede é que está errada.
        setEtapa('sem_rede');
        setAviso(err.message);
        return;
      }
      // Instabilidade: mantém o que está na tela em vez de derrubar o totem.
      setAviso('Sem conexão com o servidor. Tentando de novo…');
      setEtapa((atual) => (atual === 'carregando' ? 'sem_rede' : atual));
    }
  }, []);

  useEffect(() => { confirmar(); }, [confirmar]);

  // Heartbeat + revalidação. 30s: o backend tem throttle de 60s, então isso não
  // vira UPDATE por request, e a revogação aparece na tela em ≤1 min.
  useEffect(() => {
    const t = setInterval(confirmar, 30000);
    return () => clearInterval(t);
  }, [confirmar]);

  // Despareamento disparado por qualquer chamada do lib (não só a daqui).
  useEffect(() => {
    function ouvir(ev: Event) {
      const motivo = (ev as CustomEvent).detail?.motivo;
      setEtapa('nao_pareada');
      setAviso(motivo === 'estacao_revogada' ? 'Este dispositivo foi desligado pela equipe.' : null);
    }
    window.addEventListener(EVENTO_DESPAREADO, ouvir);
    return () => window.removeEventListener(EVENTO_DESPAREADO, ouvir);
  }, []);

  useEffect(() => {
    relogio.current = window.setInterval(() => setAgora(new Date()), 20000);
    return () => { if (relogio.current) clearInterval(relogio.current); };
  }, []);

  async function entrarFullscreen() {
    try { await document.documentElement.requestFullscreen(); } catch { /* usuário nega ou já está */ }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1220] text-white">
      {etapa === 'carregando' && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-lg text-white/50">Carregando…</p>
        </div>
      )}

      {etapa === 'nao_pareada' && (
        <Pareamento
          aviso={aviso}
          onPareado={(est) => { setEstacao(est); setAviso(null); setEtapa('atracao'); entrarFullscreen(); }}
        />
      )}

      {etapa === 'sem_rede' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-3xl font-semibold">Sem conexão</p>
          <p className="max-w-md text-lg text-white/60">{aviso || 'Não foi possível falar com o servidor.'}</p>
          <button
            onClick={confirmar}
            className="mt-2 min-h-[64px] rounded-xl bg-[#00B39D] px-8 text-lg font-semibold text-black active:opacity-80"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {etapa === 'atracao' && estacao && (
        <Atracao estacao={estacao} agora={agora} aviso={aviso} onFullscreen={entrarFullscreen} />
      )}
    </div>
  );
}

// ── Pareamento ─────────────────────────────────────────────────────────────
// Pad grande em vez de <input>: é touch, sem teclado físico, e o teclado
// virtual do Windows não sobe de forma confiável em Chrome kiosk — foi isso que
// descartou reusar os formulários da web tal como estão.
function Pareamento({ aviso, onPareado }: { aviso: string | null; onPareado: (e: EstacaoTotem) => void }) {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(valor: string) {
    setEnviando(true);
    setErro(null);
    try {
      const est = await parear(valor);
      onPareado(est);
    } catch (e: any) {
      setErro(e.message || 'Código inválido');
      setCodigo('');
    } finally {
      setEnviando(false);
    }
  }

  function digitar(c: string) {
    if (enviando || codigo.length >= CODIGO_LEN) return;
    const novo = codigo + c;
    setCodigo(novo);
    setErro(null);
    // Envia sozinho ao completar: o voluntário não precisa achar o botão.
    if (novo.length === CODIGO_LEN) enviar(novo);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-3xl font-semibold">Conectar este totem</h1>
        <p className="mt-2 text-lg text-white/60">
          Peça o código à equipe (Inscrições → Totens) e digite abaixo.
        </p>

        {aviso && (
          <p className="mx-auto mt-4 max-w-lg rounded-lg bg-amber-500/15 px-4 py-3 text-base text-amber-200">
            {aviso}
          </p>
        )}

        <div className="my-8 flex justify-center gap-2" aria-label="Código de pareamento">
          {Array.from({ length: CODIGO_LEN }).map((_, i) => (
            <div
              key={i}
              className={`flex h-16 w-12 items-center justify-center rounded-lg border-2 font-mono text-2xl font-bold ${
                codigo[i] ? 'border-[#00B39D] bg-white/5' : 'border-white/15'
              }`}
            >
              {codigo[i] || ''}
            </div>
          ))}
        </div>

        {erro && <p className="mb-4 text-lg text-red-400">{erro}</p>}
        {enviando && <p className="mb-4 text-lg text-white/60">Conectando…</p>}

        <div className="mx-auto grid max-w-xl grid-cols-8 gap-2">
          {ALFABETO.split('').map((c) => (
            <button
              key={c}
              onClick={() => digitar(c)}
              disabled={enviando}
              className="min-h-[56px] rounded-lg bg-white/10 text-xl font-semibold active:bg-white/20 disabled:opacity-40"
            >
              {c}
            </button>
          ))}
          <button
            onClick={() => { setCodigo((v) => v.slice(0, -1)); setErro(null); }}
            disabled={enviando || !codigo}
            className="col-span-8 min-h-[56px] rounded-lg bg-white/5 text-lg active:bg-white/15 disabled:opacity-40"
          >
            Apagar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Atração ────────────────────────────────────────────────────────────────
function Atracao({
  estacao, agora, aviso, onFullscreen,
}: { estacao: EstacaoTotem; agora: Date; aviso: string | null; onFullscreen: () => void }) {
  // 5 toques no rodapé abrem o painel do operador (padrão do TotemMembro).
  const [toques, setToques] = useState(0);
  const [operador, setOperador] = useState(false);

  function tocarRodape() {
    const n = toques + 1;
    setToques(n);
    if (n >= 5) { setOperador(true); setToques(0); }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <p className="text-7xl font-light tabular-nums">
          {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <h1 className="mt-8 text-4xl font-semibold">Inscrições</h1>
        <p className="mt-3 max-w-lg text-xl text-white/60">
          Em breve você poderá se inscrever nos eventos por aqui.
        </p>
        {aviso && <p className="mt-6 text-base text-amber-300">{aviso}</p>}
      </div>

      <button
        onClick={tocarRodape}
        className="w-full py-4 text-center text-sm text-white/30"
        aria-label="Informações do totem"
      >
        {estacao.nome} · {estacao.codigo}
      </button>

      {operador && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          {/* ⚠️ Painel do operador NUNCA mostra dado de pessoa — só identidade
              do equipamento e o que ajuda a diagnosticar no domingo. */}
          <div className="w-full max-w-md rounded-2xl bg-[#111a2b] p-6">
            <h2 className="text-xl font-semibold">Este totem</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-white/50">Nome</dt><dd>{estacao.nome}</dd></div>
              <div className="flex justify-between"><dt className="text-white/50">Código</dt><dd className="font-mono">{estacao.codigo}</dd></div>
              <div className="flex justify-between"><dt className="text-white/50">Onde</dt><dd>{estacao.local || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-white/50">Pinpad</dt><dd>{estacao.tef_ativo ? 'ativo' : 'não configurado'}</dd></div>
              <div className="flex justify-between"><dt className="text-white/50">Impressora</dt><dd>{estacao.tem_impressora ? 'configurada' : 'não configurada'}</dd></div>
            </dl>
            <div className="mt-6 space-y-2">
              <button onClick={onFullscreen} className="min-h-[52px] w-full rounded-xl bg-white/10 text-base active:bg-white/20">
                Entrar em tela cheia
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Desconectar este totem? A equipe terá que gerar um código novo pra conectar de volta.')) {
                    limparCredencial('operador');
                  }
                }}
                className="min-h-[52px] w-full rounded-xl bg-red-500/15 text-base text-red-300 active:bg-red-500/25"
              >
                Desconectar este totem
              </button>
              <button onClick={() => setOperador(false)} className="min-h-[52px] w-full rounded-xl text-base text-white/60">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
