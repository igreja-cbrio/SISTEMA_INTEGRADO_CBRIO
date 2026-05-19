import { useState, useEffect, useMemo } from 'react';
import { permissoes as api } from '../../api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { Checkbox } from '../../components/ui/checkbox';
import { Shield, RefreshCw, Search } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';

// Legenda de niveis 0-5 (espelha CLAUDE.md > Permissoes · matriz cargo x modulo)
const NIVEIS = [
  { v: 0, label: '0 · Sem acesso',                color: 'bg-muted text-muted-foreground' },
  { v: 1, label: '1 · Ver (leitura)',             color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  { v: 2, label: '2 · Ver + lancar dado',         color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400' },
  { v: 3, label: '3 · Ver + editar (CRUD)',       color: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  { v: 4, label: '4 · CRUD + deletar',            color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  { v: 5, label: '5 · Admin (configura regras)',  color: 'bg-purple-500/15 text-purple-700 dark:text-purple-400' },
];

const CATEGORIA_LABELS = {
  estrategica:    'Estratégica',
  ministerial:    'Ministerial',
  operacional:    'Operacional',
  dados_ia_admin: 'Dados · IA · Admin',
};

function nivelMeta(n) {
  return NIVEIS.find(x => x.v === n) || NIVEIS[0];
}

export default function Permissoes() {
  const [loading, setLoading] = useState(true);
  const [cargos, setCargos] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [celulas, setCelulas] = useState([]);
  const [cargoSelecionado, setCargoSelecionado] = useState(null);
  const [filtroModulo, setFiltroModulo] = useState('');
  const [savingCell, setSavingCell] = useState(null); // `${cargo_id}:${modulo_id}`

  async function load() {
    setLoading(true);
    try {
      const data = await api.matriz();
      setCargos(data.cargos || []);
      setModulos(data.modulos || []);
      setCelulas(data.celulas || []);
      if (!cargoSelecionado && data.cargos?.length) {
        setCargoSelecionado(data.cargos[0].id);
      }
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar matriz');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // celulas indexadas por (cargo, modulo)
  const celulasMap = useMemo(() => {
    const m = new Map();
    for (const c of celulas) m.set(`${c.cargo_id}:${c.modulo_id}`, c);
    return m;
  }, [celulas]);

  const cargoAtual = useMemo(
    () => cargos.find(c => c.id === cargoSelecionado),
    [cargos, cargoSelecionado]
  );

  const modulosFiltrados = useMemo(() => {
    const term = filtroModulo.trim().toLowerCase();
    if (!term) return modulos;
    return modulos.filter(m =>
      (m.nome || '').toLowerCase().includes(term) ||
      (m.slug || '').toLowerCase().includes(term)
    );
  }, [modulos, filtroModulo]);

  const modulosPorCategoria = useMemo(() => {
    const buckets = {};
    for (const m of modulosFiltrados) {
      const cat = m.categoria || 'outros';
      if (!buckets[cat]) buckets[cat] = [];
      buckets[cat].push(m);
    }
    return buckets;
  }, [modulosFiltrados]);

  async function atualizarCelula(modulo_id, patch) {
    if (!cargoSelecionado) return;
    const key = `${cargoSelecionado}:${modulo_id}`;
    const atual = celulasMap.get(key) || {
      cargo_id: cargoSelecionado, modulo_id,
      nivel: 0, pode_exportar: false, pode_aprovar: false, escopo_proprio: false,
    };
    const novo = { ...atual, ...patch };
    setSavingCell(key);
    try {
      await api.setCelula({
        cargo_id: novo.cargo_id,
        modulo_id: novo.modulo_id,
        nivel: novo.nivel,
        pode_exportar: !!novo.pode_exportar,
        pode_aprovar: !!novo.pode_aprovar,
        escopo_proprio: !!novo.escopo_proprio,
      });
      // Atualiza estado local sem refetch
      setCelulas(prev => {
        const idx = prev.findIndex(c => c.cargo_id === novo.cargo_id && c.modulo_id === novo.modulo_id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], ...novo };
          return copy;
        }
        return [...prev, novo];
      });
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSavingCell(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Matriz de Permissões
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define o nível padrão de acesso por cargo. Overrides individuais ficam em <span className="font-mono text-xs">/admin/usuarios</span>.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Cargo</label>
          <Select value={cargoSelecionado || ''} onValueChange={setCargoSelecionado}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha um cargo..." />
            </SelectTrigger>
            <SelectContent>
              {cargos.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome_completo || c.nome || c.slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {cargoAtual?.descricao && (
            <p className="text-xs text-muted-foreground mt-1.5">{cargoAtual.descricao}</p>
          )}
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Filtrar módulo</label>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filtroModulo}
              onChange={e => setFiltroModulo(e.target.value)}
              placeholder="Nome ou slug do módulo..."
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Legenda */}
      <Card className="p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Legenda de níveis</p>
        <div className="flex flex-wrap gap-2">
          {NIVEIS.map(n => (
            <Badge key={n.v} className={`text-xs ${n.color}`}>{n.label}</Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          <span className="font-semibold">Modificadores:</span> <b>E</b> = pode exportar (CPF, R$ · LGPD) ·{' '}
          <b>A</b> = pode aprovar workflows (ex: despesa) ·{' '}
          <b>*</b> = escopo próprio (só própria área/valor/setor)
        </p>
      </Card>

      {/* Matriz por modulo */}
      {!cargoSelecionado ? (
        <Card className="p-8 text-center text-muted-foreground">
          Escolha um cargo acima para editar a matriz.
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(modulosPorCategoria).map(([cat, mods]) => (
              <div key={cat}>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {CATEGORIA_LABELS[cat] || cat}
                </h2>
                <Card className="divide-y divide-border">
                  {mods.map(m => {
                    const key = `${cargoSelecionado}:${m.id}`;
                    const c = celulasMap.get(key);
                    const nivel = c?.nivel ?? 0;
                    const meta = nivelMeta(nivel);
                    const saving = savingCell === key;
                    return (
                      <div key={m.id} className="p-3 flex flex-col md:flex-row md:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground truncate">{m.nome}</p>
                            {m.rota && (
                              <span className="text-xs text-muted-foreground font-mono shrink-0">{m.rota}</span>
                            )}
                          </div>
                          {m.descricao && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{m.descricao}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge className={`text-xs ${meta.color} ${saving ? 'opacity-50' : ''}`}>
                            Nível {nivel}
                          </Badge>
                          <Select
                            value={String(nivel)}
                            onValueChange={v => atualizarCelula(m.id, { nivel: parseInt(v, 10) })}
                            disabled={saving}
                          >
                            <SelectTrigger className="w-[120px] h-9 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {NIVEIS.map(n => (
                                <SelectItem key={n.v} value={String(n.v)}>{n.v}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer" title="Pode exportar dados (CPF, telefone, R$)">
                              <Checkbox
                                checked={!!c?.pode_exportar}
                                onCheckedChange={v => atualizarCelula(m.id, { pode_exportar: !!v })}
                                disabled={saving || nivel === 0}
                              />
                              <span className="text-muted-foreground">E</span>
                            </label>
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer" title="Pode aprovar workflows">
                              <Checkbox
                                checked={!!c?.pode_aprovar}
                                onCheckedChange={v => atualizarCelula(m.id, { pode_aprovar: !!v })}
                                disabled={saving || nivel === 0}
                              />
                              <span className="text-muted-foreground">A</span>
                            </label>
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer" title="Escopo próprio (só própria área)">
                              <Checkbox
                                checked={!!c?.escopo_proprio}
                                onCheckedChange={v => atualizarCelula(m.id, { escopo_proprio: !!v })}
                                disabled={saving || nivel === 0}
                              />
                              <span className="text-muted-foreground">*</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </div>
            ))}
          {modulosFiltrados.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Nenhum módulo bate com o filtro.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
