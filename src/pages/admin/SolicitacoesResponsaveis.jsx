import { useState, useEffect } from 'react';
import { solicitacoes } from '../../api';
import { Button } from '../../components/ui/button';
import { Plus, X, Save, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

const C = {
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', card: 'var(--cbrio-card)', primary: '#00B39D',
  inputBg: 'var(--cbrio-input-bg)',
};

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
  const [savingArea, setSavingArea] = useState(null);
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
      const { supabase } = await import('../../supabaseClient');
      const { data } = await supabase
        .from('profiles')
        .select('id, name, email, role')
        .order('name');
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

  async function salvar(area) {
    setSavingArea(area);
    try {
      await solicitacoes.areaResponsaveis.save(area, editMap[area] || []);
      toast.success('Responsáveis atualizados');
      await load();
    } catch (e) { toast.error(e.message); }
    setSavingArea(null);
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
                <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{area.label}</div>
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

              {/* Dropdown pra adicionar */}
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  value=""
                  onChange={e => addResponsavel(area.id, e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    background: C.inputBg,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    color: C.text,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  <option value="">+ Adicionar pessoa…</option>
                  {disponiveis.map(p => (
                    <option key={p.id} value={p.id}>{p.name || p.email}</option>
                  ))}
                </select>
              </div>

              {/* Botao salvar (so quando ha mudanca) */}
              {dirty && (
                <Button
                  size="sm"
                  onClick={() => salvar(area.id)}
                  disabled={savingArea === area.id}
                  style={{ background: area.color, color: 'white', borderColor: area.color }}
                >
                  {savingArea === area.id ? (
                    <><Loader2 className="animate-spin" size={14} style={{ marginRight: 6 }} /> Salvando…</>
                  ) : (
                    <><Save size={14} style={{ marginRight: 6 }} /> Salvar mudanças</>
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
