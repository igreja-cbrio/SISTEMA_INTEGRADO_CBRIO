import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { nps as api } from '../../api';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, MessageSquare, ChevronLeft } from 'lucide-react';
import NpsForm from '../../components/nps/NpsForm';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', primary: '#00B39D', cyan: '#06b6d4',
};

export default function NpsResponder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pesquisa, setPesquisa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get(id);
        setPesquisa(data);
      } catch (e) {
        toast.error(e.message || 'Pesquisa não encontrada');
      }
      setLoading(false);
    })();
  }, [id]);

  async function enviar({ score, respostas, comentario }) {
    setEnviando(true);
    try {
      await api.responder(id, { score, respostas, comentario });
      setEnviado(true);
    } catch (e) {
      if (e.status === 409) {
        toast.info('Você já respondeu essa pesquisa');
        setEnviado(true);
      } else {
        toast.error(e.message || 'Erro ao enviar');
      }
    }
    setEnviando(false);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, color: C.t3 }}>
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  if (!pesquisa) {
    return (
      <div style={{ maxWidth: 600, margin: '40px auto', padding: 24, textAlign: 'center', color: C.t2 }}>
        <p>Pesquisa não encontrada.</p>
        <button onClick={() => navigate('/nps')} style={{ marginTop: 12, background: 'none', border: 'none', color: C.primary, cursor: 'pointer' }}>Voltar</button>
      </div>
    );
  }

  if (enviado) {
    return (
      <div style={{ maxWidth: 600, margin: '40px auto', padding: 32, textAlign: 'center', background: C.card, borderRadius: 12, border: `1px solid ${C.border}` }}>
        <CheckCircle2 size={56} style={{ color: C.cyan, marginBottom: 16 }} />
        <h2 style={{ margin: '0 0 8px', fontSize: 22, color: C.text }}>Obrigado pela sua resposta!</h2>
        <p style={{ fontSize: 14, color: C.t2, margin: '0 0 24px' }}>Sua opinião nos ajuda a melhorar.</p>
        <button onClick={() => navigate('/nps')} style={{ padding: '10px 20px', borderRadius: 8, background: C.cyan, color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
          Voltar para NPS
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <button onClick={() => navigate('/nps')} style={{ background: 'none', border: 'none', color: C.t2, cursor: 'pointer', fontSize: 12, marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <ChevronLeft size={14} />Voltar
      </button>

      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <MessageSquare size={20} style={{ color: C.cyan }} />
          <h1 style={{ margin: 0, fontSize: 22, color: C.text, fontWeight: 700 }}>{pesquisa.titulo}</h1>
        </div>
        {pesquisa.perguntas?.descricao_curta && (
          <p style={{ margin: '0 0 24px', fontSize: 13, color: C.t2, lineHeight: 1.5 }}>{pesquisa.perguntas.descricao_curta}</p>
        )}

        <NpsForm pesquisa={pesquisa} onSubmit={enviar} enviando={enviando} />
      </div>
    </div>
  );
}
