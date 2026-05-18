/**
 * Planejamento Anual — lista de ciclos (página inicial)
 *
 * Admin: cria/abre/fecha ciclos. Outros: clicam num ciclo aberto pra propor.
 * Após PR-B: filas de aprovação aparecem aqui também (dependendo da role).
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { planejamento as planApi } from '../../api';
import RevisaoModal from './RevisaoModal';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', amber: '#f59e0b', red: '#ef4444', blue: '#3b82f6',
};

const STATUS_LABEL = {
  aberto: { label: 'Aberto', color: C.green },
  fechado: { label: 'Fechado', color: C.t3 },
};

export default function AnualCiclos() {
  const { isPMO, role } = useAuth();
  const isAdmin = role === 'admin' || role === 'diretor';
  const [ciclos, setCiclos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newYear, setNewYear] = useState(new Date().getFullYear() + 1);
  const [newDesc, setNewDesc] = useState('');

  // Filas de aprovação (vazias se usuário não tem essa role)
  const [filaDir, setFilaDir] = useState([]);
  const [filaDirGeral, setFilaDirGeral] = useState([]);
  const [revisando, setRevisando] = useState(null); // { proposta, etapa }

  const load = () => {
    setLoading(true);
    Promise.all([
      planApi.listCiclos().then(d => Array.isArray(d) ? d : []),
      planApi.filaDiretor().then(d => Array.isArray(d) ? d : []).catch(() => []),
      planApi.filaDiretoria().then(d => Array.isArray(d) ? d : []).catch(() => []),
    ]).then(([cs, fd, fdg]) => {
      setCiclos(cs); setFilaDir(fd); setFilaDirGeral(fdg);
    }).catch(e => setError(e.message))
    .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setError('');
    try {
      await planApi.createCiclo({ year: parseInt(newYear, 10), description: newDesc });
      setCreating(false);
      setNewDesc('');
      load();
    } catch (e) { setError(e.message); }
  };

  const handleToggle = async (ciclo) => {
    const newStatus = ciclo.status === 'aberto' ? 'fechado' : 'aberto';
    if (!window.confirm(`${newStatus === 'fechado' ? 'Fechar' : 'Reabrir'} ciclo ${ciclo.year}?`)) return;
    try {
      await planApi.updateCiclo(ciclo.id, { status: newStatus });
      load();
    } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text }}>Planejamento Anual</h1>
        {isAdmin && !creating && (
          <button onClick={() => setCreating(true)}
            style={{ padding: '8px 16px', background: C.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Abrir ciclo
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: C.t2, marginBottom: 24 }}>
        Cada outubro abrimos o ciclo do ano seguinte. Líderes propõem séries, eventos e projetos. Diretores de setor fazem 1ª aprovação. Diretoria geral aprova final.
      </p>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fee2e2', color: C.red, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Filas de aprovação (só aparecem se há itens pro usuário) */}
      {(filaDir.length > 0 || filaDirGeral.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12, marginBottom: 24 }}>
          {filaDir.length > 0 && (
            <FilaCard titulo="Aguardando sua aprovação (diretor do setor)" itens={filaDir} cor={C.amber}
              onRevisar={(p) => setRevisando({ proposta: p, etapa: 'diretor' })} />
          )}
          {filaDirGeral.length > 0 && (
            <FilaCard titulo="Aguardando aprovação final da diretoria" itens={filaDirGeral} cor={C.blue}
              onRevisar={(p) => setRevisando({ proposta: p, etapa: 'diretoria' })} />
          )}
        </div>
      )}

      {creating && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 12 }}>Abrir novo ciclo</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: C.t3, marginBottom: 4 }}>Ano</label>
              <input type="number" value={newYear} onChange={e => setNewYear(e.target.value)} min={2026} max={2050}
                style={{ width: 100, padding: 8, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text }} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 11, color: C.t3, marginBottom: 4 }}>Descrição (opcional)</label>
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Ex: Ciclo de planejamento 2027"
                style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text }} />
            </div>
            <button onClick={handleCreate}
              style={{ padding: '8px 16px', background: C.primary, color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Criar
            </button>
            <button onClick={() => { setCreating(false); setError(''); }}
              style={{ padding: '8px 16px', background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.t3 }}>Carregando...</div>
      ) : ciclos.length === 0 ? (
        <div style={{ background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12, padding: 40, textAlign: 'center', color: C.t3 }}>
          Nenhum ciclo aberto ainda. {isAdmin && 'Clique em "+ Abrir ciclo" para começar.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {ciclos.map(c => {
            const meta = STATUS_LABEL[c.status] || { label: c.status, color: C.t3 };
            return (
              <Link key={c.id} to={`/planejamento/anual/${c.id}`}
                style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, textDecoration: 'none', color: 'inherit', display: 'block', transition: 'transform .1s' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: C.text }}>{c.year}</div>
                  <span style={{ padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: `${meta.color}20`, color: meta.color }}>
                    {meta.label}
                  </span>
                </div>
                {c.description && <div style={{ fontSize: 12, color: C.t2, marginBottom: 8 }}>{c.description}</div>}
                <div style={{ fontSize: 11, color: C.t3 }}>
                  Aberto em {new Date(c.opened_at).toLocaleDateString('pt-BR')}
                  {c.closed_at && ` · Fechado em ${new Date(c.closed_at).toLocaleDateString('pt-BR')}`}
                </div>
                {isAdmin && (
                  <button onClick={(e) => { e.preventDefault(); handleToggle(c); }}
                    style={{ marginTop: 12, padding: '6px 12px', background: 'transparent', color: c.status === 'aberto' ? C.amber : C.green, border: `1px solid ${c.status === 'aberto' ? C.amber : C.green}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    {c.status === 'aberto' ? 'Fechar ciclo' : 'Reabrir ciclo'}
                  </button>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {revisando && (
        <RevisaoModal
          proposta={revisando.proposta}
          etapa={revisando.etapa}
          onClose={() => setRevisando(null)}
          onDecided={() => { setRevisando(null); load(); }}
        />
      )}
    </div>
  );
}

function FilaCard({ titulo, itens, cor, onRevisar }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${cor}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: cor, marginBottom: 10 }}>{titulo} · {itens.length}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {itens.slice(0, 10).map(p => {
          const titulo = p.payload_atual?.nome || '(sem nome)';
          return (
            <button key={p.id} onClick={() => onRevisar(p)} style={{
              padding: '10px 12px', textAlign: 'left', background: 'var(--cbrio-bg)', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{titulo}</div>
              <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
                {p.tipo} · {p.area} · {p.setor?.nome} · ciclo {p.ciclo?.year} · por {p.proposto?.name || '—'}
              </div>
            </button>
          );
        })}
        {itens.length > 10 && (
          <div style={{ fontSize: 10, color: C.t3, textAlign: 'center', marginTop: 4 }}>
            +{itens.length - 10} item(ns) — abra cada um pra revisar
          </div>
        )}
      </div>
    </div>
  );
}
