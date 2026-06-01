import { useEffect, useState } from 'react';
import { decisaoOnline } from '../../api';

// Pagina PUBLICA standalone (fora do AppShell/ProtectedRoute · sem login).
// Link fixado na descricao/chat da live. Quem assiste online e decide por
// Jesus preenche nome + telefone · alimenta cultos.decisoes_online automatico.

const PRIMARY = '#00B39D';

type Culto = { id: string; data: string; nome: string };

export default function DecisaoOnline() {
  const [carregando, setCarregando] = useState(true);
  const [ativo, setAtivo] = useState(false);
  const [aoVivo, setAoVivo] = useState(false);
  const [culto, setCulto] = useState<Culto | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    document.title = 'Eu aceito Jesus · CBRio';
    decisaoOnline
      .ativo()
      .then((r: { ativo: boolean; aoVivo?: boolean; culto: Culto | null }) => {
        setAtivo(!!r.ativo);
        setAoVivo(!!r.aoVivo);
        setCulto(r.culto || null);
      })
      .catch(() => setAtivo(false))
      .finally(() => setCarregando(false));
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (nome.trim().length < 2) {
      setErro('Por favor, informe seu nome.');
      return;
    }
    setEnviando(true);
    try {
      await decisaoOnline.registrar({ nome: nome.trim(), telefone: telefone.trim() });
      setPronto(true);
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível registrar agora. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  const wrap: React.CSSProperties = {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: `linear-gradient(160deg, ${PRIMARY} 0%, #007E70 100%)`,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    textAlign: 'center',
  };
  const card: React.CSSProperties = {
    background: '#fff',
    color: '#1a1a1a',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 18px 50px rgba(0,0,0,.25)',
  };
  const input: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    fontSize: 16,
    borderRadius: 12,
    border: '1.5px solid #d9d9d9',
    marginTop: 12,
    boxSizing: 'border-box',
  };
  const btn: React.CSSProperties = {
    width: '100%',
    padding: '15px 16px',
    fontSize: 17,
    fontWeight: 700,
    color: '#fff',
    background: PRIMARY,
    border: 'none',
    borderRadius: 12,
    marginTop: 18,
    cursor: 'pointer',
    opacity: enviando ? 0.7 : 1,
  };

  if (carregando) {
    return (
      <div style={wrap}>
        <p style={{ fontSize: 18, opacity: 0.9 }}>Carregando…</p>
      </div>
    );
  }

  if (pronto) {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={{ fontSize: 52 }}>🙌</div>
          <h1 style={{ fontSize: 26, margin: '12px 0 8px', color: PRIMARY }}>
            Que decisão linda!
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: '#444' }}>
            O céu está em festa por você. Nossa equipe vai entrar em contato para
            te ajudar nos primeiros passos com Jesus.
          </p>
          <p style={{ fontSize: 14, color: '#888', marginTop: 16 }}>
            "Se você confessar com a sua boca que Jesus é Senhor… será salvo." — Rm 10.9
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0 }}>Eu aceito Jesus</h1>
        <p style={{ fontSize: 16, opacity: 0.92, marginTop: 8 }}>
          Decidiu seguir a Jesus assistindo online? Registre aqui — queremos
          caminhar com você.
        </p>
      </div>

      <div style={card}>
        {!ativo && (
          <div
            style={{
              background: '#FFF7E6',
              border: '1px solid #FFE0A3',
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
              fontSize: 14,
              color: '#8A6D1F',
            }}
          >
            Não há culto ao vivo neste momento. Assista em{' '}
            <strong>cbrio.tv</strong> — sua decisão pode ser registrada durante a
            transmissão.
          </div>
        )}

        {culto && ativo && (
          <p style={{ fontSize: 13, color: '#888', margin: '0 0 4px' }}>
            {aoVivo ? `Ao vivo agora · ${culto.nome}` : `Culto de hoje · ${culto.nome}`}
          </p>
        )}

        <form onSubmit={enviar}>
          <input
            style={input}
            type="text"
            placeholder="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="name"
            disabled={!ativo}
          />
          <input
            style={input}
            type="tel"
            placeholder="Seu WhatsApp (com DDD)"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            autoComplete="tel"
            inputMode="numeric"
            disabled={!ativo}
          />
          {erro && (
            <p style={{ color: '#C0392B', fontSize: 14, marginTop: 12 }}>{erro}</p>
          )}
          <button style={btn} type="submit" disabled={enviando || !ativo}>
            {enviando ? 'Enviando…' : 'Aceito Jesus em minha vida'}
          </button>
        </form>
      </div>

      <p style={{ fontSize: 13, opacity: 0.8, marginTop: 20 }}>
        Comunidade Batista do Rio · cbrio.tv
      </p>
    </div>
  );
}
