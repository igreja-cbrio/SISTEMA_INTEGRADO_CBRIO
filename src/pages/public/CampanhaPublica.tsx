// Página PÚBLICA da campanha · /campanha/:slug
//
// Serve dois usos ao mesmo tempo, e é por isso que ela é grande e limpa:
//  1. as TELAS LATERAIS do culto (projetadas, lidas de longe, muitas vezes sem áudio)
//  2. o link que a igreja compartilha (celular na mão)
//
// ⚠️ Fora do AppShell e fora do ProtectedRoute (convenção do repo para página
// pública). Nenhum dado de pessoa aparece aqui — o servidor não manda doador,
// nome nem valor individual.
//
// ⚠️ Faz POLLING de 30s: quem projeta abre uma vez e deixa a aba aberta o culto
// inteiro. Por isso a rota pública tem limiter próprio e está no skip() do
// limiter global — sob o teto por IP a barrinha congelaria no lançamento.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { resolveApiBaseUrl } from '../../lib/api-base';

type Campanha = {
  slug: string; nome: string; descricao_curta?: string; descricao?: string;
  video_url?: string; imagem_url?: string; cor_destaque?: string;
  data_lancamento?: string; data_fim?: string;
  pct: number; bateu_meta: boolean; mostrar_valor: boolean;
  arrecadado?: string; meta?: string;
  digito?: string; exemplo_com_digito?: string; aceita_online?: boolean;
};

const POLL_MS = 30000;

export default function CampanhaPublica() {
  const { slug } = useParams();
  const [c, setC] = useState<Campanha | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'nao_encontrada' | 'erro'>('carregando');
  const timer = useRef<any>(null);

  useEffect(() => {
    let vivo = true;
    // ⚠️ COM a env: sem argumento a função devolve `/api` relativo, que no dev
    // local (front na 8080, API na 3001) bate no próprio Vite e a tela vem vazia.
    const base = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

    const buscar = async () => {
      try {
        const r = await fetch(`${base}/public/campanhas/${encodeURIComponent(String(slug))}`);
        if (!vivo) return;
        if (r.status === 404) { setEstado('nao_encontrada'); return; }
        if (!r.ok) {
          // ⚠️ Erro de rede NÃO apaga o que já está na tela: numa tela projetada,
          // trocar a barrinha por uma mensagem de erro é pior que mostrar o
          // último número conhecido por 30 segundos.
          setEstado((prev) => (prev === 'ok' ? 'ok' : 'erro'));
          return;
        }
        setC(await r.json());
        setEstado('ok');
      } catch {
        if (vivo) setEstado((prev) => (prev === 'ok' ? 'ok' : 'erro'));
      }
    };

    buscar();
    timer.current = setInterval(buscar, POLL_MS);
    return () => { vivo = false; if (timer.current) clearInterval(timer.current); };
  }, [slug]);

  if (estado === 'carregando') {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b1120', color: '#94a3b8', fontFamily: 'system-ui, sans-serif' }}>
      Carregando…
    </div>;
  }
  if (estado === 'nao_encontrada') {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b1120', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Campanha não encontrada</h1>
        <p style={{ color: '#94a3b8', margin: 0 }}>Confira o endereço com a equipe da igreja.</p>
      </div>
    </div>;
  }
  if (estado === 'erro' && !c) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b1120', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Não conseguimos carregar agora</h1>
        <p style={{ color: '#94a3b8', margin: 0 }}>Estamos tentando de novo em alguns segundos.</p>
      </div>
    </div>;
  }
  if (!c) return null;

  const acento = c.cor_destaque || '#00B39D';
  const pct = Math.max(0, Math.min(100, Number(c.pct) || 0));

  return (
    <div style={{
      minHeight: '100vh', background: '#0b1120', color: '#f1f5f9',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vh 6vw',
    }}>
      <div style={{ width: '100%', maxWidth: 900 }}>
        {c.imagem_url && (
          <img src={c.imagem_url} alt=""
            style={{ width: '100%', maxHeight: '32vh', objectFit: 'cover', borderRadius: 18, marginBottom: '4vh', display: 'block' }} />
        )}

        <h1 style={{ fontSize: 'clamp(28px, 5vw, 56px)', lineHeight: 1.1, margin: '0 0 10px', fontWeight: 700 }}>
          {c.nome}
        </h1>
        {c.descricao_curta && (
          <p style={{ fontSize: 'clamp(15px, 2vw, 22px)', color: '#94a3b8', margin: '0 0 5vh', lineHeight: 1.5 }}>
            {c.descricao_curta}
          </p>
        )}

        {/* A barra. `mostrar_valor = false` esconde o número (e o servidor nem o manda). */}
        {c.mostrar_valor && (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 'clamp(30px, 6vw, 68px)', fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {c.arrecadado}
            </div>
            <div style={{ fontSize: 'clamp(14px, 2vw, 20px)', color: '#94a3b8' }}>
              de {c.meta}
            </div>
          </div>
        )}

        <div style={{ height: 'clamp(14px, 2.4vw, 26px)', background: 'rgba(255,255,255,0.09)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%', background: acento, borderRadius: 999,
            transition: 'width 900ms cubic-bezier(0.22, 1, 0.36, 1)',
          }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 'clamp(20px, 3.4vw, 38px)', fontWeight: 700, color: acento, fontVariantNumeric: 'tabular-nums' }}>
            {pct}%
          </div>
          {c.bateu_meta && (
            <div style={{ fontSize: 'clamp(14px, 2vw, 20px)', color: acento, alignSelf: 'flex-end' }}>
              Meta alcançada 🎉
            </div>
          )}
        </div>

        {/* ⚠️ O dígito é a instrução de como doar pelo banco — é o único campo
            "interno" que esta página revela, e revelar é o ponto. */}
        {c.digito && (
          <div style={{ marginTop: '5vh', padding: '18px 20px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <div style={{ fontSize: 'clamp(13px, 1.6vw, 17px)', color: '#cbd5e1', lineHeight: 1.6 }}>
              Para a sua doação ser identificada nesta campanha, termine o valor
              da transferência em <strong style={{ color: '#f1f5f9' }}>,{c.digito}</strong>.
              {c.exemplo_com_digito && (
                <> Exemplo: para doar R$ 100, transfira <strong style={{ color: '#f1f5f9' }}>{c.exemplo_com_digito}</strong>.</>
              )}
            </div>
          </div>
        )}

        {c.descricao && (
          <p style={{ marginTop: '4vh', fontSize: 'clamp(13px, 1.6vw, 17px)', color: '#94a3b8', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
            {c.descricao}
          </p>
        )}

        {c.video_url && (
          <a href={c.video_url} target="_blank" rel="noreferrer"
            style={{ display: 'inline-block', marginTop: '4vh', color: acento, fontSize: 'clamp(14px, 1.8vw, 18px)' }}>
            Assistir ao vídeo da campanha →
          </a>
        )}
      </div>
    </div>
  );
}
