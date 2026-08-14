import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { agents } from '../../api';
import FilaAprovacao from './FilaAprovacao';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Separator } from '../../components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618', purple: '#8b5cf6', purpleBg: '#8b5cf618',
};

const s = {
  page: { maxWidth: 1600, margin: '0 auto', padding: '0 24px 40px' },
  card: { background: C.card, borderRadius: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', overflow: 'hidden' },
  cardHeader: { padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: 700, color: C.text },
  empty: { textAlign: 'center', padding: 40, color: C.text3, fontSize: 14 },
};

const fmtData = (d) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

// O agente grava título/descrição já escapados (o dev agent monta o texto a
// partir de HTML), então "Corrigir título da página 'Expansao'" chega como
// `&#x27;Expansao&#x27;`. Isto decodifica SÓ NA EXIBIÇÃO — o dado no banco fica
// como está, porque reescrevê-lo seria alterar o registro do que o agente pediu.
// ⚠️ Regex controlada de propósito: decodificar via innerHTML aceitaria markup
// vindo do modelo, e este texto é renderizado em tela de admin.
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#34': '"' };
const textoLimpo = (v) => {
  if (typeof v !== 'string' || !v.includes('&')) return v ?? '';
  return v.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (bruto, corpo) => {
    const chave = corpo.toLowerCase();
    if (ENTIDADES[chave]) return ENTIDADES[chave];
    if (chave.startsWith('#x')) {
      const cod = parseInt(chave.slice(2), 16);
      return Number.isFinite(cod) && cod > 0 && cod <= 0x10ffff ? String.fromCodePoint(cod) : bruto;
    }
    if (chave.startsWith('#')) {
      const cod = parseInt(chave.slice(1), 10);
      return Number.isFinite(cod) && cod > 0 && cod <= 0x10ffff ? String.fromCodePoint(cod) : bruto;
    }
    return bruto;
  });
};

const STATUS_META = {
  nova: { c: C.blue, bg: C.blueBg, label: 'Nova' },
  agendada: { c: C.purple, bg: C.purpleBg, label: 'Agendada' },
  em_diagnostico: { c: C.blue, bg: C.blueBg, label: 'Em diagnóstico' },
  em_andamento: { c: C.primary, bg: C.primaryBg, label: 'Em andamento' },
  aguardando_revisao: { c: C.amber, bg: C.amberBg, label: 'Aguardando revisão' },
  aguardando_aprovacao: { c: C.amber, bg: C.amberBg, label: 'Aguardando aprovação' },
  concluida: { c: C.green, bg: C.greenBg, label: 'Concluída' },
  falhou: { c: C.red, bg: C.redBg, label: 'Falhou' },
  bloqueada: { c: C.red, bg: C.redBg, label: 'Bloqueada' },
  cancelada: { c: C.text3, bg: '#73737318', label: 'Cancelada' },
  rejeitada: { c: C.red, bg: C.redBg, label: 'Rejeitada' },
};

const PRIOR_META = {
  baixa: { c: C.text3, bg: '#73737318', label: 'Baixa' },
  media: { c: C.blue, bg: C.blueBg, label: 'Média' },
  alta: { c: C.amber, bg: C.amberBg, label: 'Alta' },
  critica: { c: C.red, bg: C.redBg, label: 'Crítica' },
};

const CLASSE_LABEL = {
  dev: 'Dev', cyber: 'Cyber', auditoria: 'Auditoria', executor: 'Executor', watcher: 'Watcher', bug: 'Bug',
};

const COLUMNS = [
  'nova', 'em_diagnostico', 'agendada', 'em_andamento', 'aguardando_revisao',
  'aguardando_aprovacao', 'concluida', 'falhou', 'bloqueada', 'rejeitada', 'cancelada',
];

const TRANSICOES = {
  nova: ['em_diagnostico', 'agendada', 'em_andamento', 'cancelada'],
  em_diagnostico: ['aguardando_aprovacao', 'falhou', 'bloqueada', 'cancelada'],
  agendada: ['em_andamento', 'cancelada'],
  em_andamento: ['aguardando_revisao', 'aguardando_aprovacao', 'falhou', 'bloqueada', 'cancelada'],
  aguardando_revisao: ['em_andamento', 'concluida', 'falhou', 'bloqueada'],
  aguardando_aprovacao: ['em_andamento', 'concluida', 'falhou', 'bloqueada', 'rejeitada'],
  concluida: ['em_andamento', 'cancelada'],
  falhou: ['em_andamento', 'bloqueada', 'cancelada'],
  bloqueada: ['em_andamento', 'nova', 'cancelada'],
  rejeitada: [],
  cancelada: [],
};

const BadgeStatus = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.nova;
  return <Badge style={{ background: m.bg, color: m.c }}>{m.label}</Badge>;
};

// ─── Ação humana ─────────────────────────────────────────────────────────────
// Popup exibido quando a tarefa está aguardando decisão de uma pessoa:
//   aguardando_aprovacao → gate G1 (aprovar/reprovar antes de executar)
//   aguardando_revisao   → gate G2 (PR aberto · aprovar/rejeitar)

const STATUS_ACAO_HUMANA = ['aguardando_aprovacao', 'aguardando_revisao'];

function AcaoHumanaDialog({ id, onClose, onChange, onDetalhe }) {
  const [t, setT] = useState(null);
  const [obs, setObs] = useState('');
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try { setT(await agents.agentTasks.tarefa(id)); } catch (e) { alert(e.message); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!t) return <Dialog open onOpenChange={onClose}><DialogContent><DialogHeader><DialogTitle>Carregando...</DialogTitle></DialogHeader></DialogContent></Dialog>;

  const emRevisao = t.status === 'aguardando_revisao';
  const ehBugDiagnosticado = t.classe === 'bug' && t.status === 'aguardando_aprovacao';
  const gateAtual = emRevisao ? 'G2' : 'G1';

  async function agir(aprovado, proximo) {
    setWorking(true);
    try {
      if (ehBugDiagnosticado) {
        await agents.agentTasks.decidir(id, { aprovado, observacao: obs });
      } else {
        await agents.agentTasks.gates(id, { gate: gateAtual, aprovado, observacao: obs });
        if (proximo) await agents.agentTasks.transicao(id, proximo);
      }
      onChange?.();
      onClose();
    } catch (e) { alert(e.message); }
    setWorking(false);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            Ação humana necessária <BadgeStatus status={t.status} />
          </DialogTitle>
          <DialogDescription>
            {ehBugDiagnosticado
              ? `O agente diagnosticou o bug sem alterar código. Ao aprovar, a tarefa volta à fila e o agente corrige, aplica as migrations e faz o merge do PR automaticamente. Ao recusar, a tarefa é encerrada como rejeitada.`
              : emRevisao
                ? `Gate ${gateAtual} · PR aberto aguardando revisão. Revise e faça o merge do PR no GitHub antes de aprovar. Ao aprovar, o card vai para "Concluída"; em "Pedir ajustes", volta para a fila.`
                : `Gate ${gateAtual} · o agente pediu aprovação antes de executar. Ao aprovar, o card volta para a fila e o agente continua automaticamente.`}
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.text2, marginBottom: 4 }}>Tarefa</div>
            <div style={{ fontSize: 14, color: C.text, overflowWrap: 'anywhere' }}>{textoLimpo(t.titulo)}</div>
          </div>
          {ehBugDiagnosticado && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: C.text2, marginBottom: 4 }}>Diagnóstico</div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: C.text, maxHeight: 200, overflowY: 'auto', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg }}>{t.diagnostico || '—'}</div>
            </div>
          )}
          {t.pull_request_url && (
            <div style={{ fontSize: 13 }}>
              <a href={t.pull_request_url} target="_blank" rel="noreferrer" style={{ color: C.primary }}>
                {t.pull_request_url}
              </a>
            </div>
          )}
          <div>
            <Label>Observação (opcional)</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder={ehBugDiagnosticado ? 'Ex.: pode corrigir' : emRevisao ? 'Ex.: merge feito, PR ok' : 'Ex.: pode seguir'} />
          </div>
        </div>

        <DialogFooter style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => { onClose(); onDetalhe?.(id); }}>Ver detalhes</Button>
          <div style={{ flex: 1 }} />
          {emRevisao ? (
            <>
              <Button variant="outline" onClick={() => agir(false, 'agendada')} disabled={working}>Pedir ajustes</Button>
              <Button onClick={() => agir(true, 'concluida')} disabled={working}>Aprovar · concluir</Button>
            </>
          ) : ehBugDiagnosticado ? (
            <>
              <Button variant="outline" onClick={() => agir(false)} disabled={working}>Recusar</Button>
              <Button onClick={() => agir(true)} disabled={working}>Aprovar · corrigir</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => agir(false, 'falhou')} disabled={working}>Reprovar</Button>
              <Button onClick={() => agir(true, 'agendada')} disabled={working}>Aprovar · continuar</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Equipe · board de tarefas ───────────────────────────────────────────────

function NovaTarefaDialog({ open, onClose, membros, onCreated }) {
  const [form, setForm] = useState({ titulo: '', descricao: '', agente_key: '', classe: 'auditoria', prioridade: 'media', origem: 'manual', orcamento_usd: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target ? e.target.value : e }));

  async function salvar() {
    if (!form.titulo.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, orcamento_usd: form.orcamento_usd ? Number(form.orcamento_usd) : null };
      const tarefa = await agents.agentTasks.criarTarefa(payload);
      onCreated?.(tarefa);
      onClose();
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova tarefa para o time de agentes</DialogTitle>
          <DialogDescription>Restrito a super-admins. Não inclua PII na descrição.</DialogDescription>
        </DialogHeader>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <Label>Título *</Label>
            <Input value={form.titulo} onChange={set('titulo')} maxLength={80} placeholder="Curto e direto · Ex.: Corrigir acentuação em 'Solicitacoes'" />
            <div style={{ fontSize: 11, color: form.titulo.length >= 70 ? '#E28743' : C.text3, marginTop: 4 }}>
              {form.titulo.length}/80 · o título vira o nome da branch/PR e das notificações
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={form.descricao} onChange={set('descricao')} rows={4} placeholder="O que o agente deve fazer. Referencie dados por id/slug, nunca CPF/nome/telefone." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Agente</Label>
              <Select value={form.agente_key} onValueChange={set('agente_key')}>
                <SelectTrigger><SelectValue placeholder="Sem agente (fila)" /></SelectTrigger>
                <SelectContent>
                  {membros.filter((m) => m.ativo).map((m) => (
                    <SelectItem key={m.agent_key} value={m.agent_key}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.prioridade} onValueChange={set('prioridade')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(PRIOR_META).map((p) => (
                    <SelectItem key={p} value={p}>{PRIOR_META[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Classe</Label>
              <Select value={form.classe} onValueChange={set('classe')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CLASSE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Orçamento (USD)</Label>
              <Input value={form.orcamento_usd} onChange={set('orcamento_usd')} type="number" step="0.5" placeholder="Opcional" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !form.titulo.trim()}>{saving ? 'Criando...' : 'Criar tarefa'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetalheTarefa({ id, onClose, onChange }) {
  const [t, setT] = useState(null);
  const [novoStatus, setNovoStatus] = useState('');
  const [comentario, setComentario] = useState('');
  const [obsGate, setObsGate] = useState('');

  const load = useCallback(async () => {
    try { setT(await agents.agentTasks.tarefa(id)); } catch (e) { alert(e.message); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function mudarStatus() {
    if (!novoStatus) return;
    try {
      await agents.agentTasks.transicao(id, novoStatus);
      setNovoStatus('');
      load(); onChange?.();
    } catch (e) { alert(e.message); }
  }

  async function enviarComentario() {
    if (!comentario.trim()) return;
    try { await agents.agentTasks.comentar(id, comentario); setComentario(''); load(); } catch (e) { alert(e.message); }
  }

  async function gate(g, aprovado) {
    try { await agents.agentTasks.gates(id, { gate: g, aprovado, observacao: obsGate }); setObsGate(''); load(); onChange?.(); } catch (e) { alert(e.message); }
  }

  async function decidir(aprovado) {
    try { await agents.agentTasks.decidir(id, { aprovado, observacao: obsGate }); setObsGate(''); load(); onChange?.(); } catch (e) { alert(e.message); }
  }

  if (!t) return <Dialog open onOpenChange={onClose}><DialogContent><DialogHeader><DialogTitle>Carregando...</DialogTitle></DialogHeader></DialogContent></Dialog>;

  const proximos = TRANSICOES[t.status] || [];
  const agente = t.agent_team;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{textoLimpo(t.titulo)}</span>
            <BadgeStatus status={t.status} />
          </DialogTitle>
          <DialogDescription>
            {agente ? `${agente.nome} · ${agente.classe}` : 'Sem agente designado'} · prioridade {PRIOR_META[t.prioridade]?.label} · origem {t.origem} · criada {fmtData(t.created_at)}
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex-1 overflow-y-auto min-h-0"
          style={{ display: 'grid', gap: 16, paddingRight: 4, overflowX: 'hidden' }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.text2, marginBottom: 4 }}>Descrição</div>
            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 14, color: C.text }}>
              {textoLimpo(t.descricao) || '—'}
            </div>
          </div>

          {t.pull_request_url && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: C.text2, marginBottom: 4 }}>PR</div>
              <a
                href={t.pull_request_url}
                target="_blank"
                rel="noreferrer"
                style={{ color: C.primary, overflowWrap: 'anywhere', display: 'inline-block', maxWidth: '100%' }}
              >
                {t.pull_request_url}
              </a>
            </div>
          )}

          {t.diagnostico && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: C.text2, marginBottom: 4 }}>Diagnóstico</div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: C.text, maxHeight: 200, overflowY: 'auto', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg }}>{t.diagnostico}</div>
            </div>
          )}

          <Separator />

          <div>
            <Label style={{ display: 'block', marginBottom: 6 }}>Mudar status</Label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* ⚠️ min-w-0 + truncate: o SelectTrigger do shadcn é `whitespace-nowrap`
                  e o SelectValue daqui não tem o data-slot que ativa o line-clamp dele,
                  então texto longo TRANSBORDA e passa por cima do botão ao lado — foi
                  isso que colocou "Aplicar" em cima de "Cancelada". */}
              <Select value={novoStatus} onValueChange={setNovoStatus} disabled={!proximos.length}>
                <SelectTrigger className="min-w-0 flex-1 overflow-hidden [&>span]:truncate">
                  <SelectValue placeholder={proximos.length ? 'Escolha o próximo status' : 'Sem transições possíveis'} />
                </SelectTrigger>
                <SelectContent>
                  {proximos.map((p) => (
                    <SelectItem key={p} value={p}>{STATUS_META[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={mudarStatus} disabled={!novoStatus} style={{ flexShrink: 0 }}>Aplicar</Button>
            </div>
            {proximos.length > 0 && (
              <div style={{ fontSize: 12, color: C.text3, marginTop: 6 }}>
                A partir de <strong style={{ color: C.text2 }}>{STATUS_META[t.status]?.label}</strong>, os destinos
                permitidos são: {proximos.map((x) => STATUS_META[x].label).join(' · ')}.
              </div>
            )}
          </div>

          <Separator />

          {t.classe === 'bug' && t.status === 'aguardando_aprovacao' && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: C.text2, marginBottom: 8 }}>Decidir diagnóstico</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button size="sm" onClick={() => decidir(true)}>Aprovar · corrigir</Button>
                <Button size="sm" variant="outline" onClick={() => decidir(false)}>Recusar · rejeitar</Button>
                <Input value={obsGate} onChange={(e) => setObsGate(e.target.value)} placeholder="Observação da decisão" style={{ maxWidth: 260 }} />
              </div>
            </div>
          )}

          <Separator />

          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.text2, marginBottom: 8 }}>Gates (dev agent)</div>
            {/* A observação vem ANTES dos botões: ela é do gate que a pessoa está
                prestes a decidir, e no layout anterior (input no fim da linha) ficava
                parecendo campo solto — quem clicava em Aprovar antes de digitar
                registrava a decisão sem motivo nenhum. */}
            <Input
              value={obsGate}
              onChange={(e) => setObsGate(e.target.value)}
              placeholder="Observação (opcional) — fica registrada no histórico do gate"
              style={{ marginBottom: 10 }}
            />
            <div style={{ display: 'grid', gap: 8 }}>
              {['G1', 'G2'].map((g) => (
                <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Badge style={{
                    background: t.gate === g ? C.greenBg : '#73737318',
                    color: t.gate === g ? C.green : C.text3,
                    flexShrink: 0,
                  }}>
                    {g}{t.gate === g ? ' ✓' : ''}
                  </Badge>
                  <span style={{ fontSize: 12, color: C.text3, flex: 1, minWidth: 120 }}>
                    {g === 'G1' ? 'antes de executar' : 'PR aberto · antes de concluir'}
                  </span>
                  <Button size="sm" onClick={() => gate(g, true)} style={{ flexShrink: 0 }}>Aprovar</Button>
                  <Button size="sm" variant="outline" onClick={() => gate(g, false)} style={{ flexShrink: 0 }}>Reprovar</Button>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.text2, marginBottom: 8 }}>Comentários</div>
            <div style={{ display: 'grid', gap: 8, marginBottom: 8, maxHeight: 180, overflowY: 'auto' }}>
              {(t.comentarios || []).length === 0 && <div style={s.empty}>Sem comentários</div>}
              {(t.comentarios || []).map((c) => (
                <div key={c.id} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}>
                  <div style={{ color: C.text3, fontSize: 11, marginBottom: 2 }}>{c.profiles?.nome || 'IA'} · {fmtData(c.created_at)}</div>
                  <div style={{ color: C.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{textoLimpo(c.texto)}</div>
                </div>
              ))}
            </div>
            {/* Textarea em cima, botão embaixo: o `Textarea` do shadcn é w-full e,
                lado a lado num flex sem min-w-0, empurrava o "Comentar" pra fora
                da caixa (era ele passando por cima do campo no print). */}
            <Textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={3}
              placeholder="Escreva um comentário..."
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <Button onClick={enviarComentario} disabled={!comentario.trim()}>Comentar</Button>
            </div>
          </div>

          <Separator />

          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.text2, marginBottom: 8 }}>Histórico</div>
            <div style={{ display: 'grid', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
              {(t.eventos || []).length === 0 && (
                <div style={{ fontSize: 12, color: C.text3 }}>Sem eventos registrados.</div>
              )}
              {(t.eventos || []).map((ev, i) => (
                <div key={ev.id || i} style={{ fontSize: 12, color: C.text2, display: 'flex', gap: 8, minWidth: 0 }}>
                  <span style={{ color: C.text3, flexShrink: 0 }}>{fmtData(ev.created_at)}</span>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    {ev.evento}{ev.detalhe?.observacao ? ` — ${textoLimpo(ev.detalhe.observacao)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabEquipe() {
  const [tarefas, setTarefas] = useState([]);
  const [membros, setMembros] = useState([]);
  const [novaOpen, setNovaOpen] = useState(false);
  const [detalheId, setDetalheId] = useState(null);
  const [acaoId, setAcaoId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [dropErro, setDropErro] = useState(null);

  const load = useCallback(async () => {
    try {
      const [ts, mm] = await Promise.all([agents.agentTasks.tarefas(), agents.agentTasks.team()]);
      setTarefas(ts || []);
      setMembros(mm || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onDropTarefa(tarefaId, destino) {
    setDragId(null); setOverCol(null);
    const t = tarefas.find((x) => x.id === tarefaId);
    if (!t || t.status === destino) return;
    const permitidas = TRANSICOES[t.status] || [];
    if (!permitidas.includes(destino)) {
      setDropErro({ tarefa: t, destino });
      return;
    }
    try { await agents.agentTasks.transicao(t.id, destino); load(); }
    catch (e) { alert(e.message); }
  }

  function abrirTarefa(t) {
    if (STATUS_ACAO_HUMANA.includes(t.status)) setAcaoId(t.id);
    else setDetalheId(t.id);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.text3 }}>
          Arraste os cards entre as colunas para mudar o status · tarefas em <strong>aguardando aprovação</strong> e <strong>aguardando revisão</strong> abrem com as ações humanas.
        </div>
        <Button onClick={() => setNovaOpen(true)}>＋ Nova tarefa</Button>
      </div>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
        {COLUMNS.map((col) => {
          const lista = tarefas.filter((t) => t.status === col);
          const meta = STATUS_META[col];
          return (
            <div
              key={col}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col); }}
              onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || dragId; if (id) onDropTarefa(id, col); }}
              style={{ ...s.card, width: 250, minWidth: 250, flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: '72vh', outline: overCol === col ? '2px solid var(--cbrio-primary)' : 'none', transition: 'outline-color .15s' }}
            >
              <div style={{ ...s.cardHeader, padding: '12px 14px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{meta.label}</span>
                  <Badge style={{ background: meta.bg, color: meta.c }}>{lista.length}</Badge>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'grid', gap: 8, alignContent: 'flex-start' }}>
                {lista.length === 0 && <div style={{ ...s.empty, padding: 20 }}>Vazio</div>}
                {lista.map((t) => {
                  const precisaAcao = STATUS_ACAO_HUMANA.includes(t.status);
                  return (
                    <div
                      key={t.id}
                      draggable
                      onClick={() => abrirTarefa(t)}
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); setDragId(t.id); }}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      title={precisaAcao ? 'Clique para agir' : 'Clique para detalhes · arraste para outra coluna'}
                      style={{
                        padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`,
                        background: C.bg, cursor: 'grab', transition: 'box-shadow .15s, opacity .15s',
                        opacity: dragId === t.id ? 0.45 : 1,
                        boxShadow: precisaAcao ? `0 0 0 1px ${C.amber}66` : 'none',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.35, marginBottom: 6, overflowWrap: 'anywhere' }}>{textoLimpo(t.titulo)}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Badge style={{ background: PRIOR_META[t.prioridade].bg, color: PRIOR_META[t.prioridade].c }}>
                          {PRIOR_META[t.prioridade].label}
                        </Badge>
                        {t.agent_team && (
                          <span style={{ fontSize: 11, color: C.text3 }}>{t.agent_team.nome}</span>
                        )}
                        {t.gate && (
                          <Badge style={{ background: C.amberBg, color: C.amber }}>{t.gate}</Badge>
                        )}
                        {precisaAcao && (
                          <Badge style={{ background: C.redBg, color: C.red }}>ação</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {novaOpen && <NovaTarefaDialog open onClose={() => setNovaOpen(false)} membros={membros} onCreated={() => { load(); setNovaOpen(false); }} />}
      {detalheId && <DetalheTarefa id={detalheId} onClose={() => setDetalheId(null)} onChange={load} />}
      {acaoId && (
        <AcaoHumanaDialog
          id={acaoId}
          onClose={() => setAcaoId(null)}
          onChange={load}
          onDetalhe={(id2) => { setAcaoId(null); setDetalheId(id2); }}
        />
      )}
      {dropErro && (
        <Dialog open onOpenChange={() => setDropErro(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Transição inválida</DialogTitle>
              <DialogDescription>
                {textoLimpo(dropErro.tarefa.titulo)}: <strong>{STATUS_META[dropErro.tarefa.status].label}</strong> → <strong>{STATUS_META[dropErro.destino].label}</strong> não é permitida. Escolha um dos destinos válidos:
              </DialogDescription>
            </DialogHeader>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(TRANSICOES[dropErro.tarefa.status] || []).map((p) => (
                <Button
                  key={p}
                  variant="outline"
                  onClick={async () => {
                    try { await agents.agentTasks.transicao(dropErro.tarefa.id, p); setDropErro(null); load(); }
                    catch (e) { alert(e.message); }
                  }}
                >
                  {STATUS_META[p].label}
                </Button>
              ))}
              {(TRANSICOES[dropErro.tarefa.status] || []).length === 0 && <div style={s.empty}>Sem transições a partir deste status.</div>}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDropErro(null)}>Cancelar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Membros · roster + job description ──────────────────────────────────────

function JobDescriptionEditor({ membro, onChange }) {
  const [historico, setHistorico] = useState([]);
  const [raw, setRaw] = useState('');
  const [draft, setDraft] = useState(null);
  const [estruturando, setEstruturando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [verVersao, setVerVersao] = useState(null);

  useEffect(() => {
    setRaw(membro.instrucao_ativa?.raw_instrucoes || '');
    setDraft(null);
    setVerVersao(null);
    agents.agentTasks.instrucoes(membro.agent_key).then((h) => setHistorico(h || [])).catch(() => {});
  }, [membro.agent_key]);

  async function estruturar() {
    if (raw.trim().length < 10) { alert('Escreva as instruções primeiro (mínimo 10 caracteres).'); return; }
    setEstruturando(true);
    try { setDraft((await agents.agentTasks.estruturar(membro.agent_key, raw)).estruturado); }
    catch (e) { alert(e.message); }
    setEstruturando(false);
  }

  function setDraftList(key, idx, val) {
    setDraft((d) => ({ ...d, [key]: (d[key] || []).map((x, i) => (i === idx ? val : x)) }));
  }

  async function salvar() {
    setSalvando(true);
    try {
      await agents.agentTasks.salvarInstrucoes(membro.agent_key, { raw, estruturado: draft || {} });
      setDraft(null);
      const h = await agents.agentTasks.instrucoes(membro.agent_key);
      setHistorico(h || []);
      onChange?.();
    } catch (e) { alert(e.message); }
    setSalvando(false);
  }

  const campo = (label, val, setVal) => (
    <div>
      <Label>{label}</Label>
      {label === 'Descrição' ? <Textarea rows={3} value={val} onChange={(e) => setVal(e.target.value)} /> : <Input value={val} onChange={(e) => setVal(e.target.value)} />}
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.text2, marginBottom: 6 }}>Instruções em texto livre (como se explica a um funcionário)</div>
        <Textarea rows={6} value={raw} onChange={(e) => setRaw(e.target.value)}
          placeholder={`Ex.: O ${membro.nome} audita o módulo de forma semanal. Ele deve...`} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Button onClick={estruturar} disabled={estruturando}>{estruturando ? 'Estruturando...' : '✨ Estruturar com IA'}</Button>
          {draft && <Button variant="outline" onClick={() => setDraft(null)}>Limpar rascunho</Button>}
        </div>
      </div>

      {draft && (
        <div style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 12, border: `1px solid ${C.primary}55`, background: C.primaryBg }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.primary }}>Rascunho estruturado (edite antes de salvar)</div>
          {campo('Título do cargo', draft.titulo_cargo, (v) => setDraft((d) => ({ ...d, titulo_cargo: v })))}
          {campo('Descrição', draft.descricao, (v) => setDraft((d) => ({ ...d, descricao: v })))}
          {['responsabilidades', 'permitido', 'proibido'].map((key) => (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Label>{key === 'responsabilidades' ? 'Responsabilidades' : key === 'permitido' ? 'Pode fazer' : 'Não pode fazer'}</Label>
                <Button size="sm" variant="ghost" onClick={() => setDraft((d) => ({ ...d, [key]: [...(d[key] || []), ''] }))}>＋</Button>
              </div>
              {(draft[key] || []).map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <Input value={item} onChange={(e) => setDraftList(key, idx, e.target.value)} />
                  <Button size="sm" variant="ghost" onClick={() => setDraft((d) => ({ ...d, [key]: (d[key] || []).filter((_, i) => i !== idx) }))}>✕</Button>
                </div>
              ))}
            </div>
          ))}
          <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar nova versão'}</Button>
        </div>
      )}

      <Separator />

      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.text2, marginBottom: 8 }}>Histórico de versões ({historico.length})</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {historico.map((h) => (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text }}>
              <Badge variant={h.ativo ? 'default' : 'outline'}>v{h.versao}</Badge>
              {h.ativo && <Badge style={{ background: C.greenBg, color: C.green }}>ativa</Badge>}
              <span style={{ color: C.text3, flex: 1 }}>{fmtData(h.created_at)}</span>
              <Button size="sm" variant="ghost" onClick={() => setVerVersao(h.estruturado)}>ver</Button>
            </div>
          ))}
          {historico.length === 0 && <div style={s.empty}>Sem versões</div>}
        </div>
      </div>

      {verVersao && (
        <Dialog open onOpenChange={() => setVerVersao(null)}>
          <DialogContent className="max-w-lg" style={{ maxHeight: '80vh' }}>
            <DialogHeader>
              <DialogTitle>{verVersao.titulo_cargo || 'Job description'}</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto" style={{ display: 'grid', gap: 8, fontSize: 14 }}>
              <div>{verVersao.descricao}</div>
              {['responsabilidades', 'permitido', 'proibido'].map((key) => (
                <div key={key}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: C.text2, marginBottom: 4 }}>
                    {key === 'responsabilidades' ? 'Responsabilidades' : key === 'permitido' ? 'Pode fazer' : 'Não pode fazer'}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {(verVersao[key] || []).map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function TabMembros() {
  const [membros, setMembros] = useState([]);
  const [selKey, setSelKey] = useState(null);

  const load = useCallback(async () => {
    try {
      const mm = await agents.agentTasks.team();
      setMembros(mm || []);
      setSelKey((k) => k || (mm?.[0]?.agent_key || null));
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleAtivo = async (m) => {
    try {
      const atualizado = await agents.agentTasks.updateMembro(m.agent_key, { ativo: !m.ativo });
      setMembros((arr) => arr.map((x) => (x.agent_key === m.agent_key ? atualizado : x)));
    } catch (e) { console.error(e); }
  };

  const sel = membros.find((m) => m.agent_key === selKey);

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ ...s.card, width: 360, minWidth: 300, flexShrink: 0 }}>
        <div style={s.cardHeader}>
          <div style={s.cardTitle}>Time de agentes ({membros.length})</div>
        </div>
        <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {membros.map((m) => (
            <div key={m.agent_key} onClick={() => setSelKey(m.agent_key)} style={{
              padding: '10px 14px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
              background: m.agent_key === selKey ? C.primaryBg : 'transparent',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.nome}</div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch checked={!!m.ativo} onCheckedChange={() => toggleAtivo(m)} title={m.ativo ? 'Desativar (dispatcher ignora as tarefas)' : 'Ativar'} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.text3, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <code style={{ fontSize: 11 }}>{m.agent_key}</code>
                <Badge style={{ background: CLASSE_LABEL[m.classe] === 'Cyber' ? C.purpleBg : C.blueBg, color: CLASSE_LABEL[m.classe] === 'Cyber' ? C.purple : C.blue }}>{CLASSE_LABEL[m.classe]}</Badge>
                <span>{m.ativo ? 'ativo' : 'inativo'} · {m.modelo}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...s.card, flex: 1, minWidth: 420 }}>
        <div style={s.cardHeader}>
          <div style={s.cardTitle}>{sel?.nome || 'Selecione um membro'}</div>
          {sel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: C.text3 }}>
              orçamento/tarefa: ${sel.orcamento_tarefa_usd ?? '—'} · estimado/mês: ${sel.custo_estimado_mes_usd ?? 0}
            </div>
          )}
        </div>
        <div style={{ padding: 20 }}>
          {sel ? <JobDescriptionEditor membro={sel} onChange={load} /> : <div style={s.empty}>Selecione um membro do time ao lado</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function AssistenteIA() {
  const [tab, setTab] = useState('equipe');

  // Mesma queryKey da FilaAprovacao — o react-query dedupe a requisição, então o
  // contador da aba não custa uma leitura a mais.
  const { data: pendentes = [] } = useQuery({
    queryKey: ['agent-queue', 'pending'],
    queryFn: () => agents.queue('pending'),
    refetchInterval: 30000,
  });

  const tabStyle = (ativo) => ({
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
    background: ativo ? C.primary : 'transparent', color: ativo ? '#fff' : C.text2,
  });

  return (
    <div style={s.page}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>Agentes &amp; Auditoria</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>
          Hub do time de agentes · acesso restrito aos super-admins. O assistente do dia a dia é o <strong>Pedrinho</strong>, no botão flutuante (canto inferior direito).
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button style={tabStyle(tab === 'equipe')} onClick={() => setTab('equipe')}>Equipe</button>
        <button style={tabStyle(tab === 'entrada')} onClick={() => setTab('entrada')}>
          Caixa de Entrada
          {pendentes.length > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 999,
              background: tab === 'entrada' ? 'rgba(255,255,255,0.25)' : C.amberBg,
              color: tab === 'entrada' ? '#fff' : C.amber,
            }}>
              {pendentes.length}
            </span>
          )}
        </button>
        <button style={tabStyle(tab === 'membros')} onClick={() => setTab('membros')}>Membros</button>
      </div>

      {tab === 'equipe' && <TabEquipe />}
      {tab === 'entrada' && <FilaAprovacao />}
      {tab === 'membros' && <TabMembros />}
    </div>
  );
}
