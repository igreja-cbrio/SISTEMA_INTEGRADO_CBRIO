import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { revisoes } from '../api';
import { toast } from 'sonner';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', purple: '#8b5cf6',
};

const fmtDate = (d) => { if (!d) return '-'; try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };
const fmtMoney = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : '-';
const diasAtraso = (dateEnd) => {
  if (!dateEnd) return 0;
  return Math.ceil((new Date() - new Date(dateEnd + 'T23:59:59')) / 86400000);
};

export default function RevisaoEstrategica() {
  const navigate = useNavigate();
  const [diag, setDiag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterArea, setFilterArea] = useState('all');
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterResp, setFilterResp] = useState('all');

  const loadDiag = useCallback(async () => {
    setLoading(true);
    try { setDiag(await revisoes.diagnostico()); } catch { toast.error('Erro ao carregar diagnostico'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDiag(); }, [loadDiag]);

  if (loading || !diag) return <div style={{ padding: 60, textAlign: 'center', color: C.t3, fontSize: 14 }}>Carregando diagnostico...</div>;

  const hoje = new Date().toISOString().split('T')[0];
  const { projetos: p, expansao: e, dependencias: dep } = diag;

  const allItems = [
    ...(p.lista || []).map(x => ({ ...x, _tipo: 'projeto' })),
    ...(e.lista || []).filter(x => x.status !== 'concluido' && x.status !== 'cancelado').map(x => ({ ...x, _tipo: 'expansao' })),
  ].map(x => ({ ...x, _dias: diasAtraso(x.date_end) }));

  const areas = [...new Set(allItems.map(x => x.area).filter(Boolean))].sort();
  const responsaveis = [...new Set(allItems.map(x => x.responsible).filter(Boolean))].sort();

  const filtered = allItems.filter(x => {
    if (filterArea !== 'all' && x.area !== filterArea) return false;
    if (filterTipo !== 'all' && x._tipo !== filterTipo) return false;
    if (filterStatus === 'atrasado') return x._dias > 0 && x.status !== 'concluido';
    if (filterStatus !== 'all' && x.status !== filterStatus) return false;
    if (filterResp !== 'all' && x.responsible !== filterResp) return false;
    return true;
  }).sort((a, b) => b._dias - a._dias);

  const projAtrasados = (p.lista || []).filter(x => x.date_end && x.date_end < hoje && x.status !== 'concluido');
  const expAtrasados = (e.lista || []).filter(x => x.date_end && x.date_end < hoje && x.status !== 'concluido' && x.status !== 'cancelado');
  const hasFilters = filterArea !== 'all' || filterTipo !== 'all' || filterStatus !== 'all' || filterResp !== 'all';

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 20px' }}>Revisao Estrategica</h1>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Projetos ativos', value: p.total, color: C.blue },
          { label: 'Proj. atrasados', value: projAtrasados.length, color: projAtrasados.length > 0 ? C.red : C.green },
          { label: 'Marcos expansao', value: e.lista.filter(x => x.status !== 'concluido' && x.status !== 'cancelado').length, color: C.purple },
          { label: 'Marcos atrasados', value: expAtrasados.length, color: expAtrasados.length > 0 ? C.red : C.green },
          { label: 'Deps. impactadas', value: dep.impactados, color: dep.impactados > 0 ? C.amber : C.green },
          { label: 'Orcamento em risco', value: fmtMoney(diag.orcamento_risco), color: diag.orcamento_risco > 0 ? C.red : C.green, small: true },
        ].map(k => (
          <div key={k.label} style={{ background: C.card, borderRadius: 12, padding: '14px 16px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: k.small ? 18 : 28, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: C.t3 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { label: 'Area', value: filterArea, set: setFilterArea, opts: areas },
          { label: 'Tipo', value: filterTipo, set: setFilterTipo, opts: [{ v: 'projeto', l: 'Projetos' }, { v: 'expansao', l: 'Expansao' }] },
          { label: 'Status', value: filterStatus, set: setFilterStatus, opts: [{ v: 'atrasado', l: 'Atrasados' }, ...['pendente', 'em_andamento', 'bloqueado', 'pausado'].map(s => ({ v: s, l: s }))] },
          { label: 'Responsavel', value: filterResp, set: setFilterResp, opts: responsaveis },
        ].map(f => (
          <span key={f.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.t2 }}>{f.label}:</span>
            <select value={f.value} onChange={ev => f.set(ev.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12, maxWidth: 180 }}>
              <option value="all">Todos</option>
              {f.opts.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </span>
        ))}
        {hasFilters && <button onClick={() => { setFilterArea('all'); setFilterTipo('all'); setFilterStatus('all'); setFilterResp('all'); }} style={{ fontSize: 11, color: C.red, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Limpar</button>}
        <span style={{ fontSize: 11, color: C.t3, marginLeft: 'auto' }}>{filtered.length} itens</span>
      </div>

      {/* Lista — clica e abre pagina de detalhe */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          {filtered.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum item encontrado.</div>}
          {filtered.map(item => {
            const atrasado = item._dias > 0 && item.status !== 'concluido';
            return (
              <div key={item.id + item._tipo} onClick={() => navigate(`/revisao/${item._tipo}/${item.id}`)} style={{
                padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              }}
                onMouseEnter={ev => ev.currentTarget.style.background = C.bg}
                onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: item._tipo === 'projeto' ? '#3b82f618' : '#8b5cf618', color: item._tipo === 'projeto' ? C.blue : C.purple, fontWeight: 700, flexShrink: 0 }}>{item._tipo === 'projeto' ? 'Proj' : 'Exp'}</span>
                {item.area && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: C.primaryBg, color: C.primary, fontWeight: 500, flexShrink: 0 }}>{item.area}</span>}
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                <span style={{ fontSize: 11, color: C.t3, flexShrink: 0, minWidth: 80 }}>{item.responsible || '-'}</span>
                <span style={{ fontSize: 11, color: C.t3, flexShrink: 0, minWidth: 80 }}>{fmtDate(item.date_end)}</span>
                {atrasado ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.red, flexShrink: 0, minWidth: 65, textAlign: 'right' }}>{item._dias}d atraso</span>
                ) : item.status === 'concluido' ? (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#10b98118', color: C.green, fontWeight: 600, flexShrink: 0 }}>Concluido</span>
                ) : item.date_end && item._dias <= 0 ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.green, flexShrink: 0, minWidth: 65, textAlign: 'right' }}>{Math.abs(item._dias)}d restantes</span>
                ) : (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#9ca3af18', color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>{item.status || 'pendente'}</span>
                )}
                <span style={{ fontSize: 14, color: C.t3 }}>{'\u203A'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
