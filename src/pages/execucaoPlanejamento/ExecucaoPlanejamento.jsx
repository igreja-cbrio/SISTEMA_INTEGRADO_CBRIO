// =====================================================================
// Execução do Planejamento (2026-09-23)
// =====================================================================
// Módulo novo que unifica Eventos/Projetos/Rotinas nascidos do ciclo de
// propostas do Planejamento Anual: lista as propostas APROVADAS (cross-
// ciclo, com seletor), abre um detalhe somente-leitura (aba Info) e, para
// projeto/evento, uma aba Fases em Kanban do vínculo materializado.
//
// Decisão do plano: a proposta aprovada NÃO materializa projeto/evento
// sozinha — a criação do vínculo só fica disponível depois que a proposta
// entra no calendário (no_calendario, calculado no backend por
// PA.noCalendario) e é sempre um clique humano dentro desta tela.
// =====================================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { CalendarRange } from 'lucide-react';
import { planejamentoAnual as api } from '../../api';
import ModuleHeader from '../../components/layout/ModuleHeader';
import { C, cardStyle, input, hint, Badge, fmtQuando, rotuloArea } from '../planejamentoAnual/comum';
import PropostaDetalhe from './PropostaDetalhe';

// Mesma paleta de CalendarioAno.jsx (planejamentoAnual) — cor por natureza.
const CORES_NATUREZA = { evento: C.blue, projeto: C.purple, rotina: C.primary };
const ROTULO_NATUREZA = { evento: 'Evento', projeto: 'Projeto', rotina: 'Rotina' };

const thStyle = { textAlign: 'left', padding: '8px 10px', fontSize: 11.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--hairline)' };
const tdStyle = { padding: '9px 10px', fontSize: 13, color: C.text, borderBottom: '1px solid var(--hairline)', verticalAlign: 'top' };

export default function ExecucaoPlanejamento() {
  const [ciclos, setCiclos] = useState([]);
  const [areas, setAreas] = useState([]);
  const [cicloId, setCicloId] = useState('');
  const [natureza, setNatureza] = useState('');
  const [area, setArea] = useState('');
  const [propostas, setPropostas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [propostaId, setPropostaId] = useState(null);

  useEffect(() => {
    api.ciclos.list().then((l) => setCiclos(Array.isArray(l) ? l : [])).catch(() => {});
    api.areas().then((l) => setAreas(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const params = {};
      if (cicloId) params.ciclo_id = cicloId;
      if (natureza) params.natureza = natureza;
      if (area) params.area = area;
      const lista = await api.execucao.propostas(Object.keys(params).length ? params : undefined);
      setPropostas(Array.isArray(lista) ? lista : []);
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar as propostas aprovadas');
    } finally { setCarregando(false); }
  }, [cicloId, natureza, area]);
  useEffect(() => { carregar(); }, [carregar]);

  const areasComPropostas = useMemo(() => areas, [areas]);

  if (propostaId) {
    return (
      <PropostaDetalhe
        id={propostaId}
        areas={areas}
        onVoltar={() => { setPropostaId(null); carregar(); }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 40px' }}>
      <ModuleHeader
        icon={CalendarRange}
        title="Execução do Planejamento"
        subtitle="Propostas aprovadas do Planejamento Anual — detalhe somente-leitura e fases do Projeto/Evento vinculado"
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ minWidth: 160 }}>
          <span style={{ ...hint, display: 'block', marginBottom: 3 }}>Ciclo</span>
          <select style={input} value={cicloId} onChange={(e) => setCicloId(e.target.value)}>
            <option value="">Todos os ciclos</option>
            {ciclos.map((c) => <option key={c.id} value={c.id}>Ciclo {c.ano}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <span style={{ ...hint, display: 'block', marginBottom: 3 }}>Categoria (natureza)</span>
          <select style={input} value={natureza} onChange={(e) => setNatureza(e.target.value)}>
            <option value="">Todas</option>
            <option value="evento">Evento</option>
            <option value="projeto">Projeto</option>
            <option value="rotina">Rotina</option>
          </select>
        </div>
        <div style={{ minWidth: 200 }}>
          <span style={{ ...hint, display: 'block', marginBottom: 3 }}>Área</span>
          <select style={input} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Todas</option>
            {areasComPropostas.map((a) => <option key={a.area} value={a.area}>{a.rotulo || a.area}</option>)}
          </select>
        </div>
      </div>

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={thStyle}>Proposta</th>
              <th style={thStyle}>Natureza</th>
              <th style={thStyle}>Área</th>
              <th style={thStyle}>Líder</th>
              <th style={thStyle}>Data</th>
              <th style={thStyle}>Calendário</th>
              <th style={thStyle}>Vínculo</th>
            </tr></thead>
            <tbody>
              {carregando && <tr><td style={tdStyle} colSpan={7}>Carregando…</td></tr>}
              {!carregando && !propostas.length && (
                <tr><td style={tdStyle} colSpan={7}>Nenhuma proposta aprovada encontrada com estes filtros.</td></tr>
              )}
              {propostas.map((p) => (
                <tr
                  key={p.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setPropostaId(p.id)}
                >
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{p.nome}</td>
                  <td style={tdStyle}>
                    <Badge texto={ROTULO_NATUREZA[p.natureza] || p.natureza} cor={CORES_NATUREZA[p.natureza] || C.primary} />
                  </td>
                  <td style={tdStyle}>{rotuloArea(p.area, areas)}</td>
                  <td style={tdStyle}>{p.lider_nome || '—'}</td>
                  <td style={tdStyle}>{fmtQuando(p)}</td>
                  <td style={tdStyle}>
                    {p.no_calendario ? (
                      <Badge texto="No calendário" cor={C.green} />
                    ) : (
                      <Badge texto="Aguardando calendário" cor={C.amber} />
                    )}
                  </td>
                  <td style={tdStyle}>
                    {p.vinculo?.tipo === 'projeto' && <Badge texto="Projeto criado" cor={C.purple} />}
                    {p.vinculo?.tipo === 'evento' && <Badge texto="Evento criado" cor={C.blue} />}
                    {!p.vinculo?.tipo && p.natureza === 'rotina' && <span style={{ color: C.t3, fontSize: 12 }}>Não se aplica</span>}
                    {!p.vinculo?.tipo && p.natureza !== 'rotina' && <span style={{ color: C.t3, fontSize: 12 }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
