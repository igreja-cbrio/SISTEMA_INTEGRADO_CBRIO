import { useState, useEffect, useMemo } from 'react';
import { permissoes as api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import Paginacao, { usePaginacaoLocal } from '../../components/Paginacao';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { Checkbox } from '../../components/ui/checkbox';
import { Search, X, Plus, Pencil, RotateCcw, Copy, Check, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const NIVEIS = [0, 1, 2, 3, 4, 5];

// Categorias dos módulos (espelha a aba Matriz) · agrupa a grade por seção.
const CATEGORIA_LABELS = {
  estrategica:    'Estratégica',
  ministerial:    'Ministerial',
  operacional:    'Operacional',
  dados_ia_admin: 'Dados · IA · Admin',
  outros:         'Outros',
};
const CATEGORIA_ORDEM = ['estrategica', 'ministerial', 'operacional', 'dados_ia_admin', 'outros'];

// Níveis 0-5 com "Ver" (1) e "Mexer" (3) em destaque · usados no seletor da grade.
const NIVEL_OPCOES = [
  { v: 0, l: 'Sem acesso' },
  { v: 1, l: 'Ver' },
  { v: 2, l: 'Ver + lançar dado' },
  { v: 3, l: 'Mexer (editar)' },
  { v: 4, l: 'Mexer + excluir' },
  { v: 5, l: 'Admin do módulo' },
];

// De onde vem o nível efetivo da pessoa naquele módulo.
const ORIGEM_META = {
  cargo:    { label: 'do cargo',      cls: 'bg-muted text-muted-foreground' },
  area:     { label: 'da área',       cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  override: { label: 'definido aqui', cls: 'bg-primary/15 text-primary' },
  bloqueio: { label: 'bloqueado',     cls: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  nenhum:   { label: 'sem acesso',    cls: 'bg-muted text-muted-foreground' },
};

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
  const { isDev } = useAuth(); // só você + Marcos Paulo veem "Criar usuário"
  const [loading, setLoading] = useState(true);
  const [colaboradores, setColaboradores] = useState([]);
  const [estrutura, setEstrutura] = useState({ setores: [], areas: [], modulos: [], cargos: [] });
  const [busca, setBusca] = useState('');
  const [filtroCargo, setFiltroCargo] = useState('todos');
  const [editando, setEditando] = useState(null); // colaborador
  const [usuarioCarregado, setUsuarioCarregado] = useState(null); // dados do GET /usuario/:id
  const [criando, setCriando] = useState(false); // dialog de novo login

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
      toast.error(e.message || 'Erro ao carregar usuário');
    }
  }

  function fecharEdicao() {
    setEditando(null);
    setUsuarioCarregado(null);
  }

  // Atualiza um colaborador na lista + no diálogo aberto (ex: após mudar o role,
  // que não vem do GET /usuario/:id) pra refletir sem recarregar tudo.
  function patchColaborador(id, patch) {
    setColaboradores(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
    setEditando(prev => (prev && prev.id === id ? { ...prev, ...patch } : prev));
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
      if (filtroCargo === 'sem-cargo') {
        if (c.cargo_id) return false;
      } else if (filtroCargo !== 'todos') {
        if (c.cargo_slug !== filtroCargo) return false;
      }
      return true;
    });
  }, [colaboradores, busca, filtroCargo]);

  const { pageItems: filtradosPag, paginacaoProps: usuariosPagProps } = usePaginacaoLocal(filtrados, 25);

  const totalSemCargo = useMemo(
    () => (colaboradores || []).filter(c => !c.cargo_id).length,
    [colaboradores]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Criar usuário · só devs (você + Marcos Paulo) */}
      {isDev && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Criar usuário</p>
            <p className="text-xs text-muted-foreground">Cria um login novo (e-mail + senha) direto no sistema, com cargo e áreas. Visível só pra você e o Marcos.</p>
          </div>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setCriando(true)}>
            <Plus className="h-4 w-4" /> Criar usuário
          </Button>
        </div>
      )}

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
              {totalSemCargo > 0 && (
                <SelectItem value="sem-cargo">
                  ⚠️ Sem cargo ({totalSemCargo})
                </SelectItem>
              )}
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
          filtradosPag.map(c => {
            const semCargo = !c.cargo_id;
            return (
              <div
                key={c.id}
                className={`p-3 flex items-center gap-3 transition-colors ${
                  semCargo
                    ? 'bg-amber-500/5 border-l-4 border-l-amber-500 hover:bg-amber-500/10'
                    : 'hover:bg-accent/50'
                }`}
              >
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
                {semCargo ? (
                  <Badge variant="outline" className="text-xs shrink-0 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40">
                    Sem cargo
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs shrink-0 capitalize">
                    {c.cargo_nome || c.cargo_slug}
                  </Badge>
                )}
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => abrirEdicao(c)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              </div>
            );
          })
        )}
      </Card>
      <Paginacao {...usuariosPagProps} itemLabel="pessoas" />
      {usuariosPagProps.total <= usuariosPagProps.pageSize && (
        <p className="text-xs text-muted-foreground text-right">
          {filtrados.length} {filtrados.length === 1 ? 'pessoa' : 'pessoas'}
        </p>
      )}

      {/* Dialog de criar login · só devs */}
      {criando && isDev && (
        <NovoUsuarioDialog
          estrutura={estrutura}
          onClose={() => setCriando(false)}
          onCreated={async () => { setCriando(false); await loadColaboradores(); }}
        />
      )}

      {/* Dialog de edição */}
      {editando && (
        <EditarUsuarioDialog
          colaborador={editando}
          dadosUsuario={usuarioCarregado}
          estrutura={estrutura}
          onClose={fecharEdicao}
          onColaboradorChange={patchColaborador}
          onSaved={async () => {
            // Recarrega dados do usuário pra refletir mudanças
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

// Gera uma senha inicial forte e legível (o dev repassa pra pessoa; ela troca depois).
function gerarSenha() {
  const abc = 'abcdefghijkmnpqrstuvwxyz';
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const num = '23456789';
  const pick = (s, n) => Array.from({ length: n }, (_, i) => s[(Date.now() + i * 7 + s.length) % s.length]).join('');
  // mistura simples e determinística-o-suficiente (sem Math.random pra evitar libs)
  const base = (pick(ABC, 2) + pick(abc, 4) + pick(num, 3)).split('');
  for (let i = base.length - 1; i > 0; i--) { const j = (Date.now() + i * 13) % (i + 1); [base[i], base[j]] = [base[j], base[i]]; }
  return 'Cbrio' + base.join('') + '!';
}

// Dialog de CRIAR LOGIN (só devs) · cria email+senha + cargo + áreas.
function NovoUsuarioDialog({ estrutura, onClose, onCreated }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState(gerarSenha());
  const [cargoId, setCargoId] = useState('');
  const [role, setRole] = useState('assistente');
  const [areasSel, setAreasSel] = useState(new Set());
  const [salvando, setSalvando] = useState(false);
  const [criado, setCriado] = useState(null); // { email, senha } após sucesso
  const [copiado, setCopiado] = useState(false);

  function toggleArea(id) {
    setAreasSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function criar() {
    if (!nome.trim() || nome.trim().length < 2) { toast.error('Informe o nome'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { toast.error('E-mail inválido'); return; }
    if (senha.length < 6) { toast.error('A senha precisa ter ao menos 6 caracteres'); return; }
    setSalvando(true);
    try {
      await api.criarLogin({
        email: email.trim(), nome: nome.trim(), senha, cargo_id: cargoId || null,
        role, areas: Array.from(areasSel),
      });
      toast.success('Usuário criado');
      setCriado({ email: email.trim(), senha });
    } catch (e) {
      toast.error(e.message || 'Erro ao criar o usuário');
    } finally {
      setSalvando(false);
    }
  }

  function copiar() {
    navigator.clipboard?.writeText(`Login: ${criado.email}\nSenha: ${criado.senha}`);
    setCopiado(true); setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) (criado ? onCreated() : onClose()); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Criar usuário</DialogTitle>
        </DialogHeader>

        {criado ? (
          <div className="space-y-4 mt-2">
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Usuário criado com sucesso ✅</p>
              <p className="text-xs text-muted-foreground">Anote e repasse estes dados pra pessoa. Ela pode trocar a senha depois no próprio perfil.</p>
              <div className="text-sm font-mono bg-background rounded-md border border-border p-3">
                <div><span className="text-muted-foreground">Login:</span> {criado.email}</div>
                <div><span className="text-muted-foreground">Senha:</span> {criado.senha}</div>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={copiar}>
                {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiado ? 'Copiado!' : 'Copiar login e senha'}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={onCreated}>Concluir</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium block mb-1">Nome *</label>
                <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">E-mail *</label>
                <Input value={email} type="email" onChange={e => setEmail(e.target.value)} placeholder="pessoa@cbrio.org" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Senha inicial *</label>
                <div className="flex gap-2">
                  <Input value={senha} onChange={e => setSenha(e.target.value)} className="font-mono" />
                  <Button type="button" variant="outline" size="icon" title="Gerar nova senha" onClick={() => setSenha(gerarSenha())}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">A pessoa pode trocar depois no perfil.</p>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Cargo</label>
                <Select value={cargoId} onValueChange={setCargoId}>
                  <SelectTrigger><SelectValue placeholder="Escolher cargo (opcional)..." /></SelectTrigger>
                  <SelectContent>
                    {(estrutura.cargos || []).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome_completo || c.nome || c.slug}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Tipo de conta</label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assistente">Assistente · segue cargo + áreas</SelectItem>
                    <SelectItem value="diretor">Diretor · vê o sistema inteiro</SelectItem>
                    <SelectItem value="admin">Admin · vê o sistema inteiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(estrutura.areas || []).length > 0 && (
                <div>
                  <label className="text-sm font-medium block mb-1">Áreas (opcional)</label>
                  <div className="flex flex-wrap gap-2">
                    {(estrutura.areas || []).map(a => {
                      const ativo = areasSel.has(a.id);
                      return (
                        <button key={a.id} type="button" onClick={() => toggleArea(a.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${ativo ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-primary text-foreground'}`}>
                          {a.nome}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-border">
              <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
              <Button onClick={criar} disabled={salvando} className="gap-1.5">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar usuário
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditarUsuarioDialog({ colaborador, dadosUsuario, estrutura, onClose, onSaved, onColaboradorChange }) {
  const { isDev } = useAuth(); // editar e-mail de login = só devs (você + Marcos)
  const carregando = !dadosUsuario;
  const usuario = dadosUsuario?.usuario;
  const areasUsuario = dadosUsuario?.areas || [];
  const grade = dadosUsuario?.grade || [];

  const [cargoId, setCargoId] = useState(usuario?.cargo_id || '');
  const [role, setRole] = useState(colaborador.role || '');
  const [areasSelecionadas, setAreasSelecionadas] = useState(new Set());
  const [salvando, setSalvando] = useState(false);
  const [mostrarNovoOverride, setMostrarNovoOverride] = useState(false);
  const [editandoEmail, setEditandoEmail] = useState(false);
  const [novoEmail, setNovoEmail] = useState(colaborador.email || '');
  const [salvandoEmail, setSalvandoEmail] = useState(false);

  async function salvarEmail() {
    const em = novoEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast.error('E-mail inválido'); return; }
    setSalvandoEmail(true);
    try {
      await api.setEmail(colaborador.id, em);
      onColaboradorChange?.(colaborador.id, { email: em });
      setEditandoEmail(false);
      toast.success('E-mail atualizado · a pessoa loga com o novo e-mail');
    } catch (e) {
      toast.error(e.message || 'Erro ao editar o e-mail');
    } finally {
      setSalvandoEmail(false);
    }
  }

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

  async function salvarRole(novoRole) {
    setSalvando(true);
    try {
      await api.setRole(colaborador.id, novoRole);
      setRole(novoRole);
      onColaboradorChange?.(colaborador.id, { role: novoRole });
      toast.success('Acesso base atualizado · a pessoa precisa sair e entrar de novo');
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar acesso base');
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

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
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

        <div className="flex-1 overflow-y-auto min-h-0">
        {carregando ? (
          <div className="py-12 flex items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            {/* E-mail de acesso · editar (só devs) */}
            {isDev && (
              <section>
                <h3 className="text-sm font-semibold text-foreground mb-2">E-mail de acesso</h3>
                {editandoEmail ? (
                  <div className="flex gap-2">
                    <Input value={novoEmail} type="email" onChange={e => setNovoEmail(e.target.value)} className="h-9" placeholder="novo@cbrio.org" />
                    <Button size="sm" onClick={salvarEmail} disabled={salvandoEmail}>
                      {salvandoEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditandoEmail(false); setNovoEmail(colaborador.email || ''); }} disabled={salvandoEmail}>Cancelar</Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{colaborador.email || '—'}</span>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditandoEmail(true)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar e-mail
                    </Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1.5">Muda o e-mail de <strong>login</strong> (a pessoa passa a entrar com o novo). Só funciona pra quem tem login de sistema.</p>
              </section>
            )}

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

            {/* Tipo de conta (role · admin/diretor = vê tudo; assistente = segue cargo+área+exceções) */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">Tipo de conta</h3>
              <Select value={role || ''} onValueChange={salvarRole} disabled={salvando}>
                <SelectTrigger>
                  <SelectValue placeholder="Definir tipo de conta..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assistente">Assistente · segue a matriz do cargo</SelectItem>
                  <SelectItem value="diretor">Diretor · vê o sistema inteiro</SelectItem>
                  <SelectItem value="admin">Admin · vê o sistema inteiro</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                <strong>Admin</strong> e <strong>Diretor</strong> liberam o sistema todo — ignoram a matriz e
                os módulos do cargo. <strong>Assistente</strong> só enxerga o que cargo + áreas + overrides
                liberam. Depois de mudar, a pessoa precisa sair e entrar de novo pra renovar o acesso.
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

            {/* Acesso por módulo · grade efetiva (cargo + área + override) */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-1">Acesso por módulo</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Cada módulo mostra a <strong>base</strong> que vem do cargo/área. Mudar aqui cria uma{' '}
                <strong>exceção</strong> só pra essa pessoa — e a exceção <strong>vence a base</strong> (o ↺ remove).{' '}
                <strong>Ver</strong> = só leitura · <strong>Mexer</strong> = criar/editar · <strong>Sem acesso</strong> = bloqueia.
              </p>
              <GradeModulos grade={grade} usuarioId={colaborador.id} onSaved={onSaved} />
            </section>

            {/* Override temporário / avançado */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-foreground">Override temporário</h3>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMostrarNovoOverride(v => !v)}>
                  <Plus className="h-3.5 w-3.5" /> {mostrarNovoOverride ? 'Fechar' : 'Adicionar'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Exceção com <strong>data de expiração</strong> ou modificadores (+E exportar · +A aprovar ·
                <span className="whitespace-nowrap"> * escopo próprio</span>). Pra acesso permanente, use a grade acima.
              </p>
              {mostrarNovoOverride && (
                <NovoOverrideForm
                  modulos={estrutura.modulos || []}
                  onCancel={() => setMostrarNovoOverride(false)}
                  onCreated={async () => { setMostrarNovoOverride(false); await onSaved(); }}
                  usuarioId={colaborador.id}
                />
              )}
            </section>
          </div>
        )}
        </div>

        <div className="flex justify-end pt-4 mt-2 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1.5" /> Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Grade de acesso EFETIVO por módulo · 1 linha por módulo, agrupada por categoria.
// Mostra o nível atual + de onde vem (cargo/área/override/bloqueio) e deixa
// ajustar "ver/mexer" por pessoa. Grava via override (o backend apaga o override
// quando o nível volta a bater com o padrão do cargo).
function GradeModulos({ grade, usuarioId, onSaved }) {
  const [salvandoMod, setSalvandoMod] = useState(null);

  async function aplicarNivel(row, novoNivel) {
    setSalvandoMod(row.modulo_id);
    try {
      // Modelo do sistema: 1 nível por módulo (leitura = escrita), igual à matriz
      // do cargo. Modificadores (E/A/*) e expiração/motivo são preservados.
      await api.setModulo(usuarioId, {
        modulo_id: row.modulo_id,
        nivel_leitura: novoNivel,
        nivel_escrita: novoNivel,
        pode_exportar: row.pode_exportar,
        pode_aprovar: row.pode_aprovar,
        escopo_proprio: row.escopo_proprio,
        motivo: row.override?.motivo || null,
        expira_em: row.override?.expira_em || null,
      });
      await onSaved();
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar o módulo');
    } finally {
      setSalvandoMod(null);
    }
  }

  async function resetarModulo(row) {
    setSalvandoMod(row.modulo_id);
    try {
      await api.removerOverride(usuarioId, row.modulo_id);
      await onSaved();
    } catch (e) {
      toast.error(e.message || 'Erro ao remover a exceção');
    } finally {
      setSalvandoMod(null);
    }
  }

  const porCategoria = useMemo(() => {
    const buckets = {};
    for (const r of grade || []) {
      const cat = r.categoria || 'outros';
      (buckets[cat] = buckets[cat] || []).push(r);
    }
    return buckets;
  }, [grade]);

  const cats = useMemo(() => {
    const presentes = Object.keys(porCategoria);
    return CATEGORIA_ORDEM.filter(c => porCategoria[c]?.length)
      .concat(presentes.filter(c => !CATEGORIA_ORDEM.includes(c)));
  }, [porCategoria]);

  if (!grade?.length) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Sem módulos pra exibir · atribua um cargo acima pra ver a grade.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {cats.map(cat => (
        <div key={cat}>
          <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            {CATEGORIA_LABELS[cat] || cat}
          </h4>
          <Card className="divide-y divide-border">
            {porCategoria[cat].map(row => {
              const om = ORIGEM_META[row.origem] || ORIGEM_META.nenhum;
              const saving = salvandoMod === row.modulo_id;
              const temOverride = row.origem === 'override' || row.origem === 'bloqueio';
              return (
                <div key={row.modulo_id} className={`p-2.5 flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{row.nome}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <Badge className={`text-[10px] h-4 ${om.cls}`}>{om.label}</Badge>
                      {row.override?.expira_em && (
                        <span className="text-[10px] text-muted-foreground">
                          expira {formatDataExpiracao(row.override.expira_em)}
                        </span>
                      )}
                      {row.pode_exportar && <Badge variant="secondary" className="text-[10px] h-4">+E</Badge>}
                      {row.pode_aprovar && <Badge variant="secondary" className="text-[10px] h-4">+A</Badge>}
                      {row.escopo_proprio && <Badge variant="secondary" className="text-[10px] h-4">*</Badge>}
                    </div>
                  </div>

                  {/* Override é soberano · o seletor SEMPRE aparece (incl. módulos vindos da área).
                      "via área" indica que, sem exceção, a área concede Admin aqui. */}
                  <div className="flex items-center gap-1 shrink-0">
                    {row.area_boost && !temOverride && (
                      <span className="text-[10px] text-blue-700 dark:text-blue-400 mr-1 whitespace-nowrap">via área</span>
                    )}
                    <Select
                      value={String(row.leitura)}
                      onValueChange={v => aplicarNivel(row, parseInt(v, 10))}
                      disabled={saving}
                    >
                      <SelectTrigger className="w-[176px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NIVEL_OPCOES.map(n => (
                          <SelectItem key={n.v} value={String(n.v)} className="text-xs">
                            {n.v} · {n.l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {temOverride && (
                      <Button
                        size="sm" variant="ghost" disabled={saving}
                        className="h-8 w-8 p-0"
                        onClick={() => resetarModulo(row)}
                        title="Remover a exceção · volta ao padrão do cargo/área"
                      >
                        <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      ))}
    </div>
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
          <DatePicker
            value={expiraEm}
            onChange={v => setExpiraEm(v)}
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
