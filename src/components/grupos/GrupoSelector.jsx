// ============================================================================
// GrupoSelector — componente reutilizavel para escolher um grupo de conexao.
//
// Modos de busca (tabs):
//   - "lider": digita o nome do lider, ve grupos dele
//   - "filtros": categoria + bairro
//   - "cep": insere CEP, ve grupos num raio
//   - "lista": ve todos da temporada atual (com search)
//
// Props:
//   - onSelect(grupo): callback quando usuario escolhe um grupo
//   - selectedGrupoId: id atualmente selecionado (para destacar)
//   - mode: 'simple' (so tab lider+lista) | 'full' (todas as tabs + mapa)
//   - temporadaId: filtrar por essa temporada (default: a ativa)
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { grupos as authApi, gruposPublic } from '../../api';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Search, MapPin, Clock, Users, User as UserIcon, Map as MapIcon, Tag, Hash } from 'lucide-react';
import { GruposMapView } from './GruposMapView';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18',
};

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const TABS_FULL = [
  { id: 'lider', label: 'Por líder', Icon: UserIcon },
  { id: 'filtros', label: 'Categoria/bairro', Icon: Tag },
  { id: 'cep', label: 'Perto de mim (CEP)', Icon: Hash },
  { id: 'lista', label: 'Lista', Icon: Search },
  { id: 'mapa', label: 'Mapa', Icon: MapIcon },
];

const TABS_SIMPLE = [
  { id: 'lider', label: 'Por líder', Icon: UserIcon },
  { id: 'lista', label: 'Lista', Icon: Search },
];

export default function GrupoSelector({ onSelect, selectedGrupoId, mode = 'full', temporadaId, usePublicApi = false }) {
  const api = usePublicApi ? gruposPublic : authApi;
  const tabs = mode === 'simple' ? TABS_SIMPLE : TABS_FULL;
  const [tab, setTab] = useState(tabs[0].id);
  const [temporada, setTemporada] = useState(temporadaId || '');
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [searchTexto, setSearchTexto] = useState('');
  const [searchLider, setSearchLider] = useState('');
  const [lideresList, setLideresList] = useState([]);
  const [liderSelecionado, setLiderSelecionado] = useState(null);
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroBairro, setFiltroBairro] = useState('');
  const [cep, setCep] = useState('');
  const [raio, setRaio] = useState(20);

  // Carrega temporada ativa se nao foi passada
  useEffect(() => {
    if (temporadaId) { setTemporada(temporadaId); return; }
    api.temporadas().then(ts => {
      const ativa = (ts || []).find(t => t.ativa);
      if (ativa) setTemporada(ativa.id);
    }).catch(() => {});
  }, [temporadaId]);

  // Carrega lista quando muda tab/temporada
  useEffect(() => {
    if (!temporada) return;
    if (tab !== 'lista' && tab !== 'mapa' && tab !== 'filtros') return;
    setLoading(true);
    const params = { temporada, status_temporada: 'ativo' };
    if (tab === 'filtros') {
      if (filtroCategoria) params.categoria = filtroCategoria;
      if (filtroBairro) params.bairro = filtroBairro;
    }
    api.buscar(params)
      .then(setGrupos)
      .catch(() => setGrupos([]))
      .finally(() => setLoading(false));
  }, [tab, temporada, filtroCategoria, filtroBairro]);

  // Autocomplete de lider
  useEffect(() => {
    if (tab !== 'lider' || !temporada) return;
    if (searchLider.trim().length < 2) { setLideresList([]); return; }
    const t = setTimeout(() => {
      api.buscarLideres({ q: searchLider, temporada }).then(setLideresList).catch(() => setLideresList([]));
    }, 300);
    return () => clearTimeout(t);
  }, [tab, searchLider, temporada]);

  // Quando seleciona um lider, busca grupos dele
  useEffect(() => {
    if (!liderSelecionado) return;
    setLoading(true);
    api.gruposDoLider(liderSelecionado.id, temporada ? { temporada } : null)
      .then(setGrupos)
      .catch(() => setGrupos([]))
      .finally(() => setLoading(false));
  }, [liderSelecionado, temporada]);

  // Busca por CEP
  const handleBuscaCep = async () => {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;
    setLoading(true);
    try {
      const data = await api.buscar({ temporada, status_temporada: 'ativo', cep: cepLimpo, raio_km: raio });
      setGrupos(data || []);
    } catch { setGrupos([]); }
    finally { setLoading(false); }
  };

  // Filtros derivados
  const categoriasUnicas = useMemo(() => [...new Set(grupos.map(g => g.categoria).filter(Boolean))].sort(), [grupos]);
  const bairrosUnicos = useMemo(() => [...new Set(grupos.map(g => g.bairro).filter(Boolean))].sort(), [grupos]);

  // Lista filtrada por search local
  const filteredList = useMemo(() => {
    if (!searchTexto) return grupos;
    const s = searchTexto.toLowerCase();
    return grupos.filter(g =>
      g.nome?.toLowerCase().includes(s)
      || g.lider_nome?.toLowerCase().includes(s)
      || g.bairro?.toLowerCase().includes(s)
      || g.codigo?.toLowerCase().includes(s)
      || g.local?.toLowerCase().includes(s)
    );
  }, [grupos, searchTexto]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        {tabs.map(t => {
          const Icon = t.Icon;
          const ativo = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: ativo ? 700 : 500,
              color: ativo ? C.primary : C.t3,
              borderBottom: ativo ? `2px solid ${C.primary}` : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo da tab */}
      {tab === 'lider' && (
        <div>
          <Input
            placeholder="Digite o nome do líder..."
            value={searchLider}
            onChange={e => { setSearchLider(e.target.value); if (liderSelecionado) setLiderSelecionado(null); }}
            autoFocus
          />
          {!liderSelecionado && lideresList.length > 0 && (
            <div style={{ marginTop: 6, border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 200, overflowY: 'auto', background: C.card }}>
              {lideresList.map(l => (
                <button key={l.id} onClick={() => setLiderSelecionado(l)} style={{
                  width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${C.border}`,
                  color: C.text, fontSize: 13,
                }} onMouseEnter={e => e.currentTarget.style.background = C.primaryBg}
                   onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: l.foto_url ? `url(${l.foto_url}) center/cover` : C.primaryBg, color: C.primary, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {!l.foto_url && (l.nome?.charAt(0) || '?')}
                  </div>
                  {l.nome}
                </button>
              ))}
            </div>
          )}
          {liderSelecionado && (
            <div style={{ marginTop: 6, fontSize: 12, color: C.t2 }}>
              Líder: <strong style={{ color: C.text }}>{liderSelecionado.nome}</strong>
              <button onClick={() => { setLiderSelecionado(null); setSearchLider(''); setGrupos([]); }} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>trocar</button>
            </div>
          )}
        </div>
      )}

      {tab === 'filtros' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, background: 'var(--cbrio-input-bg)', color: C.text, flex: 1, minWidth: 160 }}>
            <option value="">Todas as categorias</option>
            {categoriasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtroBairro} onChange={e => setFiltroBairro(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, background: 'var(--cbrio-input-bg)', color: C.text, flex: 1, minWidth: 160 }}>
            <option value="">Todos os bairros</option>
            {bairrosUnicos.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      )}

      {tab === 'cep' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input placeholder="CEP (8 dígitos)" value={cep} onChange={e => setCep(e.target.value.replace(/\D/g, '').slice(0, 8))} maxLength={8} style={{ flex: 1 }} />
          <select value={raio} onChange={e => setRaio(Number(e.target.value))} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, background: 'var(--cbrio-input-bg)', color: C.text }}>
            <option value={5}>5km</option>
            <option value={10}>10km</option>
            <option value={20}>20km</option>
            <option value={30}>30km</option>
            <option value={50}>50km</option>
          </select>
          <Button onClick={handleBuscaCep} disabled={cep.length !== 8 || loading}>Buscar</Button>
        </div>
      )}

      {(tab === 'lista' || tab === 'filtros' || tab === 'lider' || tab === 'cep') && (
        <>
          {tab === 'lista' && (
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.t3 }} />
              <Input placeholder="Buscar por nome, código, bairro..." value={searchTexto} onChange={e => setSearchTexto(e.target.value)} style={{ paddingLeft: 32 }} />
            </div>
          )}
          <ResultsList
            grupos={tab === 'lista' ? filteredList : grupos}
            loading={loading}
            selectedGrupoId={selectedGrupoId}
            onSelect={onSelect}
          />
        </>
      )}

      {tab === 'mapa' && (
        <div style={{ height: 480, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          <GruposMapView
            grupos={grupos}
            variant="admin"
            defaultTheme="light"
            onGroupSelect={onSelect}
            onGroupSelectLabel="Escolher este grupo"
          />
        </div>
      )}
    </div>
  );
}

function ResultsList({ grupos, loading, selectedGrupoId, onSelect }) {
  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Carregando...</div>;
  if (!grupos.length) return <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum grupo encontrado nesses filtros.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
      {grupos.map(g => {
        const ativo = g.id === selectedGrupoId;
        return (
          <button
            key={g.id}
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
              {g.dia_semana != null && <span><Clock size={10} style={{ display: 'inline', marginRight: 2 }} /> {DIAS[g.dia_semana]} {g.horario?.slice(0, 5)}</span>}
              {g.dist_km != null && <span style={{ color: C.primary, fontWeight: 600 }}>{g.dist_km < 1 ? `${Math.round(g.dist_km * 1000)}m` : `${g.dist_km.toFixed(1)}km`}</span>}
              {g.categoria && <span>· {g.categoria}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
