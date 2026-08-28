import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { decisaoCulto } from '../../api';

// Página PÚBLICA standalone (fora do AppShell/ProtectedRoute · sem login).
// O VOLUNTÁRIO abre pelo link assinado do culto e lança as decisões na hora,
// do celular dele. O culto vem dentro da assinatura do token — nunca do corpo.
//
// ⚠️ Ferramenta de LOTE: depois de registrar, o formulário limpa e fica pronto
// pra próxima pessoa, sem recarregar. É o que substitui a lista no papel.
//
// ⚠️ Não mostra NOME de ninguém, só o contador. Link vaza (print, grupo de
// WhatsApp) e não pode virar janela pra base de gente.

const PRIMARY = '#00B39D';

type Culto = {
  id: string;
  data: string;
  data_br: string;
  nome: string;
  estado: 'antes' | 'aberto' | 'encerrado';
  aberto: boolean;
  dias_desde: number | null;
  dias_janela: number;
  ja_lancadas: number;
};

export default function DecisaoCulto() {
  const { token } = useParams();
  const [carregando, setCarregando] = useState(true);
  const [culto, setCulto] = useState<Culto | null>(null);
  const [invalido, setInvalido] = useState(false);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [semContato, setSemContato] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ultimo, setUltimo] = useState('');
  const [lancadosAqui, setLancadosAqui] = useState(0);

  useEffect(() => {
    document.title = 'Lançar decisões · CBRio';
    decisaoCulto
      .abrir(token)
      .then((r: Culto) => setCulto(r))
      .catch(() => setInvalido(true))
      .finally(() => setCarregando(false));
  }, [token]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (nome.trim().length < 2) {
      setErro('Informe o nome da pessoa.');
      return;
    }
    const tel = telefone.replace(/\D/g, '');
    if (!semContato && (tel.length < 10 || tel.length > 11)) {
      setErro('Informe o WhatsApp com DDD, ou marque que a pessoa não quis deixar contato.');
      return;
    }
    setEnviando(true);
    try {
      const r = await decisaoCulto.registrar(token, {
        nome: nome.trim(),
        telefone: tel,
        sem_contato: semContato,
      });
      setUltimo(r?.nome || nome.trim().split(/\s+/)[0]);
      setLancadosAqui((n) => n + 1);
      setCulto((c) => (c ? { ...c, ja_lancadas: c.ja_lancadas + 1 } : c));
      setNome('');
      setTelefone('');
      setSemContato(false);
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
    padding: 24,
    background: `linear-gradient(160deg, ${PRIMARY} 0%, #007E70 100%)`,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    textAlign: 'center',
    justifyContent: 'center',
  };
  const card: React.CSSProperties = {
    background: '#fff',
    color: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
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

  // Recusa neutra: link inválido, expirado ou culto inexistente dão a MESMA
  // resposta — distinguir entregaria um oráculo a quem está sondando.
  if (invalido || !culto) {
    return (
      <div style={wrap}>
        <div style={card}>
          <h1 style={{ fontSize: 22, margin: '0 0 10px', color: '#1a1a1a' }}>Link inválido</h1>
          <p style={{ fontSize: 15, color: '#555', lineHeight: 1.5 }}>
            Este link não é válido ou já expirou. Peça o link do culto de hoje
            para a equipe de Integração.
          </p>
        </div>
      </div>
    );
  }

  // ⚠️ ANTES do culto NÃO é erro — é o caso normal. O link é distribuído com
  // dias de antecedência (a Integração manda a semana inteira no grupo), então
  // quem abre na quarta pra ver o que é precisa entender que a mensagem serve e
  // deve ser guardada. Dizer "prazo encerrado" aqui faria a pessoa apagar o
  // link e o culto chegaria sem porta nenhuma.
  if (culto.estado === 'antes') {
    return (
      <div style={wrap}>
        <div style={card}>
          <h1 style={{ fontSize: 22, margin: '0 0 10px' }}>Guarde este link</h1>
          <p style={{ fontSize: 15, color: '#555', lineHeight: 1.6 }}>
            É aqui que você vai lançar as decisões de{' '}
            <strong style={{ color: '#1a1a1a' }}>{culto.nome}</strong>, no dia{' '}
            <strong style={{ color: '#1a1a1a' }}>{culto.data_br}</strong>.
          </p>
          <p style={{ fontSize: 15, color: '#555', lineHeight: 1.6, marginTop: 12 }}>
            O lançamento abre no dia do culto. Até lá, deixe esta mensagem salva
            no seu WhatsApp.
          </p>
          <div
            style={{
              background: '#E8F8F5',
              border: '1px solid #A8E6DA',
              borderRadius: 12,
              padding: 12,
              marginTop: 16,
              fontSize: 13,
              color: '#0B6B5C',
              textAlign: 'left',
              lineHeight: 1.5,
            }}
          >
            No culto você vai precisar só do <strong>nome</strong> e do{' '}
            <strong>WhatsApp</strong> de cada pessoa que tomar a decisão. Dá pra
            lançar uma atrás da outra, sem recarregar.
          </div>
        </div>
      </div>
    );
  }

  if (!culto.aberto) {
    return (
      <div style={wrap}>
        <div style={card}>
          <h1 style={{ fontSize: 22, margin: '0 0 10px' }}>Prazo encerrado</h1>
          <p style={{ fontSize: 15, color: '#555', lineHeight: 1.5 }}>
            O prazo de lançamento do culto <strong>{culto.nome}</strong> já
            passou. Passe os nomes para a equipe de Integração — assim eles
            entram no culto certo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Lançar decisões</h1>
        <p style={{ fontSize: 15, opacity: 0.92, marginTop: 6 }}>
          {culto.nome}{culto.data_br ? ` · ${culto.data_br}` : ''}
        </p>
        <p style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>
          {culto.ja_lancadas} já {culto.ja_lancadas === 1 ? 'lançada' : 'lançadas'} neste culto
        </p>
      </div>

      <div style={card}>
        {ultimo && (
          <div
            style={{
              background: '#E8F8F5',
              border: '1px solid #A8E6DA',
              borderRadius: 12,
              padding: 12,
              marginBottom: 4,
              fontSize: 14,
              color: '#0B6B5C',
            }}
          >
            <strong>{ultimo}</strong> registrado.
            {lancadosAqui > 1 ? ` ${lancadosAqui} nesta sessão.` : ''} Pode
            lançar a próxima pessoa.
          </div>
        )}

        <form onSubmit={enviar}>
          <input
            style={input}
            type="text"
            placeholder="Nome da pessoa"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="off"
          />
          <input
            style={{ ...input, opacity: semContato ? 0.5 : 1 }}
            type="tel"
            placeholder="WhatsApp (com DDD)"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            autoComplete="off"
            inputMode="numeric"
            disabled={semContato}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 12,
              fontSize: 13,
              color: '#666',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={semContato}
              onChange={(e) => setSemContato(e.target.checked)}
              style={{ width: 18, height: 18, flexShrink: 0, accentColor: PRIMARY }}
            />
            <span>A pessoa não quis deixar contato</span>
          </label>

          {erro && <p style={{ color: '#C0392B', fontSize: 14, marginTop: 12 }}>{erro}</p>}

          <button style={btn} type="submit" disabled={enviando}>
            {enviando ? 'Registrando…' : 'Registrar decisão'}
          </button>
        </form>

        <p style={{ fontSize: 12, color: '#999', marginTop: 16, lineHeight: 1.5, textAlign: 'left' }}>
          Criança e adolescente são registrados pela equipe do Kids, junto com o
          responsável.
        </p>
      </div>

      <p style={{ fontSize: 13, opacity: 0.8, marginTop: 18 }}>
        Comunidade Batista do Rio
      </p>
    </div>
  );
}
