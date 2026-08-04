import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { membresia } from '../../api';
import PainelCenso from '../../components/membresia/PainelCenso';
import { useAuth } from '../../contexts/AuthContext';
import { hrefConversa } from '../../lib/conversas';
import { toast } from 'sonner';
import {
  Inbox, Check, X, Search, User, Mail, Phone,
  MapPin, Calendar, Copy, ExternalLink, Trash2, CheckCircle2,
  CreditCard, RefreshCw, MessageSquare, Sparkles, AlertTriangle,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';

const C = {
  card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)',
  green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418',
  amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const STATUS_META = {
  pendente:  { label: 'Pendente',  cor: C.amber, bg: C.amberBg, icon: Inbox },
  aprovado:  { label: 'Aprovado',  cor: C.green, bg: C.greenBg, icon: CheckCircle2 },
  rejeitado: { label: 'Rejeitado', cor: C.red,   bg: C.redBg,   icon: X },
  duplicado: { label: 'Duplicado', cor: C.blue,  bg: C.blueBg,  icon: Copy },
  // Censo: o reconciliador preencheu os campos vazios do cadastro existente e
  // não sobrou conflito — a linha fica como prova do que a pessoa enviou (e do
  // consentimento), mas NÃO é trabalho pendente de ninguém.
  aplicado:  { label: 'Aplicado',  cor: C.primary, bg: C.primaryBg, icon: Sparkles },
};

const ORIGEM_LABEL = {
  site: 'Site', qr_code: 'QR Code', evento: 'Evento', importacao: 'Importação',
};

function fmtCpf(v) {
  const d = (v || '').toString().replace(/\D+/g, '');
  if (d.length !== 11) return v || '';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function fmtData(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

function Badge({ status }) {
  const s = STATUS_META[status] || STATUS_META.pendente;
  const Icon = s.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      color: s.cor, background: s.bg,
    }}>
      <Icon style={{ width: 11, height: 11 }} />
      {s.label}
    </span>
  );
}

export default function TabCadastros({ onMembrosChange }) {
  const { isDiretor } = useAuth();
  const [podeAprovar, setPodeAprovar] = useState(false);
  useEffect(() => { membresia.cadastros.podeAprovar().then((r) => setPodeAprovar(!!r?.pode)).catch(() => {}); }, []);

  const [cadastros, setCadastros] = useState([]);
  const [kpis, setKpis] = useState({ pendente: 0, aprovado: 0, rejeitado: 0, duplicado: 0, aplicado: 0 });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pendente');
  const [busca, setBusca] = useState('');
  const [error, setError] = useState('');

  const [selecionado, setSelecionado] = useState(null);
  const [acao, setAcao] = useState(null); // 'aprovar' | 'rejeitar'
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [observacoesAprov, setObservacoesAprov] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  // Família — sugestão automática na aprovação
  const [familiasDisponiveis, setFamiliasDisponiveis] = useState([]);
  const [familiaEscolhida, setFamiliaEscolhida] = useState(''); // id ou '__nova__'
  const [familiaNovaNome, setFamiliaNovaNome] = useState('');
  const [parentesco, setParentesco] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterStatus ? { status: filterStatus } : undefined;
      const [lista, k] = await Promise.all([
        membresia.cadastros.list(params),
        membresia.cadastros.kpis(),
      ]);
      setCadastros(lista || []);
      setKpis(k || {});
    } catch (e) {
      setError(e.message || 'Erro ao carregar cadastros');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  // ── Aprovação em massa ───────────────────────────────────────────────────
  // ⚠️ A seleção é limpa a cada recarga/troca de filtro: manter id selecionado
  // que saiu da lista faria o lote agir sobre gente que a pessoa não está vendo.
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [aprovandoLote, setAprovandoLote] = useState(false);
  const [resultadoLote, setResultadoLote] = useState(null);
  const [progressoLote, setProgressoLote] = useState(null); // {feitos, total}
  useEffect(() => { setSelecionados(new Set()); }, [filterStatus, busca]);

  // ⚠️ LOTE VAI EM PEDAÇOS DE 8, e isso não é otimização — é correção de bug.
  // Em 04/08 um lote de 49 rodou até o fim NO SERVIDOR (49 aprovados no banco)
  // e o cliente abortou em 30s: a tela disse "Tempo esgotado, nada aconteceu"
  // para um trabalho que tinha dado certo, e a lista ficou mostrando os 50
  // pendentes que já não existiam. Cada aprovação passa pelo matcher canônico e
  // escreve em várias tabelas (~1-2s), então o lote inteiro nunca cabe numa
  // requisição confortável. Em pedaços: cada chamada volta rápido, o progresso
  // aparece, e uma falha no meio não apaga o que já foi gravado.
  const TAMANHO_PEDACO = 8;

  const alternarSelecao = (id) => {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  async function handleAprovarLote() {
    const ids = [...selecionados];
    if (!ids.length) return;
    setAprovandoLote(true);
    setError('');
    setProgressoLote({ feitos: 0, total: ids.length });

    // Acumula o resultado dos pedaços num só, pra tela mostrar uma resposta.
    const acc = { ok: true, aprovados: 0, ignorados: [], falhas: [] };
    let interrompido = null;

    try {
      for (let i = 0; i < ids.length; i += TAMANHO_PEDACO) {
        const pedaco = ids.slice(i, i + TAMANHO_PEDACO);
        try {
          const r = await membresia.cadastros.aprovarLote(pedaco);
          acc.aprovados += r.aprovados || 0;
          if (r.ignorados?.length) acc.ignorados.push(...r.ignorados);
          if (r.falhas?.length) acc.falhas.push(...r.falhas);
        } catch (e) {
          // ⚠️ Para no primeiro pedaço que falha, mas PRESERVA o que já foi
          // aprovado: o servidor já gravou, e sumir com esse número faria a
          // pessoa reaprovar por cima (e achar que nada aconteceu, que foi
          // exatamente o susto de 04/08).
          interrompido = e.message || 'Erro ao aprovar em lote';
          break;
        }
        setProgressoLote({ feitos: Math.min(i + TAMANHO_PEDACO, ids.length), total: ids.length });
      }

      setResultadoLote({ ...acc, interrompido, total_selecionado: ids.length });
      setSelecionados(new Set());
      if (acc.aprovados > 0) {
        toast.success(`${acc.aprovados} cadastro(s) aprovados`);
        onMembrosChange?.();
      } else if (!interrompido) {
        toast.warning('Nenhum cadastro foi aprovado — veja os motivos.');
      }
      if (interrompido) setError(`${interrompido} (${acc.aprovados} já foram aprovados antes da falha.)`);
      load();
    } finally {
      setAprovandoLote(false);
      setProgressoLote(null);
    }
  }

  // Quando abre o dialog de aprovação, busca famílias e detecta sobrenome
  useEffect(() => {
    if (acao !== 'aprovar' || !selecionado) return;
    setFamiliaEscolhida('');
    setFamiliaNovaNome('');
    setParentesco('');

    (async () => {
      try {
        const todasFamilias = await membresia.familias.list();
        setFamiliasDisponiveis(todasFamilias || []);

        // Se o cadastro já tem familia_sugerida_id (do form público), pré-selecionar
        if (selecionado.familia_sugerida_id) {
          setFamiliaEscolhida(selecionado.familia_sugerida_id);
          return;
        }

        // Auto-detecta sobrenome e sugere família
        const partes = (selecionado.nome || '').trim().split(/\s+/);
        if (partes.length >= 2) {
          const sobrenome = partes[partes.length - 1].toLowerCase();
          const match = (todasFamilias || []).find(
            (f) => f.nome.toLowerCase() === sobrenome,
          );
          if (match) setFamiliaEscolhida(match.id);
        }
      } catch (e) {
        console.error('Erro ao carregar famílias:', e);
      }
    })();
  }, [acao, selecionado]);

  const filtrados = cadastros.filter((c) => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (
      (c.nome || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.telefone || '').toLowerCase().includes(q)
    );
  });

  // Só cadastro PENDENTE entra em lote: aprovado/rejeitado/aplicado não têm o
  // que aprovar, e 'duplicado' é conferência humana por definição.
  const selecionaveis = filtrados.filter((c) => c.status === 'pendente');
  const prontos = selecionaveis.filter((c) => c.prontidao?.pronto);
  const todosProntosMarcados = prontos.length > 0
    && prontos.every((c) => selecionados.has(c.id));
  // A coluna de checkbox só existe quando há pendente selecionável — o colSpan
  // das linhas de "carregando"/"vazio" tem que acompanhar, senão a tabela
  // desalinha justamente no estado vazio.
  const mostrarSelecao = podeAprovar && selecionaveis.length > 0;
  const colunas = mostrarSelecao ? 7 : 6;

  async function handleAprovar() {
    if (!selecionado) return;
    const nome = selecionado.nome;
    const ehAtualizacao = !!selecionado.duplicado_de;
    setSalvando(true);
    try {
      // Resolve família: criar nova se necessário
      let familia_id = (familiaEscolhida && familiaEscolhida !== '__nenhuma__') ? familiaEscolhida : null;
      if (familia_id === '__nova__' && familiaNovaNome.trim()) {
        const nova = await membresia.familias.create({ nome: familiaNovaNome.trim() });
        familia_id = nova.id;
      } else if (familia_id === '__nova__') {
        familia_id = null;
      }

      await membresia.cadastros.aprovar(selecionado.id, {
        observacoes: observacoesAprov || undefined,
        familia_id: familia_id || undefined,
        parentesco: (familia_id && parentesco) ? parentesco : undefined,
      });
      setAcao(null);
      setObservacoesAprov('');
      // mantém o modal aberto no estado "aprovado" → aparece o botão de confirmar no WhatsApp
      setSelecionado((s) => (s ? { ...s, status: 'aprovado' } : s));
      toast.success(
        ehAtualizacao
          ? `Cadastro de ${nome} atualizado com sucesso!`
          : `${nome} aprovado(a)! Confirme pelo WhatsApp abaixo.`,
      );
      await load();
      onMembrosChange?.();
    } catch (e) {
      toast.error(e.message || 'Erro ao aprovar cadastro');
    } finally {
      setSalvando(false);
      setAcao(null);
    }
  }

  async function handleConfirmarWhatsapp() {
    if (!selecionado || confirmando) return;
    setConfirmando(true);
    try {
      await membresia.cadastros.confirmarWhatsapp(selecionado.id);
      toast.success('Confirmação enviada pelo WhatsApp ✅');
    } catch (e) {
      toast.error(e.message || 'Erro ao enviar confirmação');
    } finally { setConfirmando(false); }
  }

  async function handleRejeitar() {
    if (!selecionado) return;
    const nome = selecionado.nome;
    setSalvando(true);
    try {
      await membresia.cadastros.rejeitar(selecionado.id, motivoRejeicao);
      setAcao(null);
      setSelecionado(null);
      setMotivoRejeicao('');
      toast.success(`Cadastro de ${nome} rejeitado.`);
      await load();
    } catch (e) {
      toast.error(e.message || 'Erro ao rejeitar cadastro');
    } finally {
      setSalvando(false);
      setAcao(null);
      setSelecionado(null);
    }
  }

  async function handleDelete(cad) {
    if (!confirm(`Remover definitivamente o cadastro de ${cad.nome}?`)) return;
    try {
      await membresia.cadastros.remove(cad.id);
      if (selecionado?.id === cad.id) setSelecionado(null);
      await load();
    } catch (e) {
      toast.error(e.message || 'Erro ao remover cadastro');
    }
  }

  return (
    <div>
      <PainelCenso />

      {error && (
        <div style={{
          background: C.redBg, border: `1px solid ${C.red}30`, color: C.red,
          borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {error}
          <X style={{ width: 16, height: 16, cursor: 'pointer' }} onClick={() => setError('')} />
        </div>
      )}

      {/* KPIs por status */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {Object.entries(STATUS_META).map(([key, meta]) => {
          const Icon = meta.icon;
          const active = filterStatus === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilterStatus(active ? '' : key)}
              style={{
                position: 'relative', overflow: 'hidden',
                textAlign: 'left',
                background: 'var(--panel)',
                WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)',
                border: `1px solid ${active ? meta.cor : 'var(--hairline)'}`,
                borderRadius: 16,
                padding: '16px 18px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: active ? `var(--shadow), 0 0 0 3px ${meta.bg}` : 'var(--shadow), var(--hi)',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${meta.cor}22, transparent 58%)`, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: meta.cor, opacity: 0.9 }} />
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: C.text3, fontWeight: 500 }}>{meta.label}</span>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: meta.bg, color: meta.cor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon style={{ width: 16, height: 16 }} />
                </div>
              </div>
              <div style={{ position: 'relative', fontSize: 26, fontWeight: 700, color: C.text, marginTop: 6 }}>
                {kpis[key] ?? 0}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: C.text3, zIndex: 1 }} />
          <Input
            placeholder="Buscar por nome, e-mail ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <Select value={filterStatus || '__all__'} onValueChange={(v) => setFilterStatus(v === '__all__' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Todos os status" /></SelectTrigger>
            <SelectContent className="z-[1001]">
              <SelectItem value="__all__">Todos os status</SelectItem>
              {Object.entries(STATUS_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Barra de aprovação em massa · só aparece com pendente na tela */}
      {mostrarSelecao && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '12px 16px', marginBottom: 14, borderRadius: 12,
          border: `1px solid ${selecionados.size ? C.primary : C.border}`,
          background: selecionados.size ? C.primaryBg : 'var(--cbrio-card)',
        }}>
          <Button
            variant="outline" size="sm"
            onClick={() => setSelecionados(todosProntosMarcados
              ? new Set()
              : new Set(prontos.map((c) => c.id)))}
            disabled={!prontos.length}
          >
            <CheckCircle2 style={{ width: 13, height: 13, marginRight: 6 }} />
            {todosProntosMarcados
              ? 'Desmarcar todos'
              : `Selecionar os ${prontos.length} completos`}
          </Button>

          <span style={{ fontSize: 12, color: C.text2 }}>
            {selecionados.size
              ? `${selecionados.size} selecionado(s)`
              : `${prontos.length} de ${selecionaveis.length} pendentes com todos os dados obrigatórios`}
          </span>

          {selecionaveis.length > prontos.length && (
            <span style={{ fontSize: 11.5, color: C.amber, display: 'inline-flex', gap: 5, alignItems: 'center' }}>
              <AlertTriangle style={{ width: 12, height: 12 }} />
              {selecionaveis.length - prontos.length} precisam de aprovação manual
            </span>
          )}

          <div style={{ flex: 1 }} />

          <Button
            size="sm"
            disabled={!selecionados.size || aprovandoLote}
            onClick={handleAprovarLote}
          >
            <Check style={{ width: 13, height: 13, marginRight: 6 }} />
            {aprovandoLote
              ? (progressoLote
                // Progresso REAL, não spinner sem número: o lote leva ~1-2s por
                // pessoa e sem contagem parece travado (foi o susto de 04/08).
                ? `Aprovando ${progressoLote.feitos} de ${progressoLote.total}…`
                : 'Aprovando…')
              : `Aprovar ${selecionados.size || ''} selecionado(s)`}
          </Button>
        </div>
      )}

      {/* Tabela */}
      <div style={{ background: 'var(--cbrio-card)', borderRadius: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              {mostrarSelecao && (
                <th style={{
                  width: 42, padding: '14px 0 14px 18px',
                  background: 'var(--cbrio-table-header)', borderBottom: `1px solid ${C.border}`,
                }}>
                  <input
                    type="checkbox"
                    checked={todosProntosMarcados}
                    disabled={!prontos.length}
                    onChange={() => setSelecionados(todosProntosMarcados
                      ? new Set()
                      : new Set(prontos.map((c) => c.id)))}
                    title="Selecionar os cadastros com todos os dados obrigatórios"
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: C.primary }}
                  />
                </th>
              )}
              {['Nome', 'Contato', 'Status', 'Origem', 'Recebido em', ''].map((h, i) => (
                <th key={i} style={{
                  textAlign: 'left', padding: '14px 18px', fontSize: 11,
                  fontWeight: 600, color: C.text3, textTransform: 'uppercase',
                  letterSpacing: 0.5, background: 'var(--cbrio-table-header)',
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colunas}><div className="flex items-center justify-center py-6 gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
                <span className="text-xs text-muted-foreground">Carregando...</span>
              </div></td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={colunas}><div className="flex flex-col items-center py-10 gap-2">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1">
                  <Inbox className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">Nenhum cadastro encontrado</span>
                <span className="text-xs text-muted-foreground">Formulários enviados aparecem aqui</span>
              </div></td></tr>
            ) : filtrados.map((c) => (
              <tr key={c.id} className="cbrio-row" onClick={() => setSelecionado(c)}>
                {mostrarSelecao && (
                  <td
                    style={{ padding: '14px 0 14px 18px', borderBottom: `1px solid ${C.border}` }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {c.status === 'pendente' && (
                      <input
                        type="checkbox"
                        checked={selecionados.has(c.id)}
                        onChange={() => alternarSelecao(c.id)}
                        title={c.prontidao?.pronto
                          ? 'Pronto para aprovação automática'
                          : `Vai ficar para aprovação manual: falta ${(c.prontidao?.rotulos || []).join(', ')}`}
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: C.primary }}
                      />
                    )}
                  </td>
                )}
                <td style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: C.primaryBg, color: C.primary,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 13, flexShrink: 0,
                    }}>
                      {c.nome?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{c.nome}</div>
                      {c.duplicado_de && (
                        <div style={{ fontSize: 11, color: C.blue, marginTop: 2 }}>
                          ↻ possível duplicado de {c.duplicado_de.nome}
                        </div>
                      )}
                      {/* Por que este cadastro não entra na aprovação em massa */}
                      {c.status === 'pendente' && c.prontidao && !c.prontidao.pronto && (
                        <div style={{ fontSize: 11, color: C.amber, marginTop: 2 }}>
                          Falta: {c.prontidao.rotulos.join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5 }}>
                    {c.email && <div>{c.email}</div>}
                    {c.telefone && <div style={{ color: C.text3 }}>{c.telefone}</div>}
                    {!c.email && !c.telefone && <span style={{ color: C.text3 }}>—</span>}
                  </div>
                </td>
                <td style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                  <Badge status={c.status} />
                </td>
                <td style={{ padding: '14px 18px', fontSize: 13, color: C.text2, borderBottom: `1px solid ${C.border}` }}>
                  {ORIGEM_LABEL[c.origem] || c.origem}
                </td>
                <td style={{ padding: '14px 18px', fontSize: 12, color: C.text3, borderBottom: `1px solid ${C.border}` }}>
                  {fmtData(c.created_at)}
                </td>
                <td style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, textAlign: 'right' }}>
                  <ExternalLink style={{ width: 14, height: 14, color: C.text3, display: 'inline-block' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de detalhe */}
      {selecionado && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)',
            zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setSelecionado(null)}
        >
          <div
            style={{
              background: 'var(--panel)',
              WebkitBackdropFilter: 'blur(18px) saturate(140%)', backdropFilter: 'blur(18px) saturate(140%)',
              borderRadius: 16,
              width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto',
              border: '1px solid var(--hairline)',
              boxShadow: 'var(--shadow-hover), var(--hi)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '28px 32px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: C.primaryBg, color: C.primary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 20,
                }}>
                  {selecionado.nome?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>{selecionado.nome}</h2>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <Badge status={selecionado.status} />
                    <span style={{ fontSize: 11, color: C.text3, padding: '3px 10px', background: 'var(--cbrio-input-bg)', borderRadius: 20 }}>
                      {ORIGEM_LABEL[selecionado.origem] || selecionado.origem}
                    </span>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelecionado(null)}>
                <X style={{ width: 20, height: 20 }} />
              </Button>
            </div>

            <div style={{ padding: '20px 32px 28px' }}>
              {selecionado.duplicado_de && (
                <div style={{
                  padding: '12px 14px', marginBottom: 16,
                  background: C.blueBg, border: `1px solid ${C.blue}40`,
                  borderRadius: 10, fontSize: 13, color: C.blue,
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <RefreshCw style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>Atualização cadastral</strong> — CPF / contato já pertence ao membro{' '}
                    <strong>{selecionado.duplicado_de.nome}</strong>. Ao aprovar, os dados abaixo
                    serão aplicados ao cadastro existente (não cria membro novo).
                  </div>
                </div>
              )}

              {/* CENSO · o que o reconciliador NÃO pôde aplicar sozinho.
                  Mostra os dois lados de cada campo pra decisão ser um olhar,
                  não uma investigação: o que já está no cadastro × o que a
                  pessoa informou agora. Campo vazio no cadastro já foi
                  preenchido automaticamente e não aparece aqui. */}
              {Array.isArray(selecionado.censo_conflitos) && selecionado.censo_conflitos.length > 0 && (
                <div style={{
                  padding: '12px 14px', marginBottom: 16,
                  background: C.amberBg, border: `1px solid ${C.amber}40`, borderRadius: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <AlertTriangle style={{ width: 15, height: 15, color: C.amber, flexShrink: 0 }} />
                    <strong style={{ fontSize: 13, color: C.amber }}>
                      Censo · {selecionado.censo_conflitos.length} campo(s) divergente(s)
                    </strong>
                  </div>
                  <p style={{ fontSize: 11.5, color: C.text3, margin: '0 0 10px', lineHeight: 1.5 }}>
                    O cadastro já tinha outro valor nestes campos, então nada foi
                    sobrescrito. Confira qual está certo antes de aplicar.
                  </p>
                  {selecionado.censo_conflitos.map((cf) => (
                    <div key={cf.campo} style={{
                      display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline',
                      padding: '6px 0', borderTop: `1px solid ${C.amber}22`, fontSize: 12.5,
                    }}>
                      <span style={{ minWidth: 110, color: C.text3, textTransform: 'capitalize' }}>
                        {String(cf.campo).replace(/_/g, ' ')}
                      </span>
                      <span style={{ color: C.text3 }}>
                        no cadastro: <strong style={{ color: C.text2 }}>{cf.atual || '—'}</strong>
                      </span>
                      <span style={{ color: C.text3 }}>
                        informado: <strong style={{ color: C.text }}>{cf.informado || '—'}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <DataGrid
                items={[
                  { icon: CreditCard, label: 'CPF', value: selecionado.cpf ? fmtCpf(selecionado.cpf) : null },
                  { icon: Mail, label: 'E-mail', value: selecionado.email },
                  { icon: Phone, label: 'Telefone', value: selecionado.telefone },
                  { icon: Calendar, label: 'Nascimento', value: selecionado.data_nascimento ? new Date(selecionado.data_nascimento + 'T00:00:00').toLocaleDateString('pt-BR') : null },
                  { icon: User, label: 'Estado civil', value: selecionado.estado_civil },
                  { icon: User, label: 'Profissão', value: selecionado.profissao },
                  {
                    icon: MapPin,
                    label: 'Endereço',
                    value: [selecionado.endereco, selecionado.bairro, selecionado.cidade, selecionado.cep].filter(Boolean).join(', '),
                  },
                ]}
              />

              {selecionado.como_conheceu && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 11, color: C.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                    Como conheceu
                  </div>
                  <div style={{
                    fontSize: 13, color: C.text2, lineHeight: 1.6,
                    padding: 12, background: 'var(--cbrio-input-bg)',
                    border: `1px solid ${C.border}`, borderRadius: 10,
                  }}>
                    {selecionado.como_conheceu}
                  </div>
                </div>
              )}

              <div style={{
                marginTop: 18, padding: 12,
                background: 'var(--cbrio-input-bg)',
                border: `1px solid ${C.border}`, borderRadius: 10,
                fontSize: 12, color: C.text3, lineHeight: 1.6,
              }}>
                <div><strong style={{ color: C.text2 }}>Consentimento LGPD:</strong>{' '}
                  {selecionado.aceita_termos ? '✓ Aceitou termos' : '✗ Não aceitou termos'}
                  {' · '}
                  {selecionado.aceita_contato ? '✓ Aceitou contato' : '✗ Recusou contato'}
                </div>
                <div style={{ marginTop: 4 }}><strong style={{ color: C.text2 }}>Recebido em:</strong> {fmtData(selecionado.created_at)}</div>
                {selecionado.ip_origem && (
                  <div style={{ marginTop: 4 }}><strong style={{ color: C.text2 }}>IP:</strong> {selecionado.ip_origem}</div>
                )}
                {selecionado.motivo_rejeicao && (
                  <div style={{ marginTop: 4 }}><strong style={{ color: C.red }}>Motivo da rejeição:</strong> {selecionado.motivo_rejeicao}</div>
                )}
                {selecionado.aprovado_em && (
                  <div style={{ marginTop: 4 }}>
                    <strong style={{ color: C.text2 }}>Decidido em:</strong> {fmtData(selecionado.aprovado_em)}
                  </div>
                )}
              </div>

              {/* Aprovado: envia a confirmação pela API (template) · fallback abre a conversa */}
              {selecionado.status === 'aprovado' && (selecionado.telefone || '').replace(/\D/g, '') && (
                <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Button onClick={handleConfirmarWhatsapp} disabled={confirmando} style={{ background: C.green, color: '#fff', width: '100%' }}>
                    <MessageSquare style={{ width: 16, height: 16 }} /> {confirmando ? 'Enviando…' : 'Enviar confirmação no WhatsApp'}
                  </Button>
                  <Link to={hrefConversa(selecionado.telefone, `Olá, ${(selecionado.nome || '').trim().split(/\s+/)[0]}! 🎉 Seu cadastro na CBRio foi confirmado. Que alegria ter você com a gente! Qualquer coisa, é só chamar por aqui. 🙏`)} style={{ textAlign: 'center', fontSize: 12, color: C.text3 }}>
                    ou abrir a conversa manualmente
                  </Link>
                </div>
              )}

              {/* Ações — só se ainda estiver pendente/duplicado */}
              {podeAprovar && ['pendente', 'duplicado'].includes(selecionado.status) && (
                <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
                  <Button
                    onClick={() => { setAcao('aprovar'); setObservacoesAprov(''); }}
                    style={{ background: selecionado.duplicado_de ? C.blue : C.green, color: '#fff', flex: 1, minWidth: 160 }}
                  >
                    {selecionado.duplicado_de ? (
                      <><RefreshCw style={{ width: 16, height: 16 }} /> Atualizar cadastro existente</>
                    ) : (
                      <><Check style={{ width: 16, height: 16 }} /> Aprovar e criar membro</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setAcao('rejeitar'); setMotivoRejeicao(''); }}
                    style={{ flex: 1, minWidth: 140, color: C.red, borderColor: `${C.red}60` }}
                  >
                    <X style={{ width: 16, height: 16 }} /> Rejeitar
                  </Button>
                </div>
              )}

              {isDiretor && (
                <div style={{ marginTop: 14, textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => handleDelete(selecionado)}
                    style={{
                      background: 'transparent', border: 'none',
                      color: C.text3, fontSize: 12, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <Trash2 style={{ width: 12, height: 12 }} /> Remover definitivamente
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dialog de confirmação — Aprovar */}
      {/* Resultado da aprovação em massa · quem ficou de fora e por quê */}
      <Dialog open={!!resultadoLote} onOpenChange={(v) => !v && setResultadoLote(null)}>
        <DialogContent className="max-w-lg flex flex-col max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Resultado da aprovação em massa</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0" style={{ fontSize: 13, lineHeight: 1.7 }}>
            <p style={{ color: C.green, fontWeight: 600 }}>
              {resultadoLote?.aprovados || 0} cadastro(s) aprovados.
            </p>

            {resultadoLote?.interrompido && (
              <p style={{ color: C.red, fontSize: 12.5 }}>
                O lote parou no meio: {resultadoLote.interrompido} Os aprovados acima
                <strong> já estão gravados</strong> — selecione o que sobrou e rode de novo.
              </p>
            )}

            {/* Quando o matcher reconhece a mesma pessoa em 2+ cadastros, o número
                de pessoas é menor que o de cadastros. Dizer isso evita a leitura
                errada de que "faltou aprovar alguém". */}
            {!!resultadoLote?.aprovados && (
              <p style={{ color: C.text3, fontSize: 11.5 }}>
                Cadastros da mesma pessoa são consolidados num cadastro só, então o
                número de pessoas pode ser menor que o de aprovações.
              </p>
            )}

            {!!resultadoLote?.ignorados?.length && (
              <div style={{ marginTop: 12 }}>
                <p style={{ color: C.amber, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <AlertTriangle style={{ width: 14, height: 14 }} />
                  {resultadoLote.ignorados.length} ficaram para aprovação manual
                </p>
                <p style={{ color: C.text3, fontSize: 11.5, marginBottom: 6 }}>
                  Abra cada um, complete o que falta e aprove na tela.
                </p>
                {resultadoLote.ignorados.map((i) => (
                  <div key={i.id} style={{ padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ color: C.text, fontWeight: 500 }}>{i.nome || i.id}</div>
                    <div style={{ color: C.amber, fontSize: 11.5 }}>Falta: {(i.motivos || []).join(' · ')}</div>
                  </div>
                ))}
              </div>
            )}

            {!!resultadoLote?.falhas?.length && (
              <div style={{ marginTop: 12 }}>
                <p style={{ color: C.red, fontWeight: 600 }}>
                  {resultadoLote.falhas.length} falharam ao gravar
                </p>
                {resultadoLote.falhas.map((f) => (
                  <div key={f.id} style={{ padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ color: C.text, fontWeight: 500 }}>{f.nome || f.id}</div>
                    <div style={{ color: C.red, fontSize: 11.5 }}>{f.erro}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResultadoLote(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={acao === 'aprovar'} onOpenChange={(v) => !v && setAcao(null)}>
        <DialogContent className="max-w-md z-[1100]">
          <DialogHeader>
            <DialogTitle>
              {selecionado?.duplicado_de ? 'Atualizar cadastro existente' : 'Aprovar cadastro'}
            </DialogTitle>
          </DialogHeader>
          <div style={{ padding: '4px 0 12px' }}>
            <p style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, marginBottom: 14 }}>
              {selecionado?.duplicado_de ? (
                <>Os dados enviados serão aplicados ao membro <strong>{selecionado.duplicado_de.nome}</strong>.
                Campos vazios no formulário não sobrescrevem os dados atuais.</>
              ) : (
                <>Isso criará um novo <strong>membro ativo</strong> a partir dos dados enviados.
                Você poderá ajustar família, grupo e trilha depois na tela do membro.</>
              )}
            </p>
            {/* Família */}
            <div style={{ marginBottom: 14 }}>
              <Label>Família</Label>
              {familiaEscolhida && familiaEscolhida !== '__nova__' && (() => {
                const fam = familiasDisponiveis.find(f => f.id === familiaEscolhida);
                return fam ? (
                  <div style={{
                    background: C.primaryBg, border: `1px solid ${C.primary}40`,
                    borderRadius: 8, padding: '8px 12px', marginTop: 6, marginBottom: 8,
                    fontSize: 13, color: C.primary, fontWeight: 500,
                  }}>
                    Sugestao: familia <strong>{fam.nome}</strong>
                    {fam.membros?.length > 0 && (
                      <span style={{ color: C.text2, fontWeight: 400 }}>
                        {' '}({fam.membros.map(m => m.nome).join(', ')})
                      </span>
                    )}
                  </div>
                ) : null;
              })()}
              <Select value={familiaEscolhida || '__nenhuma__'} onValueChange={setFamiliaEscolhida}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sem família" />
                </SelectTrigger>
                <SelectContent className="z-[1200]">
                  <SelectItem value="__nenhuma__">Sem família</SelectItem>
                  {familiasDisponiveis.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}{f.membros?.length ? ` (${f.membros.length} membro${f.membros.length > 1 ? 's' : ''})` : ''}
                    </SelectItem>
                  ))}
                  <SelectItem value="__nova__">+ Criar nova família</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {familiaEscolhida === '__nova__' && (
              <div style={{ marginBottom: 14 }}>
                <Label htmlFor="nova-familia">Nome da nova família</Label>
                <Input
                  id="nova-familia"
                  value={familiaNovaNome}
                  onChange={(e) => setFamiliaNovaNome(e.target.value)}
                  placeholder="Ex.: Salviano"
                  className="mt-1"
                />
              </div>
            )}

            {familiaEscolhida && familiaEscolhida !== '__nenhuma__' && (
              <div style={{ marginBottom: 14 }}>
                <Label>Parentesco</Label>
                <Select value={parentesco || '__nenhum__'} onValueChange={(v) => setParentesco(v === '__nenhum__' ? '' : v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="z-[1200]">
                    <SelectItem value="__nenhum__">Não informado</SelectItem>
                    <SelectItem value="responsavel">Responsável</SelectItem>
                    <SelectItem value="conjuge">Conjuge</SelectItem>
                    <SelectItem value="filho">Filho(a)</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Label htmlFor="obs-aprov">Observações (opcional)</Label>
            <Textarea
              id="obs-aprov"
              rows={2}
              value={observacoesAprov}
              onChange={(e) => setObservacoesAprov(e.target.value)}
              placeholder="Ex.: conheceu pela campanha X, agendar cafe..."
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcao(null)} disabled={salvando}>Cancelar</Button>
            <Button
              onClick={handleAprovar}
              disabled={salvando}
              style={{ background: selecionado?.duplicado_de ? C.blue : C.green, color: '#fff' }}
            >
              {salvando
                ? (selecionado?.duplicado_de ? 'Atualizando...' : 'Aprovando...')
                : (selecionado?.duplicado_de ? 'Confirmar atualização' : 'Confirmar aprovação')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação — Rejeitar */}
      <Dialog open={acao === 'rejeitar'} onOpenChange={(v) => !v && setAcao(null)}>
        <DialogContent className="max-w-md z-[1100]">
          <DialogHeader>
            <DialogTitle>Rejeitar cadastro</DialogTitle>
          </DialogHeader>
          <div style={{ padding: '4px 0 12px' }}>
            <p style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, marginBottom: 14 }}>
              O cadastro será marcado como rejeitado. Esse registro fica arquivado
              para auditoria.
            </p>
            <Label htmlFor="motivo-rej">Motivo (opcional)</Label>
            <Textarea
              id="motivo-rej"
              rows={3}
              value={motivoRejeicao}
              onChange={(e) => setMotivoRejeicao(e.target.value)}
              placeholder="Ex.: dados incompletos, spam, duplicata confirmada..."
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcao(null)} disabled={salvando}>Cancelar</Button>
            <Button onClick={handleRejeitar} disabled={salvando} variant="destructive">
              {salvando ? 'Rejeitando...' : 'Confirmar rejeição'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DataGrid({ items }) {
  const visible = items.filter((it) => it.value);
  if (visible.length === 0) {
    return <p style={{ fontSize: 13, color: C.text3 }}>Nenhum dado adicional informado.</p>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      {visible.map((it, i) => {
        const Icon = it.icon;
        return (
          <div key={i} style={{
            padding: 12, background: 'var(--cbrio-input-bg)',
            border: `1px solid ${C.border}`, borderRadius: 10,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <Icon style={{ width: 16, height: 16, color: C.text3, flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{it.label}</div>
              <div style={{ fontSize: 13, color: C.text, marginTop: 2, wordBreak: 'break-word' }}>{it.value}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
