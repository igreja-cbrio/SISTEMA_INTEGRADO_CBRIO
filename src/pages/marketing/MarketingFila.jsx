import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { marketing as api } from '../../api';
import { supabase } from '../../supabaseClient';
import MarketingNav from './MarketingNav';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  ListOrdered, Loader2, Megaphone, GripVertical, Zap, User2, Clock,
  AlertCircle, RefreshCw, Lock,
} from 'lucide-react';
import { toast } from 'sonner';

function fmtData(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function diasAte(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

export default function MarketingFila() {
  const { profile, isAdmin, modulePerms } = useAuth();
  const isCoord = isAdmin || (modulePerms?.marketing?.escrita || 0) >= 5;

  const [lista, setLista]       = useState([]);
  const [membros, setMembros]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [fMembro, setFMembro]   = useState('todos');
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragOver, setDragOver] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const [f, m] = await Promise.all([api.fila.list(), api.membros()]);
      setLista(Array.isArray(f) ? f : []);
      setMembros(m || []);
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar fila');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Realtime
  useEffect(() => {
    if (!supabase || !profile?.id) return;
    let timeout = null;
    function sched() {
      clearTimeout(timeout);
      timeout = setTimeout(carregar, 500);
    }
    const ch = supabase
      .channel(`marketing-fila:${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_kanban_cards' }, sched)
      .subscribe();
    return () => { clearTimeout(timeout); supabase.removeChannel(ch); };
  }, [profile?.id, carregar]);

  const filtrada = useMemo(() => {
    if (fMembro === 'todos') return lista;
    if (fMembro === 'sem') return lista.filter(c => !c.atribuido_a);
    return lista.filter(c => c.atribuido_a === fMembro);
  }, [lista, fMembro]);

  // Drag-and-drop via HTML5 (mesmo padrao do Kanban)
  // dragIndex / overIndex pra reordenar localmente · save em batch no drop
  const dragIndexRef = useRef(null);

  function onDragStart(e, index, card) {
    if (!isCoord) return;
    if (card.estado === 'em_producao') return; // em_producao nao move
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e, index) {
    if (!isCoord || dragIndexRef.current == null) return;
    e.preventDefault();
    setDragOver(index);
  }

  async function onDrop(e, dropIndex) {
    e.preventDefault();
    setDragOver(null);
    const fromIndex = dragIndexRef.current;
    if (fromIndex == null || fromIndex === dropIndex) return;
    dragIndexRef.current = null;

    // Reordena lista localmente
    const novaLista = [...filtrada];
    const [moved] = novaLista.splice(fromIndex, 1);
    novaLista.splice(dropIndex, 0, moved);

    // em_producao deve sempre vir antes na ordenacao
    novaLista.sort((a, b) =>
      (a.estado === 'em_producao' ? 0 : 1) - (b.estado === 'em_producao' ? 0 : 1)
    );

    // Mapeia ordens (1, 2, 3...)
    const ordens = novaLista.map((c, i) => ({ id: c.id, ordem: i + 1 }));

    setSavingOrder(true);
    setLista(prev => {
      // Atualiza lista geral (caso esteja filtrada · merge)
      const map = new Map(prev.map(c => [c.id, c]));
      novaLista.forEach((c, i) => { if (map.has(c.id)) map.set(c.id, { ...map.get(c.id), ordem_fila: i + 1 }); });
      return [...map.values()].sort((a, b) =>
        ((a.estado === 'em_producao' ? 0 : 1) - (b.estado === 'em_producao' ? 0 : 1))
        || (a.ordem_fila - b.ordem_fila)
      );
    });
    try {
      await api.fila.reordenar(ordens);
      toast.success('Fila reordenada');
    } catch (err) {
      toast.error(err.message || 'Erro ao reordenar · recarregando');
      carregar();
    } finally {
      setSavingOrder(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ListOrdered className="h-6 w-6 text-primary" />
            Marketing · Fila de prioridade
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isCoord
              ? 'Arraste pra reordenar · equipe executa nessa sequência (em produção primeiro · fila depois)'
              : 'Sequência de execução · só coordenador reordena'}
          </p>
        </div>
        <MarketingNav />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
        <span className="text-sm text-muted-foreground">Mostrar:</span>
        <Select value={fMembro} onValueChange={setFMembro}>
          <SelectTrigger className="w-[200px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os cards</SelectItem>
            <SelectItem value="sem">Sem atribuição</SelectItem>
            {membros.map(m => (
              <SelectItem key={m.id} value={m.id}>
                {m.profile?.name || '(sem nome)'} · {m.habilidade}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {savingOrder && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button variant="outline" size="sm" onClick={carregar} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtrada.length === 0 ? (
        <Card className="p-8 text-center">
          <ListOrdered className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Fila vazia</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtrada.map((card, i) => (
            <FilaRow
              key={card.id}
              index={i}
              card={card}
              isCoord={isCoord}
              isDragOver={dragOver === i}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragLeave={() => setDragOver(null)}
              onDragEnd={() => { dragIndexRef.current = null; setDragOver(null); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilaRow({ card, index, isCoord, isDragOver, onDragStart, onDragOver, onDrop, onDragLeave, onDragEnd }) {
  const emProducao = card.estado === 'em_producao';
  const dias = diasAte(card.prazo_confirmado);
  const draggable = isCoord && !emProducao;

  // Detecta desencontro · posicao alta mas prazo muito proximo
  // (Pedro botou no fim mas prazo eh em <7d) ou inverso (topo mas prazo em meses)
  const alertaPrazo = (() => {
    if (dias == null || emProducao) return null;
    if (dias < 0) return { msg: 'prazo vencido', cor: 'text-rose-600' };
    if (dias < 7 && index > 5) return { msg: `prazo em ${dias}d · fora da prioridade`, cor: 'text-rose-600' };
    if (dias > 90 && index < 3) return { msg: `prazo em ${Math.round(dias/30)}m · adiantando`, cor: 'text-blue-600' };
    return null;
  })();

  return (
    <Card
      draggable={draggable}
      onDragStart={e => onDragStart(e, index, card)}
      onDragOver={e => onDragOver(e, index)}
      onDragLeave={onDragLeave}
      onDrop={e => onDrop(e, index)}
      onDragEnd={onDragEnd}
      className={`p-3 flex items-center gap-3 ${draggable ? 'cursor-move' : ''} ${
        isDragOver ? 'ring-2 ring-primary border-primary' : ''
      } ${emProducao ? 'bg-blue-500/5 border-blue-500/30' : ''}`}
    >
      {/* Drag handle */}
      <div className="w-8 flex flex-col items-center text-muted-foreground shrink-0">
        {draggable ? (
          <GripVertical className="h-4 w-4" />
        ) : emProducao ? (
          <Lock className="h-3 w-3" title="em produção · não move" />
        ) : (
          <span className="h-4 w-4" />
        )}
        <span className="text-[10px] font-mono mt-0.5">{emProducao ? '▶' : index + 1}</span>
      </div>

      {/* Conteudo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <p className="text-sm font-medium truncate flex-1">{card.titulo}</p>
          {card.raia_rapida && (
            <Badge className="text-[10px] bg-rose-500/15 text-rose-700 dark:text-rose-400 gap-0.5">
              <Zap className="h-3 w-3" /> Urgente
            </Badge>
          )}
          {emProducao && (
            <Badge className="text-[10px] bg-blue-500/15 text-blue-700 dark:text-blue-400">Em produção</Badge>
          )}
          {card.tem_revisao && (
            <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400">⟳ Revisão</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          {card.etiqueta_tipo && (
            <Badge
              className="text-[10px] px-1.5 py-0.5"
              style={card.etiqueta_tipo.cor ? { backgroundColor: `${card.etiqueta_tipo.cor}25`, color: card.etiqueta_tipo.cor } : undefined}
            >
              {card.etiqueta_tipo.nome}
              {card.etiqueta_tipo.esforco_max_h ? ` · ${card.etiqueta_tipo.esforco_max_h}h` : ''}
            </Badge>
          )}
          <span className="flex items-center gap-1">
            <User2 className="h-3 w-3" />
            {card.atribuido?.profile?.name || '(sem atribuição)'}
          </span>
          {card.prazo_confirmado && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {fmtData(card.prazo_confirmado)}
              {dias != null && (
                <span className={`ml-1 ${dias < 7 ? 'text-amber-700' : ''}`}>
                  ({dias > 0 ? '+' : ''}{dias}d)
                </span>
              )}
            </span>
          )}
          {alertaPrazo && (
            <span className={`flex items-center gap-1 ${alertaPrazo.cor}`}>
              <AlertCircle className="h-3 w-3" /> {alertaPrazo.msg}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
