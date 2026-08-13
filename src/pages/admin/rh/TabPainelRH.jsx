import { useEffect, useState } from 'react';
import { painelRh, events as eventsApi } from '../../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Plus, Trash2, Send, Archive, Pencil, X } from 'lucide-react';

const CATEGORIAS_AUTOMATICAS = ['Rotina de Liturgia', 'Série', 'Geracional', 'Rotina Staff', 'Feriado'];

function StatusBadge({ status }) {
  const map = {
    rascunho: { label: 'Rascunho', color: '#737373', bg: '#73737318' },
    publicado: { label: 'Publicado', color: '#00B39D', bg: '#00B39D18' },
    arquivado: { label: 'Arquivado', color: '#a3a3a3', bg: '#a3a3a318' },
  };
  const s = map[status] || { label: status, color: '#737373', bg: '#73737318' };
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}

function SecaoComunicados() {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(null); // {id?, titulo, corpo}
  const [erro, setErro] = useState('');

  async function carregar() {
    setCarregando(true);
    try {
      const data = await painelRh.comunicadosAdmin();
      setLista(Array.isArray(data) ? data : []);
    } catch (e) {
      setErro('Erro ao carregar comunicados.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function salvar() {
    if (!editando?.titulo?.trim() || !editando?.corpo?.trim()) return;
    setErro('');
    try {
      if (editando.id) {
        await painelRh.atualizarComunicado(editando.id, { titulo: editando.titulo, corpo: editando.corpo });
      } else {
        await painelRh.criarComunicado({ titulo: editando.titulo, corpo: editando.corpo });
      }
      setEditando(null);
      carregar();
    } catch (e) {
      setErro('Erro ao salvar comunicado.');
    }
  }

  async function publicar(id) {
    try { await painelRh.publicarComunicado(id); carregar(); } catch { setErro('Erro ao publicar.'); }
  }
  async function arquivar(id) {
    try { await painelRh.arquivarComunicado(id); carregar(); } catch { setErro('Erro ao arquivar.'); }
  }
  async function remover(id) {
    if (!window.confirm('Excluir este comunicado?')) return;
    try { await painelRh.removerComunicado(id); carregar(); } catch { setErro('Erro ao excluir.'); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Comunicados de RH</CardTitle>
        {!editando && (
          <Button size="sm" onClick={() => setEditando({ titulo: '', corpo: '' })}>
            <Plus className="h-4 w-4 mr-1" /> Novo comunicado
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {editando && (
          <div className="border border-border rounded-lg p-4 space-y-3">
            <Input
              placeholder="Título"
              value={editando.titulo}
              onChange={(e) => setEditando((p) => ({ ...p, titulo: e.target.value }))}
            />
            <Textarea
              placeholder="Corpo do comunicado"
              rows={4}
              value={editando.corpo}
              onChange={(e) => setEditando((p) => ({ ...p, corpo: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={salvar}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
            </div>
          </div>
        )}

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum comunicado criado ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {lista.map((c) => (
              <li key={c.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-sm truncate">{c.titulo}</p>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{c.corpo}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {c.status !== 'publicado' && (
                    <Button size="icon" variant="ghost" title="Publicar" onClick={() => publicar(c.id)}>
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                  {c.status !== 'arquivado' && (
                    <Button size="icon" variant="ghost" title="Arquivar" onClick={() => arquivar(c.id)}>
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" title="Editar" onClick={() => setEditando({ id: c.id, titulo: c.titulo, corpo: c.corpo })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Excluir" onClick={() => remover(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function efetivo(ev) {
  if (ev.visivel_painel_rh === true) return { label: 'Forçado visível', cor: '#00B39D' };
  if (ev.visivel_painel_rh === false) return { label: 'Forçado oculto', cor: '#a3a3a3' };
  const auto = CATEGORIAS_AUTOMATICAS.includes(ev.category_name);
  return auto
    ? { label: 'Automático · aparece', cor: '#00B39D' }
    : { label: 'Automático · não aparece', cor: '#a3a3a3' };
}

function SecaoEventos() {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  async function carregar() {
    setCarregando(true);
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const data = await eventsApi.list({ year: new Date().getFullYear() });
      const proximos = (Array.isArray(data) ? data : [])
        .filter((e) => e.date >= hoje)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 40);
      setLista(proximos);
    } catch (e) {
      setErro('Erro ao carregar eventos.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function definir(id, valor) {
    try {
      await eventsApi.setVisivelPainelRh(id, valor);
      carregar();
    } catch (e) {
      setErro('Erro ao atualizar visibilidade.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Eventos no painel de RH</CardTitle>
        <p className="text-xs text-muted-foreground">
          Eventos de Rotina de Liturgia, Série, Geracional, Rotina Staff e Feriado aparecem
          automaticamente. Use os botões para forçar mostrar/esconder qualquer evento.
        </p>
      </CardHeader>
      <CardContent>
        {erro && <p className="text-sm text-destructive mb-2">{erro}</p>}
        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento futuro cadastrado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {lista.map((ev) => {
              const st = efetivo(ev);
              return (
                <li key={ev.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{ev.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(`${ev.date}T12:00:00`).toLocaleDateString('pt-BR')}
                      {ev.category_name ? ` · ${ev.category_name}` : ''}
                      {' · '}
                      <span style={{ color: st.cor }}>{st.label}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => definir(ev.id, true)}>Mostrar</Button>
                    <Button size="sm" variant="outline" onClick={() => definir(ev.id, false)}>Ocultar</Button>
                    <Button size="sm" variant="ghost" onClick={() => definir(ev.id, null)}>Automático</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function TabPainelRH() {
  return (
    <div className="space-y-6">
      <SecaoComunicados />
      <SecaoEventos />
    </div>
  );
}
