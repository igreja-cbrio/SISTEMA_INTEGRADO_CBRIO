// =====================================================================
// Execução do Planejamento · detalhe somente-leitura da proposta
// =====================================================================
// Inspirada na aba Info de Projetos (src/pages/Projetos.jsx:1436-1545):
// grid de cards por bloco, texto/labels apenas — nenhum input editável.
// A aba Fases só existe para natureza in (projeto, evento) e mostra o
// Kanban do Projeto/Evento vinculado (ou o estado vazio, com o CTA de
// materializar quando a proposta já está no calendário).
// =====================================================================
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { planejamentoAnual as api } from '../../api';
import {
  C, cardStyle, btn, hint, Badge, fmtBRL, fmtData, fmtQuando, rotuloArea,
  DIAS_SEMANA,
} from '../planejamentoAnual/comum';
import FasesKanban from './FasesKanban';

const CORES_NATUREZA = { evento: C.blue, projeto: C.purple, rotina: C.primary };
const ROTULO_NATUREZA = { evento: 'Evento', projeto: 'Projeto', rotina: 'Rotina' };
const ROTULO_ESTADO = { aprovada: 'Aprovada', aprovada_ressalvas: 'Aprovada com ressalvas' };

const infoLabel = { fontSize: 11.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 };
const infoValue = { fontSize: 13.5, color: C.text, lineHeight: 1.5 };

function Bloco({ titulo, children }) {
  return (
    <div style={{ ...cardStyle, padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 12 }}>{titulo}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Campo({ rotulo, children, full }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div style={infoLabel}>{rotulo}</div>
      <div style={infoValue}>{children ?? '—'}</div>
    </div>
  );
}

function custeioDe(p) {
  const custo = Number(p.custo) || 0;
  const arrec = p.tem_arrecadacao ? Number(p.arrecadacao_prevista) || 0 : 0;
  const liquido = Math.round((custo - arrec) * 100) / 100;
  const modelo = !p.tem_arrecadacao || arrec === 0
    ? 'Custeio integral pela igreja'
    : arrec < custo ? 'Custeio parcial' : 'Autossustentado pela arrecadação';
  return { liquido, modelo };
}

export default function PropostaDetalhe({ id, areas, onVoltar }) {
  const [p, setP] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState('info');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setP(await api.execucao.proposta(id)); }
    catch (e) { toast.error(e.message || 'Erro ao carregar a proposta'); }
    finally { setCarregando(false); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  if (carregando && !p) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 40px' }}>
        <p style={{ fontSize: 13, color: C.t3 }}>Carregando…</p>
      </div>
    );
  }
  if (!p) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 40px' }}>
        <button style={btn('ghost')} onClick={onVoltar}><ArrowLeft size={14} /> Voltar</button>
        <p style={{ fontSize: 13, color: C.t3, marginTop: 12 }}>Proposta não encontrada.</p>
      </div>
    );
  }

  const temFases = p.natureza === 'projeto' || p.natureza === 'evento';
  const { liquido, modelo } = custeioDe(p);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 40px' }}>
      <button style={{ ...btn('ghost'), marginBottom: 12 }} onClick={onVoltar}><ArrowLeft size={14} /> Voltar</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>{p.nome}</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <Badge texto={ROTULO_NATUREZA[p.natureza] || p.natureza} cor={CORES_NATUREZA[p.natureza] || C.primary} />
            <Badge texto={rotuloArea(p.area, areas)} cor={C.t2} />
            <Badge texto={ROTULO_ESTADO[p.estado] || p.estado} cor={p.estado === 'aprovada' ? C.green : C.amber} />
            {p.no_calendario ? <Badge texto="No calendário" cor={C.green} /> : <Badge texto="Aguardando calendário" cor={C.amber} />}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${C.border}`, marginBottom: 20 }}>
        <button
          onClick={() => setAba('info')}
          style={{
            padding: '9px 16px', fontSize: 13, fontWeight: aba === 'info' ? 700 : 500, cursor: 'pointer',
            background: 'transparent', border: 'none', borderBottom: aba === 'info' ? `2px solid ${C.primary}` : '2px solid transparent',
            color: aba === 'info' ? C.primary : C.t2, marginBottom: -2,
          }}
        >Info</button>
        {temFases && (
          <button
            onClick={() => setAba('fases')}
            style={{
              padding: '9px 16px', fontSize: 13, fontWeight: aba === 'fases' ? 700 : 500, cursor: 'pointer',
              background: 'transparent', border: 'none', borderBottom: aba === 'fases' ? `2px solid ${C.primary}` : '2px solid transparent',
              color: aba === 'fases' ? C.primary : C.t2, marginBottom: -2,
            }}
          >Fases</button>
        )}
      </div>

      {aba === 'info' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <Bloco titulo="Dados básicos">
            <Campo rotulo="Natureza">{ROTULO_NATUREZA[p.natureza] || p.natureza}</Campo>
            <Campo rotulo="Área">{rotuloArea(p.area, areas)}</Campo>
            <Campo rotulo="Líder responsável">{p.lider_nome || '—'}</Campo>
            <Campo rotulo="Quando">{fmtQuando(p)}</Campo>
            <Campo rotulo="Público-alvo">{p.publico_alvo}</Campo>
            <Campo rotulo="Descrição" full>{p.descricao}</Campo>
          </Bloco>

          <Bloco titulo="Local e recorrência">
            <Campo rotulo="Local">{p.local_nome || (p.local_fora_detalhe ? `Fora da igreja: ${p.local_fora_detalhe}` : '—')}</Campo>
            <Campo rotulo="Recorrência">{p.recorrencia}</Campo>
            <Campo rotulo="Dia da semana">{p.dia_semana != null ? DIAS_SEMANA[p.dia_semana] : '—'}</Campo>
            <Campo rotulo="Horário">{p.hora_inicio ? `${String(p.hora_inicio).slice(0, 5)} – ${p.hora_fim ? String(p.hora_fim).slice(0, 5) : '?'}` : '—'}</Campo>
          </Bloco>

          <Bloco titulo="Avaliação">
            <Campo rotulo="Alcance estimado">{p.alcance_pct != null ? `${p.alcance_pct}%` : '—'}</Campo>
            <Campo rotulo="Público considerado">{p.publico_considerado === 'recorte_geracional' ? 'Recorte geracional' : 'Igreja inteira'}</Campo>
            <Campo rotulo="Pertencimento" full>{p.pertencimento}</Campo>
            <Campo rotulo="Transformação e valores" full>
              {Array.isArray(p.valores) && p.valores.length
                ? p.valores.map((v) => `${v.nome}: ${v.justificativa || '—'}`).join(' · ')
                : '—'}
            </Campo>
            <Campo rotulo="Visão CBRio" full>{p.visao_explique}</Campo>
            <Campo rotulo="Impacto" full>{p.impacto}</Campo>
          </Bloco>

          <Bloco titulo="Impacto, custo e arrecadação">
            <Campo rotulo="Custo total">{fmtBRL(p.custo)}</Campo>
            <Campo rotulo="Haverá arrecadação?">{p.tem_arrecadacao ? 'Sim' : 'Não'}</Campo>
            {p.tem_arrecadacao && <Campo rotulo="Arrecadação prevista">{fmtBRL(p.arrecadacao_prevista)}</Campo>}
            <Campo rotulo="Líquido para a igreja">{fmtBRL(liquido)}</Campo>
            <Campo rotulo="Modelo de custeio" full>{modelo}</Campo>
          </Bloco>

          {p.natureza === 'rotina' && (
            <Bloco titulo="Dados da rotina">
              <Campo rotulo="Categoria">{p.rotina_config?.categoria || 'Sem categoria de rotina'}</Campo>
              <Campo rotulo="Solicitação gerada">
                {p.rotina_config?.ultima_geracao_em
                  ? `Gerada em ${fmtData(p.rotina_config.ultima_geracao_em)}`
                  : 'Ainda não foi gerada'}
              </Campo>
              {p.rotina_config?.dados && Object.keys(p.rotina_config.dados).length > 0 && (
                <Campo rotulo="Detalhes informados" full>
                  <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 12.5, whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(p.rotina_config.dados, null, 2)}
                  </pre>
                </Campo>
              )}
            </Bloco>
          )}
        </div>
      )}

      {aba === 'fases' && temFases && (
        <FasesKanban proposta={p} onMaterializado={carregar} />
      )}
    </div>
  );
}
