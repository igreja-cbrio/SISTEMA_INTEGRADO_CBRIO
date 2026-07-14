"use client";

// ============================================================================
// Pedrinho · assistente IA da CBRio (pop lateral flutuante)
// Abre pelo botão no canto inferior direito. Chat com streaming + VOZ na
// resposta (ElevenLabs via backend, fallback voz do navegador) + visual
// "onda" estilo Siri enquanto o Pedrinho fala.
// ============================================================================
import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Sparkles, X, Plus, Volume2, VolumeX, Send, Loader2, History, Square, Trash2 } from 'lucide-react';
import { agents } from '../../api';
import { SiriWave } from '../ui/siri-wave';
import { pedrinhoFalar, pedrinhoParar } from '../../lib/pedrinhoVoz';

const PRIMARY = '#00B39D';
const VOZ_KEY = 'cbrio-pedrinho-voz';

type Msg = { role: 'user' | 'assistant' | 'error' | 'system'; text: string };

export default function ChatIAFloating() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState<boolean>(() => {
    try { return localStorage.getItem(VOZ_KEY) !== '0'; } catch { return true; }
  });
  const [sessions, setSessions] = useState<any[]>([]);
  const [showHist, setShowHist] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;

  useEffect(() => { try { localStorage.setItem(VOZ_KEY, voiceOn ? '1' : '0'); } catch { /* ignore */ } }, [voiceOn]);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);

  // Ao fechar o painel, para de falar.
  useEffect(() => { if (!open) { pedrinhoParar(); setSpeaking(false); } }, [open]);
  // Cleanup ao desmontar.
  useEffect(() => () => pedrinhoParar(), []);

  const carregarSessoes = useCallback(async () => {
    try { setSessions(await agents.sessions()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { if (open) carregarSessoes(); }, [open, carregarSessoes]);

  function falar(texto: string) {
    if (!texto) return;
    pedrinhoFalar(texto, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
  }
  function pararVoz() { pedrinhoParar(); setSpeaking(false); }

  function novaConversa() {
    pararVoz();
    setMessages([]);
    setSessionId(null);
    carregarSessoes();
  }

  async function resumir(sess: any) {
    pararVoz();
    setShowHist(false);
    setSessionId(sess.anthropic_session_id);
    try {
      const msgs = await agents.sessionMessages(sess.id);
      setMessages((msgs || []).map((m: any) => ({ role: m.role, text: m.content })));
    } catch {
      setMessages([{ role: 'system', text: `Conversa restaurada.` }]);
    }
  }

  async function apagarSessao(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await agents.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch { /* ignore */ }
  }

  async function enviar() {
    const texto = input.trim();
    if (!texto || streaming) return;
    pararVoz();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: texto }, { role: 'assistant', text: '' }]);
    setStreaming(true);

    let respostaFinal = '';
    try {
      const res = await agents.chat({ message: texto, module: 'supervisor', sessionId });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const ev = JSON.parse(data);
            if (ev.type === 'session') { setSessionId(ev.sessionId); }
            else if (ev.type === 'delta') {
              respostaFinal += ev.text;
              setMessages((prev) => {
                const up = [...prev];
                const last = up.length - 1;
                if (up[last]?.role === 'assistant') up[last] = { ...up[last], text: up[last].text + ev.text };
                return up;
              });
            } else if (ev.type === 'error') {
              respostaFinal = '';
              setMessages((prev) => {
                const up = [...prev];
                const last = up.length - 1;
                if (up[last]?.role === 'assistant') up[last] = { role: 'error', text: ev.text };
                return up;
              });
            }
          } catch { /* skip */ }
        }
      }
    } catch (e: any) {
      setMessages((prev) => {
        const up = [...prev];
        const last = up.length - 1;
        if (up[last]?.role === 'assistant' && !up[last].text) up[last] = { role: 'error', text: e.message };
        else up.push({ role: 'error', text: e.message });
        return up;
      });
    }
    setStreaming(false);
    carregarSessoes();
    if (respostaFinal && voiceOnRef.current) falar(respostaFinal);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
  }

  // ── Botão flutuante ──────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir o Pedrinho"
        title="Pedrinho · assistente IA da CBRio"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all duration-150 ring-2 ring-white/20 hover:ring-white/40"
        style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, #008e7d 100%)`, boxShadow: `0 8px 24px ${PRIMARY}55, 0 2px 8px rgba(0,0,0,0.12)` }}
      >
        <Sparkles className="h-6 w-6" strokeWidth={2.2} />
      </button>
    );
  }

  // ── Painel do Pedrinho ───────────────────────────────────────────────
  return (
    <div
      className="fixed z-[60] flex flex-col overflow-hidden rounded-2xl border shadow-2xl
                 inset-x-3 bottom-3 top-[8vh]
                 sm:inset-auto sm:right-6 sm:bottom-6 sm:top-auto sm:h-[640px] sm:w-[400px] sm:max-h-[85vh]"
      style={{ background: 'var(--cbrio-card)', borderColor: 'var(--cbrio-border)' }}
      role="dialog"
      aria-label="Pedrinho, assistente IA"
    >
      {/* Cabeçalho */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--cbrio-border)' }}>
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full text-white flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${PRIMARY}, #008e7d)` }}>
          <Sparkles className="h-4.5 w-4.5" strokeWidth={2.2} />
          {speaking && <span className="absolute inset-0 rounded-full animate-ping" style={{ background: `${PRIMARY}44` }} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[15px] leading-tight" style={{ color: 'var(--cbrio-text)' }}>Pedrinho</div>
          <div className="text-[11px] leading-tight" style={{ color: 'var(--cbrio-text3)' }}>
            {speaking ? 'falando…' : streaming ? 'pensando…' : 'assistente CBRio'}
          </div>
        </div>
        <HeaderBtn title={voiceOn ? 'Desligar voz' : 'Ligar voz'} onClick={() => { if (voiceOn) pararVoz(); setVoiceOn((v) => !v); }} active={voiceOn}>
          {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </HeaderBtn>
        <div className="relative">
          <HeaderBtn title="Conversas" onClick={() => setShowHist((s) => !s)}><History className="h-4 w-4" /></HeaderBtn>
          {showHist && (
            <div className="absolute right-0 top-10 z-10 w-64 max-h-72 overflow-y-auto rounded-xl border shadow-xl py-1"
              style={{ background: 'var(--cbrio-card)', borderColor: 'var(--cbrio-border)' }}>
              {sessions.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs" style={{ color: 'var(--cbrio-text3)' }}>Nenhuma conversa ainda</div>
              ) : sessions.map((sess) => (
                <div key={sess.id} onClick={() => resumir(sess)}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
                  <span className="flex-1 truncate text-xs" style={{ color: 'var(--cbrio-text)' }}>{sess.title || 'Sem título'}</span>
                  <button onClick={(e) => apagarSessao(sess.id, e)} className="opacity-60 hover:opacity-100" title="Apagar">
                    <Trash2 className="h-3.5 w-3.5" style={{ color: '#ef4444' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <HeaderBtn title="Nova conversa" onClick={novaConversa}><Plus className="h-4 w-4" /></HeaderBtn>
        <HeaderBtn title="Fechar" onClick={() => setOpen(false)}><X className="h-4 w-4" /></HeaderBtn>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3.5 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-white"
              style={{ background: `linear-gradient(135deg, ${PRIMARY}, #008e7d)` }}>
              <Sparkles className="h-7 w-7" />
            </span>
            <div className="font-bold text-[15px]" style={{ color: 'var(--cbrio-text)' }}>Oi, eu sou o Pedrinho 👋</div>
            <div className="text-[12.5px] leading-relaxed" style={{ color: 'var(--cbrio-text3)' }}>
              Pergunte qualquer coisa sobre a CBRio — eu respondo com os dados reais do sistema{voiceOn ? ' e falo a resposta pra você' : ''}.
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[85%] rounded-2xl px-3 py-2 text-[13.5px] leading-relaxed"
              style={
                m.role === 'user'
                  ? { background: PRIMARY, color: '#fff', borderBottomRightRadius: 6 }
                  : m.role === 'error'
                  ? { background: '#ef444418', color: '#ef4444', border: '1px solid #ef444440', borderBottomLeftRadius: 6 }
                  : m.role === 'system'
                  ? { background: `${PRIMARY}14`, color: 'var(--cbrio-text2)', fontStyle: 'italic', fontSize: 12 }
                  : { background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)', border: '1px solid var(--cbrio-border)', borderBottomLeftRadius: 6 }
              }
            >
              {m.role === 'assistant' ? (
                <div className="pedrinho-md">
                  {m.text ? <ReactMarkdown>{m.text}</ReactMarkdown> : (streaming && i === messages.length - 1 ? <TypingDots /> : null)}
                </div>
              ) : (
                <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Onda de voz · barra integrada logo acima do campo de digitar */}
      {speaking && (
        <div className="relative mx-3 mb-1 flex-shrink-0 overflow-hidden rounded-xl" style={{ height: 58, background: '#000' }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <SiriWave variant="wave" size={360} renderScale={0.6} style={{ width: '100%', height: 240, borderRadius: 0 }} />
          </div>
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[11px] font-semibold text-white/85">
            Pedrinho está falando…
          </span>
          <button onClick={pararVoz} title="Parar voz"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/25">
            <Square className="h-3 w-3" fill="currentColor" /> parar
          </button>
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-2 border-t px-3 py-2.5 flex-shrink-0" style={{ borderColor: 'var(--cbrio-border)' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Fale com o Pedrinho…"
          rows={1}
          disabled={streaming}
          className="flex-1 resize-none rounded-xl border px-3 py-2 text-[13.5px] outline-none focus:ring-2"
          style={{ background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)', borderColor: 'var(--cbrio-border)', maxHeight: 110, minHeight: 40 }}
        />
        <button
          onClick={enviar}
          disabled={!input.trim() || streaming}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-40"
          style={{ background: PRIMARY }}
          title="Enviar"
        >
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>

      <style>{`
        .pedrinho-md p { margin: 0 0 6px; }
        .pedrinho-md p:last-child { margin-bottom: 0; }
        .pedrinho-md ul, .pedrinho-md ol { margin: 4px 0; padding-left: 18px; }
        .pedrinho-md li { margin: 2px 0; }
        .pedrinho-md strong { font-weight: 700; }
        .pedrinho-md a { color: ${PRIMARY}; text-decoration: underline; }
        .pedrinho-md code { font-family: ui-monospace, monospace; font-size: 12px; background: rgba(127,127,127,.15); padding: 1px 4px; border-radius: 4px; }
        .pedrinho-md h1, .pedrinho-md h2, .pedrinho-md h3 { font-size: 14px; font-weight: 700; margin: 6px 0 4px; }
      `}</style>
    </div>
  );
}

function HeaderBtn({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10"
      style={{ color: active ? PRIMARY : 'var(--cbrio-text2)' }}
    >
      {children}
    </button>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: PRIMARY, animation: `pedrinhoBounce 1.4s ${i * 0.16}s infinite ease-in-out both` }} />
      ))}
      <style>{`@keyframes pedrinhoBounce { 0%,80%,100% { transform: scale(0.6); opacity: .3 } 40% { transform: scale(1); opacity: 1 } }`}</style>
    </span>
  );
}
