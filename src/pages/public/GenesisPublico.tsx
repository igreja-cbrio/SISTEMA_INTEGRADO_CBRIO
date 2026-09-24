// /genesis · o link SEMPRE ABERTO do Genesis CBA (24/09/2026).
// Mostra os Genesis ativos: com um só, vai direto pro formulário; com vários, a
// pessoa escolhe a igreja; sem nenhum, diz que não há inscrição aberta agora.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { eventoPublico } from '../../api';

const fmt = (s?: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

export default function GenesisPublico() {
  const navigate = useNavigate();
  const [edicoes, setEdicoes] = useState<any[] | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    eventoPublico.serie('genesis')
      .then((r: any) => {
        const lista = Array.isArray(r?.edicoes) ? r.edicoes : [];
        if (lista.length === 1) { navigate(`/genesis/${lista[0].slug}`, { replace: true }); return; }
        setEdicoes(lista);
      })
      .catch((e: any) => setErro(e?.message || 'Não foi possível carregar agora.'));
  }, [navigate]);

  return (
    <div style={{ minHeight: '100vh', background: '#0b1416', color: '#fff', display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: '#00B39D' }}>Genesis</h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 6 }}>Inscrições · CBA em parceria com a CBRio</p>
        {erro ? (
          <p style={{ marginTop: 24, color: 'rgba(255,255,255,0.8)' }}>{erro}</p>
        ) : edicoes === null ? (
          <p style={{ marginTop: 24, color: 'rgba(255,255,255,0.6)' }}>Carregando…</p>
        ) : edicoes.length === 0 ? (
          <p style={{ marginTop: 24, color: 'rgba(255,255,255,0.8)' }}>
            Não há Genesis com inscrições abertas no momento. Volte a este link quando a próxima data for anunciada.
          </p>
        ) : (
          <div style={{ marginTop: 24, display: 'grid', gap: 10 }}>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', margin: 0 }}>Escolha o Genesis em que você vai participar:</p>
            {edicoes.map((e) => (
              <button key={e.slug} onClick={() => navigate(`/genesis/${e.slug}`)} style={{
                textAlign: 'left', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                background: 'rgba(0,179,157,0.10)', border: '1px solid rgba(0,179,157,0.35)', color: '#fff',
              }}>
                <div style={{ fontWeight: 700 }}>{e.igreja?.nome || e.nome}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                  {[fmt(e.data), e.hora, e.local || [e.igreja?.cidade, e.igreja?.estado].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
