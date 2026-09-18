import { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw, CalendarClock, Layers } from 'lucide-react';
import { planejamentoAnual as api } from '../../api';
import { C, cardStyle, btn, hint, rotuloArea } from './comum';

const TIPO_ROTULO = { agenda: 'Conflito de agenda', espaco: 'Conflito de espaço' };

function ConflitoCard({ conflito, areas }) {
  const cor = conflito.firme && !conflito.aceito ? C.red : C.amber;
  return (
    <div style={{ ...cardStyle, padding: 14, borderLeft: `3px solid ${cor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: cor, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {TIPO_ROTULO[conflito.tipo] || conflito.tipo} · {conflito.firme ? 'confirmado' : 'possível'}
        </span>
        {conflito.aceito && <span style={{ fontSize: 11, color: C.t3 }}>· já aceito pelo Pastor presidente</span>}
      </div>
      <div style={{ fontSize: 13.5, color: C.text, display: 'grid', gap: 2 }}>
        <div><strong>{conflito.proposta_a.nome}</strong> <span style={{ color: C.t3 }}>· {rotuloArea(conflito.proposta_a.area, areas)}</span></div>
        <div style={{ fontSize: 11, color: C.t3 }}>com</div>
        <div><strong>{conflito.proposta_b.nome}</strong> <span style={{ color: C.t3 }}>· {rotuloArea(conflito.proposta_b.area, areas)}</span></div>
      </div>
    </div>
  );
}

function GrupoSimilarCard({ grupo, areas }) {
  return (
    <div style={{ ...cardStyle, padding: 14, borderLeft: `3px solid ${C.purple}` }}>
      <div style={{ display: 'grid', gap: 2, marginBottom: 8 }}>
        {grupo.propostas.map((p) => (
          <div key={p.id} style={{ fontSize: 13.5, color: C.text }}>
            <strong>{p.nome}</strong> <span style={{ color: C.t3 }}>· {rotuloArea(p.area, areas)}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: C.t2 }}>{grupo.motivo}</div>
    </div>
  );
}

// Aba somente-visualização (diretoria/Pastor presidente) · nenhuma ação
// aqui altera proposta nenhuma. Conflitos de data/espaço são calculados
// pela mesma régua determinística do resto do módulo; propostas parecidas
// e observações vêm de uma leitura por IA, best-effort — se ela falhar os
// conflitos continuam de pé.
export default function InsightsTab({ ciclo, areas }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    if (!ciclo?.id) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await api.ciclos.insights(ciclo.id);
      setDados(r);
    } catch (e) {
      setErro(e?.status === 403
        ? 'Os insights de IA são visíveis só para a diretoria e o Pastor presidente.'
        : (e.message || 'Erro ao gerar os insights.'));
    } finally { setCarregando(false); }
  }, [ciclo?.id]);

  useEffect(() => { carregar(); }, [carregar]);

  if (carregando) return <p style={{ fontSize: 13, color: C.t3 }}>Analisando as propostas do ciclo…</p>;
  if (erro) return <p style={{ fontSize: 13, color: C.red }}>{erro}</p>;
  if (!dados) return null;

  const { conflitos = [], ia = {}, propostas_consideradas = 0 } = dados;
  const conflitosAbertos = conflitos.filter((c) => c.firme && !c.aceito);
  const conflitosResto = conflitos.filter((c) => !(c.firme && !c.aceito));

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px', borderRadius: 12, background: 'var(--panel, var(--cbrio-card))',
        border: '1px solid var(--hairline)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color={C.primary} />
          <span style={{ fontSize: 12.5, color: C.t2 }}>
            Leitura automática de <strong>{propostas_consideradas}</strong> proposta(s) enviadas neste ciclo · só visualização, nada aqui altera propostas.
          </span>
        </div>
        <button style={btn('ghost')} onClick={carregar}><RefreshCw size={13} /> Atualizar</button>
      </div>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
          <CalendarClock size={16} /> Conflitos de data e espaço
        </h3>
        {!conflitos.length && (
          <p style={{ fontSize: 12.5, color: C.t3 }}>Nenhum conflito encontrado entre as propostas enviadas.</p>
        )}
        {conflitosAbertos.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {conflitosAbertos.map((c, i) => <ConflitoCard key={i} conflito={c} areas={areas} />)}
          </div>
        )}
        {conflitosResto.length > 0 && (
          <details>
            <summary style={{ fontSize: 12, color: C.t3, cursor: 'pointer' }}>
              + {conflitosResto.length} coincidência(s) já aceita(s) ou não confirmada(s)
            </summary>
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {conflitosResto.map((c, i) => <ConflitoCard key={i} conflito={c} areas={areas} />)}
            </div>
          </details>
        )}
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
          <Layers size={16} /> Propostas parecidas · candidatas a mesclar
        </h3>
        {!ia.disponivel && (
          <p style={{ fontSize: 12.5, color: C.amber }}>
            A leitura por IA não está disponível agora{ia.motivo ? ` (${ia.motivo})` : ''}. Os conflitos de data acima continuam confiáveis — não dependem de IA.
          </p>
        )}
        {ia.disponivel && !(ia.grupos_similares || []).length && (
          <p style={{ fontSize: 12.5, color: C.t3 }}>Nenhuma proposta parecida foi encontrada.</p>
        )}
        {(ia.grupos_similares || []).length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {ia.grupos_similares.map((g, i) => <GrupoSimilarCard key={i} grupo={g} areas={areas} />)}
          </div>
        )}
      </section>

      {ia.disponivel && (ia.observacoes || []).length > 0 && (
        <section style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>Outras observações</h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {ia.observacoes.map((o, i) => <li key={i} style={{ fontSize: 12.5, color: C.t2 }}>{o}</li>)}
          </ul>
        </section>
      )}

      <p style={{ ...hint, marginTop: 4 }}>
        Insights gerados automaticamente para orientar a diretoria — não substituem a avaliação nem a decisão do Pastor presidente.
      </p>
    </div>
  );
}
