// ============================================================================
// GrupoSelector — componente reutilizável para escolher um grupo de conexão.
//
// Layout (mode='full'): busca (por grupo | por líder) no topo → filtros
// (categoria, bairro, dia — data-driven, só aparecem quando há dado) →
// alternador de visualização (Lista | Mapa) → resultados. Sem "abas": tudo
// numa tela só, filtrando ao vivo sobre os grupos carregados.
//
// mode='simple' (ex.: cadastro de membresia): só a busca (grupo|líder) + lista.
//
// Props:
//   - onSelect(grupo): callback quando usuário escolhe um grupo
//   - selectedGrupoId: id atualmente selecionado (para destacar)
//   - mode: 'simple' (busca + lista) | 'full' (busca + filtros + lista/mapa)
//   - temporadaId: filtrar por essa temporada (default: a ativa)
//   - usePublicApi: usa a API pública (form sem login)
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { grupos as authApi, gruposPublic } from '../../api';
import { Input } from '../ui/input';
import { Search, MapPin, Clock, User as UserIcon, Users, List as ListIcon, Map as MapIcon } from 'lucide-react';
import { GruposMapView } from './GruposMapView';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18',
};

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const selStyle = {
  padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
  fontSize: 12, background: 'var(--cbrio-input-bg)', color: C.text, flex: 1, minWidth: 150,
};

function Pill({ ativo, onClick, children }) {
  return (
    <button onClick={onClick} type="button" style={{
      padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
      fontWeight: ativo ? 700 : 500,
      border: `1px solid ${ativo ? C.primary : C.border}`,
      background: ativo ? C.primaryBg : 'transparent',
      color: ativo ? C.primary : C.t2,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>{children}</button>
  );
}

export default function GrupoSelector({ onSelect, selectedGrupoId, mode = 'full', temporadaId, usePublicApi = false }) {
  const api = usePublicApi ? gruposPublic : authApi;
  const full = mode !== 'simple';

  const [temporada, setTemporada] = useState(temporadaId || '');
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(false);

  const [searchMode, setSearchMode] = useState('grupo'); // 'grupo' | 'lider'
  const [busca, setBusca] = useState('');
  const [fCategoria, setFCategoria] = useState('');
  const [fFaixa, setFFaixa] = useState('');
  const [fBairro, setFBairro] = useState('');
  const [fDia, setFDia] = useState('');
  const [view, setView] = useState('lista'); // 'lista' | 'mapa'

  // Resolve a temporada ativa (se não veio por prop)
  useEffect(() => {
    if (temporadaId) { setTemporada(temporadaId); return; }
    api.temporadas().then(ts => {
      const ativa = (ts || []).find(t => t.ativa);
      if (ativa) setTemporada(ativa.id);
    }).catch(() => {});
  }, [temporadaId]);

  // Carrega TODOS os grupos ativos da temporada uma vez · filtragem é client-side
  useEffect(() => {
    if (!temporada) return;
    setLoading(true);
    api.buscar({ temporada, status_temporada: 'ativo' })
      .then(d => setGrupos(d || []))
      .catch(() => setGrupos([]))
      .finally(() => setLoading(false));
  }, [temporada]);

  // Opções de filtro derivadas do dado real (só aparecem quando existem →
  // nunca oferece um valor que não casa nada · sem filtro-fantasma)
  const categorias = useMemo(() => [...new Set(grupos.map(g => g.categoria).filter(Boolean))].sort(), [grupos]);
  const bairros = useMemo(() => [...new Set(grupos.map(g => g.bairro).filter(Boolean))].sort(), [grupos]);
  const dias = useMemo(() => [...new Set(grupos.map(g => g.dia_semana).filter(v => v != null))].sort((a, b) => a - b), [grupos]);
  // Faixa etária: só aparece quando os grupos tiverem o campo `faixa_etaria`
  // preenchido (vem no rebuild da 2ª temporada). Hoje = vazio → filtro oculto.
  const faixas = useMemo(() => [...new Set(grupos.map(g => g.faixa_etaria).filter(Boolean))].sort(), [grupos]);

  const filtrados = useMemo(() => {
    const s = busca.trim().toLowerCase();
    return grupos.filter(g => {
      if (fCategoria && g.categoria !== fCategoria) return false;
      if (fFaixa && g.faixa_etaria !== fFaixa) return false;
      if (fBairro && g.bairro !== fBairro) return false;
      if (fDia !== '' && String(g.dia_semana) !== fDia) return false;
      if (s) {
        if (searchMode === 'lider') {
          if (!g.lider_nome?.toLowerCase().includes(s)) return false;
        } else {
          const alvo = [g.nome, g.codigo, g.local, g.bairro, g.tema].filter(Boolean).join(' ').toLowerCase();
          if (!alvo.includes(s)) return false;
        }
      }
      return true;
    });
  }, [grupos, busca, searchMode, fCategoria, fFaixa, fBairro, fDia]);

  const temFiltros = full && (categorias.length >= 1 || faixas.length >= 1 || bairros.length >= 1 || dias.length >= 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Busca: por grupo | por líder */}
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Pill ativo={searchMode === 'grupo'} onClick={() => { setSearchMode('grupo'); setBusca(''); }}>
            <Users size={13} /> Buscar por grupo
          </Pill>
          <Pill ativo={searchMode === 'lider'} onClick={() => { setSearchMode('lider'); setBusca(''); }}>
            <UserIcon size={13} /> Buscar por líder
          </Pill>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.t3 }} />
          <Input
            placeholder={searchMode === 'lider' ? 'Nome do líder...' : 'Nome do grupo, bairro ou código...'}
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>
      </div>

      {/* Filtros (data-driven · só os que têm valores aparecem) */}
      {temFiltros && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {categorias.length >= 1 && (
            <select value={fCategoria} onChange={e => setFCategoria(e.target.value)} style={selStyle}>
              <option value="">Todas as categorias</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {faixas.length >= 1 && (
            <select value={fFaixa} onChange={e => setFFaixa(e.target.value)} style={selStyle}>
              <option value="">Todas as idades</option>
              {faixas.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
          {dias.length >= 1 && (
            <select value={fDia} onChange={e => setFDia(e.target.value)} style={selStyle}>
              <option value="">Todos os dias</option>
              {dias.map(d => <option key={d} value={String(d)}>{DIAS[d]}</option>)}
            </select>
          )}
          {bairros.length >= 1 && (
            <select value={fBairro} onChange={e => setFBairro(e.target.value)} style={selStyle}>
              <option value="">Todos os bairros</option>
              {bairros.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Alternador de visualização + contagem */}
      {full && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pill ativo={view === 'lista'} onClick={() => setView('lista')}><ListIcon size={13} /> Lista</Pill>
          <Pill ativo={view === 'mapa'} onClick={() => setView('mapa')}><MapIcon size={13} /> Mapa</Pill>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: C.t3 }}>
            {loading ? '...' : `${filtrados.length} grupo${filtrados.length === 1 ? '' : 's'}`}
          </span>
        </div>
      )}

      {/* Resultados */}
      {full && view === 'mapa' ? (
        <div style={{ height: 480, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          <GruposMapView
            grupos={filtrados}
            variant="admin"
            defaultTheme="light"
            onGroupSelect={onSelect}
            onGroupSelectLabel="Escolher este grupo"
          />
        </div>
      ) : (
        <ResultsList grupos={filtrados} loading={loading} selectedGrupoId={selectedGrupoId} onSelect={onSelect} />
      )}
    </div>
  );
}

function ResultsList({ grupos, loading, selectedGrupoId, onSelect }) {
  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Carregando...</div>;
  if (!grupos.length) return <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum grupo encontrado com esses filtros.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
      {grupos.map(g => {
        const ativo = g.id === selectedGrupoId;
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onSelect?.(g)}
            style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: 10,
              border: ativo ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
              background: ativo ? C.primaryBg : C.card, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 4, color: C.text,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{g.nome}</div>
              {g.codigo && <code style={{ fontSize: 10, color: C.t3, fontFamily: 'monospace' }}>{g.codigo}</code>}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: C.t3 }}>
              {g.lider_nome && <span><UserIcon size={10} style={{ display: 'inline', marginRight: 2 }} /> {g.lider_nome}</span>}
              {g.bairro && <span><MapPin size={10} style={{ display: 'inline', marginRight: 2 }} /> {g.bairro}</span>}
              {g.dia_semana != null && <span><Clock size={10} style={{ display: 'inline', marginRight: 2 }} /> {DIAS_CURTO[g.dia_semana]}{g.horario ? ` ${g.horario.slice(0, 5)}` : ''}</span>}
              {g.dist_km != null && <span style={{ color: C.primary, fontWeight: 600 }}>{g.dist_km < 1 ? `${Math.round(g.dist_km * 1000)}m` : `${g.dist_km.toFixed(1)}km`}</span>}
              {g.categoria && <span>· {g.categoria}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
