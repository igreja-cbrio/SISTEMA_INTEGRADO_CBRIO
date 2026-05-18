import { useState, useEffect, useRef } from 'react';
import { solicitacoes, permissoes } from '../../api';
import { Button } from '../../components/ui/button';
import { Plus, X, Save, Loader2, Users, Search, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

const C = {
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', card: 'var(--cbrio-card)', primary: '#00B39D',
  inputBg: 'var(--cbrio-input-bg)',
};

// Picker com busca · substitui <select>
function PessoaPicker({ disponiveis, onPick }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtrados = q
    ? disponiveis.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q))
    : disponiveis;

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          padding: '8px 10px',
          background: 'var(--cbrio-input-bg)',
          border: '1px solid var(--cbrio-border)',
          borderRadius: 6,
          color: 'var(--cbrio-text3)',
          fontSize: 12,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          textAlign: 'left',
        }}
      >
        <span>+ Adicionar pessoa…</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 50,
          background: 'var(--cbrio-card)',
          border: '1px solid var(--cbrio-border)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          maxHeight: 320,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 10px',
            borderBottom: '1px solid var(--cbrio-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <Search size={14} style={{ color: 'var(--cbrio-text3)' }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou email…"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--cbrio-text)',
                fontSize: 13,
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cbrio-text3)', padding: 0 }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 260 }}>
            {filtrados.length === 0 ? (
              <div style={{ padding: 16, fontSize: 12, color: 'var(--cbrio-text3)', textAlign: 'center' }}>
                {q ? 'Nenhum resultado para "' + query + '"' : 'Sem pessoas disponíveis'}
              </div>
            ) : filtrados.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onPick(p.id);
                  setOpen(false);
                  setQuery('');
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: 'var(--cbrio-text)',
                  borderBottom: '1px solid var(--cbrio-border)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--cbrio-input-bg)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontWeight: 600 }}>{p.name || '(sem nome)'}</div>
                {p.email && (
                  <div style={{ color: 'var(--cbrio-text3)', fontSize: 11, marginTop: 2 }}>{p.email}</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Areas com cor + label amigavel
const AREAS = [
  { id: 'ti',                 label: 'TI',                  color: '#3b82f6' },
  { id: 'marketing',          label: 'Marketing',           color: '#ec4899' },
  { id: 'logistica_compras',  label: 'Compras',             color: '#f97316' },
  { id: 'logistica_estoque',  label: 'Logística · Estoque', color: '#eab308' },
  { id: 'manutencao',         label: 'Manutenção · Infra',  color: '#f59e0b' },
  { id: 'financeiro',         label: 'Financeiro',          color: '#10b981' },
  { id: 'rh',                 label: 'RH · DP',             color: '#8b5cf6' },
  { id: 'reserva_espaco',     label: 'Reserva de Espaço',   color: '#a855f7' },
  { id: 'cozinha',            label: 'Cozinha',             color: '#ef4444' },
  { id: 'limpeza',            label: 'Limpeza',             color: '#06b6d4' },
];

export default function SolicitacoesResponsaveis() {
  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  // Mapa area -> array de profile_ids selecionados (estado local antes de salvar)
  const [editMap, setEditMap] = useState({});

  async function load() {
    setLoading(true);
    try {
      const data = await solicitacoes.areaResponsaveis.list();
      setRows(data || []);
      // Inicializa editMap a partir dos dados
      const map = {};
      AREAS.forEach(a => { map[a.id] = []; });
      (data || []).forEach(r => {
        if (!map[r.area]) map[r.area] = [];
        map[r.area].push(r.profile_id);
      });
      setEditMap(map);
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  }

  async function loadProfiles() {
    try {
      // Endpoint dedicado: exclui quem veio do formulario de membresia ou voluntariado.
      // So mostra colaboradores reais do sistema.
      const data = await permissoes.colaboradores();
      setProfiles(data || []);
    } catch (e) { console.error(e); }
  }

  useEffect(() => { load(); loadProfiles(); }, []);

  function addResponsavel(area, profileId) {
    if (!profileId) return;
    setEditMap(m => {
      const current = m[area] || [];
      if (current.includes(profileId)) return m;
      return { ...m, [area]: [...current, profileId] };
    });
  }

  function removeResponsavel(area, profileId) {
    setEditMap(m => ({
      ...m,
      [area]: (m[area] || []).filter(id => id !== profileId),
    }));
  }

  // Mapa para lookup rapido
  const profileById = Object.fromEntries(profiles.map(p => [p.id, p]));

  // Dados originais por area (pra detectar mudancas)
  const originalByArea = {};
  AREAS.forEach(a => { originalByArea[a.id] = []; });
  rows.forEach(r => {
    if (!originalByArea[r.area]) originalByArea[r.area] = [];
    originalByArea[r.area].push(r.profile_id);
  });

  const isDirty = (area) => {
    const a = (editMap[area] || []).slice().sort().join(',');
    const b = (originalByArea[area] || []).slice().sort().join(',');
    return a !== b;
  };

  const dirtyAreas = AREAS.filter(a => isDirty(a.id));

  async function salvarTudo() {
    if (dirtyAreas.length === 0) return;
    setSavingAll(true);
    let saved = 0;
    let failed = 0;
    for (const a of dirtyAreas) {
      try {
        await solicitacoes.areaResponsaveis.save(a.id, editMap[a.id] || []);
        saved++;
      } catch (e) {
        failed++;
        toast.error(`${a.label}: ${e.message}`);
      }
    }
    if (failed === 0) {
      toast.success(`${saved} ${saved === 1 ? 'área atualizada' : 'áreas atualizadas'}`);
    } else if (saved > 0) {
      toast.warning(`${saved} salva(s), ${failed} com erro`);
    }
    await load();
    setSavingAll(false);
  }

  function descartar() {
    const map = {};
    AREAS.forEach(a => { map[a.id] = (originalByArea[a.id] || []).slice(); });
    setEditMap(map);
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, display: 'flex', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" size={24} color={C.text3} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Users size={26} color={C.primary} />
          <div style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>
            Responsáveis por Solicitação
          </div>
        </div>
        <div style={{ fontSize: 13, color: C.text2 }}>
          Configure quem é responsável por cada área. Quem estiver listado aqui recebe notificação direta e vê
          todas as solicitações da área no kanban (independente das outras permissões).
        </div>
      </div>

      {dirtyAreas.length > 0 && (
        <div style={{
          position: 'sticky',
          top: 12,
          zIndex: 30,
          marginBottom: 16,
          padding: '10px 14px',
          background: C.card,
          border: `1px solid ${C.primary}`,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
        }}>
          <div style={{ fontSize: 13, color: C.text }}>
            <span style={{ fontWeight: 700, color: C.primary }}>{dirtyAreas.length}</span>
            {' '}{dirtyAreas.length === 1 ? 'área modificada' : 'áreas modificadas'}
            <span style={{ color: C.text3 }}>
              {' · '}{dirtyAreas.map(a => a.label).join(', ')}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              size="sm"
              variant="outline"
              onClick={descartar}
              disabled={savingAll}
            >
              Descartar
            </Button>
            <Button
              size="sm"
              onClick={salvarTudo}
              disabled={savingAll}
              style={{ background: C.primary, color: 'white', borderColor: C.primary }}
            >
              {savingAll ? (
                <><Loader2 className="animate-spin" size={14} style={{ marginRight: 6 }} /> Salvando…</>
              ) : (
                <><Save size={14} style={{ marginRight: 6 }} /> Salvar todas</>
              )}
            </Button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
        {AREAS.map(area => {
          const selecionados = editMap[area.id] || [];
          const dirty = isDirty(area.id);
          // profiles que ainda nao foram adicionados
          const disponiveis = profiles.filter(p => !selecionados.includes(p.id));

          return (
            <div
              key={area.id}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderLeft: `4px solid ${area.color}`,
                borderRadius: 10,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{area.label}</div>
                  {dirty && (
                    <span
                      title="Mudança não salva"
                      style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: C.primary, flexShrink: 0,
                      }}
                    />
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.text3 }}>
                  {selecionados.length} responsáve{selecionados.length === 1 ? 'l' : 'is'}
                </div>
              </div>

              {/* Lista de selecionados */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selecionados.length === 0 && (
                  <div style={{ fontSize: 12, color: C.text3, fontStyle: 'italic', padding: '4px 0' }}>
                    Sem responsáveis · fallback notifica admin/diretor
                  </div>
                )}
                {selecionados.map(pid => {
                  const p = profileById[pid];
                  return (
                    <div
                      key={pid}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 10px',
                        background: C.inputBg,
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600, color: C.text }}>{p?.name || '(perfil removido)'}</span>
                        {p?.email && <span style={{ color: C.text3, marginLeft: 6 }}>· {p.email}</span>}
                      </div>
                      <button
                        onClick={() => removeResponsavel(area.id, pid)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 4 }}
                        title="Remover"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Picker com busca · so colaboradores (exclui membros/voluntarios) */}
              <div style={{ display: 'flex', gap: 6 }}>
                <PessoaPicker
                  disponiveis={disponiveis}
                  onPick={(id) => addResponsavel(area.id, id)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
