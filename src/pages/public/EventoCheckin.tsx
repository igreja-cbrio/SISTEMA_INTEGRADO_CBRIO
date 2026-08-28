// Autoatendimento de check-in do evento (2026-08-28).
// A pessoa lê o QR na porta, digita CPF + nascimento, o sistema pergunta
// "você é fulano?" e ela confirma. Três passos, um por tela — na fila da porta
// ninguém lê formulário comprido.
//
// ⚠️ O nome vem MASCARADO do servidor (primeiro nome + iniciais). A tela nunca
// monta nome completo: CPF identifica, não autentica.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePublicTheme } from './publicTheme';
import { mascaraCpf } from '../../lib/inscricao';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

type Evento = { nome: string; data: string | null; hora: string | null; local: string | null };
type Achado = { id: string; nome_mascarado: string; ja_fez_checkin: boolean };

async function chamar(url: string, body?: any) {
  const r = await fetch(url, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Não foi possível concluir.');
  return j;
}

export default function EventoCheckin() {
  const { token } = useParams();
  const { C } = usePublicTheme();
  const [evento, setEvento] = useState<Evento | null>(null);
  const [erroAbrir, setErroAbrir] = useState('');
  const [cpf, setCpf] = useState('');
  const [nasc, setNasc] = useState('');
  const [achado, setAchado] = useState<Achado | null>(null);
  const [pronto, setPronto] = useState<{ primeiro_nome: string; numero_sorte: number | null; ja_checkin: boolean } | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const enviando = useRef(false);

  useEffect(() => {
    chamar(`${API}/public/evento-checkin/${token}`)
      .then(r => setEvento(r.evento))
      .catch(e => setErroAbrir(e.message));
  }, [token]);

  const buscar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando.current) return;
    enviando.current = true; setErro(''); setCarregando(true);
    try {
      const r = await chamar(`${API}/public/evento-checkin/${token}/buscar`, { cpf, nascimento: nasc });
      setAchado(r.inscricao);
    } catch (err: any) { setErro(err.message); }
    finally { enviando.current = false; setCarregando(false); }
  };

  const confirmar = async () => {
    if (enviando.current) return;
    enviando.current = true; setErro(''); setCarregando(true);
    try {
      const r = await chamar(`${API}/public/evento-checkin/${token}/confirmar`, { cpf, nascimento: nasc });
      setPronto(r);
    } catch (err: any) { setErro(err.message); }
    finally { enviando.current = false; setCarregando(false); }
  };

  const recomecar = () => {
    setCpf(''); setNasc(''); setAchado(null); setPronto(null); setErro('');
  };

  const caixa: React.CSSProperties = {
    maxWidth: 420, margin: '0 auto', padding: '32px 20px 64px',
  };
  const campo: React.CSSProperties = {
    display: 'block', width: '100%', padding: '14px 12px', fontSize: 18,
    borderRadius: 12, border: `1px solid ${C.inputBorder}`, background: 'transparent',
    color: C.text, marginTop: 6, boxSizing: 'border-box',
  };
  const botao: React.CSSProperties = {
    width: '100%', padding: '16px', fontSize: 17, fontWeight: 700, marginTop: 20,
    borderRadius: 12, border: 'none', background: '#00B39D', color: '#fff', cursor: 'pointer',
  };

  if (erroAbrir) {
    return (
      <div style={caixa}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Check-in indisponível</h1>
        <p style={{ color: C.text3, marginTop: 10, lineHeight: 1.5 }}>{erroAbrir}</p>
        <p style={{ color: C.text3, marginTop: 10, lineHeight: 1.5 }}>
          Procure alguém da equipe na entrada — eles conseguem fazer o seu check-in.
        </p>
      </div>
    );
  }
  if (!evento) return <div style={{ ...caixa, color: C.text3 }}>Abrindo…</div>;

  // ── 3º passo: pronto ─────────────────────────────────────────────────────
  if (pronto) {
    return (
      <div style={caixa}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: '#00B39D', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34,
          margin: '0 auto 18px',
        }}>&#10003;</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, textAlign: 'center', color: C.text, margin: 0 }}>
          {pronto.ja_checkin ? 'Você já estava aqui!' : `Bem-vindo, ${pronto.primeiro_nome}!`}
        </h1>
        <p style={{ textAlign: 'center', color: C.text3, marginTop: 10, lineHeight: 1.5 }}>
          {pronto.ja_checkin
            ? 'Seu check-in já tinha sido feito. Pode entrar.'
            : 'Check-in feito. Pode entrar.'}
        </p>
        {pronto.numero_sorte != null && (
          <div style={{
            marginTop: 22, padding: 18, borderRadius: 14, textAlign: 'center',
            background: '#00B39D18', border: '1px solid #00B39D40',
          }}>
            <div style={{ fontSize: 12, color: C.text3, letterSpacing: 1, textTransform: 'uppercase' }}>
              Seu número da sorte
            </div>
            <div style={{ fontSize: 40, fontWeight: 800, color: '#00B39D', lineHeight: 1.1 }}>
              {pronto.numero_sorte}
            </div>
          </div>
        )}
        <button style={{ ...botao, background: 'transparent', color: C.text3, border: `1px solid ${C.cardBorder}` }}
          onClick={recomecar}>
          Fazer o check-in de outra pessoa
        </button>
      </div>
    );
  }

  // ── 2º passo: "você é fulano?" ───────────────────────────────────────────
  if (achado) {
    return (
      <div style={caixa}>
        <p style={{ fontSize: 13, color: C.text3, textTransform: 'uppercase', letterSpacing: 1 }}>
          {evento.nome}
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '10px 0 4px', lineHeight: 1.2 }}>
          Você é {achado.nome_mascarado}?
        </h1>
        {achado.ja_fez_checkin && (
          <p style={{ color: C.text3, marginTop: 10 }}>Esta inscrição já tem check-in feito.</p>
        )}
        {erro && <p style={{ color: '#ef4444', marginTop: 12, fontSize: 14 }}>{erro}</p>}
        <button style={botao} onClick={confirmar} disabled={carregando}>
          {carregando ? 'Confirmando…' : 'Sim, sou eu — fazer check-in'}
        </button>
        <button
          style={{ ...botao, background: 'transparent', color: C.text3, border: `1px solid ${C.cardBorder}`, marginTop: 10 }}
          onClick={recomecar}
        >
          Não sou eu
        </button>
      </div>
    );
  }

  // ── 1º passo: CPF + nascimento ───────────────────────────────────────────
  return (
    <div style={caixa}>
      <p style={{ fontSize: 13, color: C.text3, textTransform: 'uppercase', letterSpacing: 1 }}>
        Check-in
      </p>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '8px 0 6px', lineHeight: 1.2 }}>
        {evento.nome}
      </h1>
      <p style={{ color: C.text3, marginBottom: 22, lineHeight: 1.5 }}>
        Informe seu CPF e sua data de nascimento para confirmar sua presença.
      </p>
      <form onSubmit={buscar}>
        <label style={{ fontSize: 14, color: C.text3 }}>
          CPF
          <input
            style={campo} inputMode="numeric" autoComplete="off" required
            placeholder="000.000.000-00"
            value={cpf} onChange={e => setCpf(mascaraCpf(e.target.value))}
          />
        </label>
        <label style={{ fontSize: 14, color: C.text3, display: 'block', marginTop: 18 }}>
          Data de nascimento
          <input
            style={campo} type="date" required
            value={nasc} onChange={e => setNasc(e.target.value)}
          />
        </label>
        {erro && <p style={{ color: '#ef4444', marginTop: 14, fontSize: 14, lineHeight: 1.5 }}>{erro}</p>}
        <button style={botao} type="submit" disabled={carregando}>
          {carregando ? 'Procurando…' : 'Continuar'}
        </button>
      </form>
    </div>
  );
}
