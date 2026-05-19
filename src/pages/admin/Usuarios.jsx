import { useState, useEffect, useMemo } from 'react';
import { permissoes as api } from '../../api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { Checkbox } from '../../components/ui/checkbox';
import { Users, Search, X, Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const NIVEIS = [0, 1, 2, 3, 4, 5];

function iniciais(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase();
}

function formatDataExpiracao(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch { return iso; }
}

export default function Usuarios() {
  const [loading, setLoading] = useState(true);
  const [colaboradores, setColaboradores] = useState([]);
  const [estrutura, setEstrutura] = useState({ setores: [], areas: [], modulos: [], cargos: [] });
  const [busca, setBusca] = useState('');
  const [filtroCargo, setFiltroCargo] = useState('todos');
  const [editando, setEditando] = useState(null); // colaborador
  const [usuarioCarregado, setUsuarioCarregado] = useState(null); // dados do GET /usuario/:id

  async function loadColaboradores() {
    setLoading(true);
    try {
      const [colabs, estr] = await Promise.all([
        api.colaboradores(),
        api.estrutura(),
      ]);
      setColaboradores(colabs || []);
      setEstrutura(estr || { setores: [], areas: [], modulos: [], cargos: [] });
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar colaboradores');
    } finally {
      setLoading(false);
    }
  }

  async function abrirEdicao(colab) {
    setEditando(colab);
    setUsuarioCarregado(null);
    try {
      const data = await api.usuario(colab.id);
      setUsuarioCarregado(data);
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar usuario');
    }
  }

  function fecharEdicao() {
    setEditando(null);
    setUsuarioCarregado(null);
  }

  useEffect(() => { loadColaboradores(); }, []);

  const cargosMap = useMemo(() => {
    const m = new Map();
    for (const c of estrutura.cargos || []) m.set(c.id, c);
    return m;
  }, [estrutura.cargos]);

  // Indexa colaboradores por cargo via usuarioCarregado quando edita.
  // Pra listagem, mostramos cargo do GET /usuario/:id sob demanda.
  // Pra performance: vamos enriquecer ao carregar.
  const filtrados = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return (colaboradores || []).filter(c => {
      if (term) {
        const matchNome = (c.name || '').toLowerCase().includes(term);
        const matchEmail = (c.email || '').toLowerCase().includes(term);
        if (!matchNome && !matchEmail) return false;
      }
      if (filtroCargo !== 'todos') {
        if (c.cargo_slug !== filtroCargo) return false;
      }
      return true;
    });
  }, [colaboradores, busca, filtroCargo]);

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
            <Users className="h-6 w-6 text-primary" />
            Usuários e Acessos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cargo, áreas e overrides individuais. Matriz padrão por cargo fica em{' '}
            <span className="font-mono text-xs">/admin/permissoes</span>.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Buscar pessoa</label>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Nome ou email..."
              className="pl-9"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Filtrar por cargo</label>
          <Select value={filtroCargo} onValueChange={setFiltroCargo}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos cargos</SelectItem>
              {(estrutura.cargos || []).map(c => (
                <SelectItem key={c.id} value={c.slug || c.id}>
                  {c.nome_completo || c.nome || c.slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lista de colaboradores */}
      <Card className="divide-y divide-border">
        {filtrados.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Nenhum colaborador encontrado.
          </div>
        ) : (
          filtrados.map(c => (
            <div key={c.id} className="p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors">
              <Avatar className="h-9 w-9 shrink-0">
                {c.avatar_url ? <AvatarImage src={c.avatar_url} /> : null}
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                  {iniciais(c.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{c.name || '(sem nome)'}</p>
                <p className="text-xs text-muted-foreground truncate">{c.email || '—'}</p>
              </div>
              <Badge variant="secondary" className="text-xs shrink-0 capitalize">{c.role || 'sem role'}</Badge>
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => abrirEdicao(c)}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            </div>
          ))
        )}
      </Card>
      <p className="text-xs text-muted-foreground text-right">
        {filtrados.length} {filtrados.length === 1 ? 'pessoa' : 'pessoas'}
      </p>

      {/* Dialog de edicao */}
      {editando && (
        <EditarUsuarioDialog
          colaborador={editando}
          dadosUsuario={usuarioCarregado}
          estrutura={estrutura}
          onClose={fecharEdicao}
          onSaved={async () => {
            // Recarrega dados do usuario pra refletir mudancas
            try {
              const data = await api.usuario(editando.id);
              setUsuarioCarregado(data);
            } catch { /* ignore */ }
          }}
        />
      )}
    </div>
  );
}

function EditarUsuarioDialog({ colaborador, dadosUsuario, estrutura, onClose, onSaved }) {
  const carregando = !dadosUsuario;
  const usuario = dadosUsuario?.usuario;
  const areasUsuario = dadosUsuario?.areas || [];
  const overrides = dadosUsuario?.overrides || [];

  const [cargoId, setCargoId] = useState(usuario?.cargo_id || '');
  const [areasSelecionadas, setAreasSelecionadas] = useState(new Set());
  const [salvando, setSalvando] = useState(false);
  const [mostrarNovoOverride, setMostrarNovoOverride] = useState(false);

  // Sincroniza estado quando dados carregam
  useEffect(() => {
    if (usuario?.cargo_id) setCargoId(usuario.cargo_id);
    if (areasUsuario.length) {
      setAreasSelecionadas(new Set(areasUsuario.map(a => a.area_id)));
    } else {
      setAreasSelecionadas(new Set());
    }
  }, [dadosUsuario]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvarCargo(novoCargoId) {
    setSalvando(true);
    try {
      await api.setCargo(colaborador.id, novoCargoId);
      setCargoId(novoCargoId);
      toast.success('Cargo atualizado');
      await onSaved();
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar cargo');
    } finally {
      setSalvando(false);
    }
  }

  function toggleArea(areaId) {
    const novo = new Set(areasSelecionadas);
    if (novo.has(areaId)) novo.delete(areaId);
    else novo.add(areaId);
    setAreasSelecionadas(novo);
  }

  async function salvarAreas() {
    setSalvando(true);
    try {
      await api.setAreas(colaborador.id, Array.from(areasSelecionadas));
      toast.success('Áreas atualizadas');
      await onSaved();
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar áreas');
    } finally {
      setSalvando(false);
    }
  }

  async function removerOverride(moduloId) {
    setSalvando(true);
    try {
      await api.removerOverride(colaborador.id, moduloId);
      toast.success('Override removido');
      await onSaved();
    } catch (e) {
      toast.error(e.message || 'Erro ao remover');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              {colaborador.avatar_url ? <AvatarImage src={colaborador.avatar_url} /> : null}
              <AvatarFallback className="bg-primary/15 text-primary text-sm font-bold">
                {iniciais(colaborador.name)}
              </AvatarFallback>
            </Avatar>
            <div className="text-left">
              <p className="text-base font-semibold">{colaborador.name}</p>
              <p className="text-xs text-muted-foreground font-normal">{colaborador.email}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {carregando ? (
          <div className="py-12 flex items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            {/* Cargo */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">Cargo</h3>
              <Select value={cargoId || ''} onValueChange={salvarCargo} disabled={salvando}>
                <SelectTrigger>
                  <SelectValue placeholder="Atribuir cargo..." />
                </SelectTrigger>
                <SelectContent>
                  {(estrutura.cargos || []).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome_completo || c.nome || c.slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                Mudar o cargo aplica a matriz padrão dele · overrides individuais continuam valendo.
              </p>
            </section>

            {/* Áreas */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-foreground">Áreas</h3>
                <Button size="sm" variant="outline" onClick={salvarAreas} disabled={salvando}>
                  Salvar áreas
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(estrutura.areas || []).map(a => {
                  const ativo = areasSelecionadas.has(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleArea(a.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                        ativo
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border hover:border-primary text-foreground'
                      }`}
                    >
                      {a.nome}
                      {a.setores?.nome && (
                        <span className={`ml-1.5 text-[10px] ${ativo ? 'opacity-80' : 'text-muted-foreground'}`}>
                          · {a.setores.nome}
                        </span>
                      )}
                    </button>
                  );
                })}
                {(!estrutura.areas || estrutura.areas.length === 0) && (
                  <p className="text-xs text-muted-foreground">Nenhuma área cadastrada.</p>
                )}
              </div>
            </section>

            {/* Overrides */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-foreground">Overrides individuais</h3>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMostrarNovoOverride(true)}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Exceções por pessoa · ganha (ou perde) acesso fora do cargo. Ideal com data de expiração.
              </p>

              {mostrarNovoOverride && (
                <NovoOverrideForm
                  modulos={estrutura.modulos || []}
                  onCancel={() => setMostrarNovoOverride(false)}
                  onCreated={async () => { setMostrarNovoOverride(false); await onSaved(); }}
                  usuarioId={colaborador.id}
                />
              )}

              <div className="space-y-2">
                {overrides.length === 0 && !mostrarNovoOverride && (
                  <p className="text-xs text-muted-foreground italic">Sem overrides · pessoa usa só a matriz do cargo.</p>
                )}
                {overrides.map(o => {
                  const expirado = o.expira_em && new Date(o.expira_em) < new Date();
                  const nivelExibir = o.nivel_escrita ?? o.nivel_leitura ?? o.nivel ?? 0;
                  return (
                    <Card key={`${o.usuario_id}-${o.modulo_id}`} className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{o.modulos?.nome || o.modulo_id}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>Nível {nivelExibir}</span>
                          {o.pode_exportar && <Badge variant="secondary" className="text-[10px] h-4">+E</Badge>}
                          {o.pode_aprovar && <Badge variant="secondary" className="text-[10px] h-4">+A</Badge>}
                          {o.escopo_proprio && <Badge variant="secondary" className="text-[10px] h-4">*</Badge>}
                          {o.expira_em && (
                            <span className={expirado ? 'text-red-600 font-medium' : ''}>
                              · {expirado ? 'expirou' : 'expira'} {formatDataExpiracao(o.expira_em)}
                            </span>
                          )}
                        </div>
                        {o.motivo && (
                          <p className="text-xs text-muted-foreground mt-1 italic">"{o.motivo}"</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removerOverride(o.modulo_id)}
                        disabled={salvando}
                        title="Remover override"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </Card>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        <div className="flex justify-end pt-4 mt-2 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1.5" /> Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NovoOverrideForm({ modulos, usuarioId, onCancel, onCreated }) {
  const [moduloId, setModuloId] = useState('');
  const [nivel, setNivel] = useState(1);
  const [podeExportar, setPodeExportar] = useState(false);
  const [podeAprovar, setPodeAprovar] = useState(false);
  const [escopoProprio, setEscopoProprio] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [expiraEm, setExpiraEm] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!moduloId) {
      toast.error('Selecione o módulo');
      return;
    }
    setSalvando(true);
    try {
      await api.setModulo(usuarioId, {
        modulo_id: moduloId,
        // Backend espera leitura + escrita separados (ver permissoes.js:230)
        // Usamos o mesmo valor pros 2 · UI futuramente pode diferenciar
        nivel_leitura: nivel,
        nivel_escrita: nivel,
        pode_exportar: podeExportar,
        pode_aprovar: podeAprovar,
        escopo_proprio: escopoProprio,
        motivo: motivo.trim() || null,
        expira_em: expiraEm || null,
      });
      toast.success('Override criado');
      await onCreated();
    } catch (e) {
      toast.error(e.message || 'Erro ao criar override');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className="p-4 space-y-3 mb-3 border-primary/30 bg-primary/5">
      <div>
        <label className="text-xs font-medium block mb-1">Módulo</label>
        <Select value={moduloId} onValueChange={setModuloId} disabled={salvando}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Escolha o módulo..." />
          </SelectTrigger>
          <SelectContent>
            {modulos.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1">Nível</label>
          <Select value={String(nivel)} onValueChange={v => setNivel(parseInt(v, 10))} disabled={salvando}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NIVEIS.map(n => (
                <SelectItem key={n} value={String(n)}>Nível {n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Expira em (opcional)</label>
          <Input
            type="date"
            value={expiraEm}
            onChange={e => setExpiraEm(e.target.value)}
            disabled={salvando}
            className="h-9"
          />
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Checkbox checked={podeExportar} onCheckedChange={v => setPodeExportar(!!v)} disabled={salvando || nivel === 0} />
          <span>+E exportar</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Checkbox checked={podeAprovar} onCheckedChange={v => setPodeAprovar(!!v)} disabled={salvando || nivel === 0} />
          <span>+A aprovar</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Checkbox checked={escopoProprio} onCheckedChange={v => setEscopoProprio(!!v)} disabled={salvando || nivel === 0} />
          <span>* escopo próprio</span>
        </label>
      </div>
      <div>
        <label className="text-xs font-medium block mb-1">Motivo</label>
        <Input
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          placeholder="Ex: cobrir licença do Pedro até fim do mês"
          disabled={salvando}
          className="h-9 text-sm"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={salvando}>Cancelar</Button>
        <Button size="sm" onClick={salvar} disabled={salvando}>Salvar override</Button>
      </div>
    </Card>
  );
}
