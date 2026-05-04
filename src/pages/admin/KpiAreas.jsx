import { useState, useEffect } from 'react';
import { users } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import { Search, Save, Users as UsersIcon } from 'lucide-react';

const C = {
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', card: 'var(--cbrio-card)', bg: 'var(--cbrio-bg)',
  primary: '#00B39D', primaryBg: '#00B39D18',
};

// Areas de KPI usadas no banco (lowercase). Espelha as 11 areas em
// kpi_indicadores_taticos.area
const KPI_AREAS = [
  { id: 'ami', label: 'AMI', cat: 'Geracional' },
  { id: 'kids', label: 'CBKids', cat: 'Geracional' },
  { id: 'cba', label: 'CBA', cat: 'Ministerial' },
  { id: 'cuidados', label: 'Cuidados', cat: 'Ministerial' },
  { id: 'grupos', label: 'Grupos', cat: 'Ministerial' },
  { id: 'integracao', label: 'Integração', cat: 'Ministerial' },
  { id: 'voluntariado', label: 'Voluntariado', cat: 'Ministerial' },
  { id: 'next', label: 'NEXT', cat: 'Ministerial' },
  { id: 'generosidade', label: 'Generosidade', cat: 'Ministerial' },
  { id: 'jornada', label: 'Jornada', cat: 'Institucional' },
  { id: 'igreja', label: 'Igreja', cat: 'Institucional' },
];

export default function KpiAreas() {
  const { profile } = useAuth();
  const isAdmin = ['admin', 'diretor'].includes(profile?.role);

  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pendentes, setPendentes] = useState({}); // { userId: areas[] } — alteracoes nao salvas
  const [saving, setSaving] = useState({});

  async function load() {
    setLoading(true);
    try {
      const { supabase } = await import('../../supabaseClient');
      const { data } = await supabase
        .from('profiles')
        .select('id, name, email, role, kpi_areas, active')
        .eq('active', true)
        .order('name');
      setUsuarios(data || []);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar usuários');
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function toggleArea(userId, areaId) {
    const current = pendentes[userId] ?? usuarios.find(u => u.id === userId)?.kpi_areas ?? [];
    const set = new Set(current);
    if (set.has(areaId)) set.delete(areaId);
    else set.add(areaId);
    setPendentes(p => ({ ...p, [userId]: Array.from(set) }));
  }

  async function salvar(userId) {
    const areas = pendentes[userId];
    if (!areas) return;
    setSaving(s => ({ ...s, [userId]: true }));
    try {
      await users.setKpiAreas(userId, areas);
      toast.success('Áreas atualizadas');
      setPendentes(p => { const { [userId]: _, ...rest } = p; return rest; });
      setUsuarios(us => us.map(u => u.id === userId ? { ...u, kpi_areas: areas } : u));
    } catch (e) {
      toast.error(e?.message || 'Erro ao salvar');
    }
    setSaving(s => ({ ...s, [userId]: false }));
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '40px 32px', textAlign: 'center', color: C.t3 }}>
        Apenas admin ou diretor podem gerenciar áreas de KPI.
      </div>
    );
  }

  const filtered = usuarios.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return u.name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s);
  });

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <UsersIcon size={22} style={{ color: C.primary }} /> Áreas de KPI por usuário
        </h1>
        <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
          Define qual líder pode editar e preencher KPIs de cada área. Usuários sem área atribuída só conseguem visualizar.
          Admin e diretor têm acesso a todas as áreas.
        </p>
      </div>

      <div style={{ marginBottom: 16, position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.t3 }} />
        <Input placeholder="Buscar por nome ou email..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Nenhum usuário encontrado</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(u => {
            const areasAtivas = pendentes[u.id] ?? u.kpi_areas ?? [];
            const dirty = pendentes[u.id] !== undefined;
            const isAdminUser = ['admin', 'diretor'].includes(u.role);

            return (
              <div key={u.id} style={{ background: C.card, borderRadius: 12, border: `1px solid ${dirty ? C.primary : C.border}`, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: C.primary, flexShrink: 0 }}>
                    {u.name?.charAt(0) || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{u.name || u.email}</div>
                    <div style={{ fontSize: 11, color: C.t3 }}>
                      {u.email}
                      {u.role && <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 99, background: isAdminUser ? '#8b5cf620' : C.bg, color: isAdminUser ? '#8b5cf6' : C.t2, fontWeight: 600, fontSize: 10 }}>{u.role}</span>}
                    </div>
                  </div>
                  {dirty && (
                    <Button size="sm" disabled={saving[u.id]} onClick={() => salvar(u.id)}>
                      <Save size={14} style={{ marginRight: 4 }} />
                      {saving[u.id] ? 'Salvando...' : 'Salvar'}
                    </Button>
                  )}
                </div>

                {isAdminUser && (
                  <div style={{ fontSize: 11, color: C.t3, padding: '6px 10px', background: '#8b5cf612', borderRadius: 8, marginBottom: 8 }}>
                    {u.role === 'admin' ? 'Admin' : 'Diretor'} já tem acesso a todas as áreas — esta lista é só informativa.
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {KPI_AREAS.map(area => {
                    const ativo = areasAtivas.includes(area.id);
                    return (
                      <button
                        key={area.id}
                        onClick={() => toggleArea(u.id, area.id)}
                        style={{
                          padding: '5px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
                          border: ativo ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
                          background: ativo ? C.primaryBg : 'transparent',
                          color: ativo ? C.primary : C.t3,
                          fontWeight: ativo ? 600 : 400,
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {area.label}
                        <span style={{ fontSize: 9, opacity: 0.7 }}>{area.cat[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
