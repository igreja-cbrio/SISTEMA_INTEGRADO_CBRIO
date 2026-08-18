// Módulo de Inscrições · tela dedicada do evento da ESPINHA (F3.2) — mesma UX
// da tela do Eventos Externos (inscritos, sorteio com roleta, edição de
// inscrição) + o que a espinha tem a mais: status/Publicar, cancelar/reativar
// inscrição e exportar CSV (gated por pode_exportar da matriz).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { inscricoesApi as api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, CalendarDays, Clock, MapPin, Users, Gift, Link2, MessageCircle,
  QrCode, Pencil, Trash2, Loader2, Search, ExternalLink, Ticket, Megaphone,
  ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown, Download, Repeat,
  Printer, CreditCard, ScanLine, Paperclip,
} from 'lucide-react';
import QrLinkDialog from '../components/QrLinkDialog';
import { EventoModal } from './Inscricoes';
import { idadeEmAnos, faixaLabel, sexoLabel } from '../lib/faixaEtaria';
// Máscara/validação de CPF do canônico do Contrato de Inscrição — não recriar.
import { mascaraCpf, cpfValido, soDigitos } from '../lib/inscricao';
import { imprimirListaInscritos, type Agrupamento } from '../lib/imprimirListaInscritos';
// Filtro pelos campos extras do form-builder (ex.: "Em qual ministério você
// serve?" do Celebra). ⚠️ As opções são o catálogo do evento ∪ o que está
// respondido — o porquê está no cabeçalho da lib.
import {
  camposFiltraveis, aplicarFiltroCampos, contarFiltrosAtivos, SEM_RESPOSTA, TODOS,
} from '../lib/filtroCampoInscricao';

const METODO_LABEL: Record<string, string> = {
  pix: 'Pix', cartao: 'Cartão', boleto: 'Boleto', apple_pay: 'Apple Pay',
  dinheiro: 'Dinheiro', transferencia: 'Transferência',
};
const PAG_BADGE: Record<string, string> = {
  pago: 'bg-emerald-500/15 text-emerald-600',
  pago_parcial: 'bg-amber-500/15 text-amber-600',
  aguardando: 'bg-amber-500/15 text-amber-600',
  aguardando_pagamento: 'bg-amber-500/15 text-amber-600',
  pendente: 'bg-foreground/10 text-muted-foreground',
  expirado: 'bg-red-500/10 text-red-600',
  estornado: 'bg-red-500/10 text-red-600',
  chargeback: 'bg-red-500/10 text-red-600',
};
const PAG_LABEL: Record<string, string> = {
  pago: 'pago', pago_parcial: 'parcial', aguardando: 'aguardando',
  aguardando_pagamento: 'aguardando', pendente: 'pendente', criada: 'pendente',
  expirado: 'expirado', expirada: 'expirado', falhou: 'falhou',
  estornado: 'estornado', estornado_parcial: 'estornado', chargeback: 'contestado',
};

const STATUS_BADGE: Record<string, string> = {
  rascunho: 'bg-amber-500/15 text-amber-600',
  publicado: 'bg-emerald-500/15 text-emerald-600',
  encerrado: 'bg-foreground/10 text-muted-foreground',
  arquivado: 'bg-foreground/10 text-muted-foreground',
};

/** Um número do placar. `dica` vira tooltip — o rótulo curto não cabe a régua. */
function PlacarTile({ label, valor, cor, dica }: { label: string; valor: any; cor?: string; dica?: string }) {
  return (
    <Card className="glass-solid p-3" title={dica}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${cor || ''}`}>{valor}</div>
    </Card>
  );
}

export default function InscricaoEventoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { modulePerms, profile, canAccessModule } = useAuth();
  const podeExportar = ['admin', 'diretor'].includes(profile?.role)
    || !!modulePerms?.inscricoes?.pode_exportar;
  // Nível 2 da matriz = operar check-in (SPEC-08) — mesma régua da rota
  const podeCheckin = canAccessModule(['inscricoes'], 'leitura', 2);
  // Nível 3 = editar/conceder (mesma régua do backend pra bolsa e correções).
  const podeEditar = canAccessModule(['inscricoes'], 'leitura', 3);
  // Benefício por CPF carrega CPF na tela → nível 2 pra VER (mesma régua da aba
  // Pessoas da view unificada); conceder/remover exige 3 (`podeEditar`).
  const podeVerBeneficios = canAccessModule(['inscricoes'], 'leitura', 2);
  const [ev, setEv] = useState<any>(null);
  const [areas, setAreas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorteando, setSorteando] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [busca, setBusca] = useState('');
  // { [key do campo]: valor cru escolhido } · vazio = não filtra por ele
  const [filtrosCampo, setFiltrosCampo] = useState<Record<string, string>>({});
  const [inscSel, setInscSel] = useState<any>(null);
  // Cards recolhidos (só a linha principal) — melhora a visualização com
  // muitas inscrições. Set com os ids recolhidos + botão recolher/expandir todos.
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  // Inscrições marcadas pra excluir em lote (pedido do Matheus · 17/08: as de
  // teste inflam o placar e apagar uma a uma não é caminho com 241 inscritos).
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [excluindoLote, setExcluindoLote] = useState(false);
  const toggleRecolhido = (rid: string) => setRecolhidos(prev => {
    const s = new Set(prev);
    if (s.has(rid)) s.delete(rid); else s.add(rid);
    return s;
  });
  const [anim, setAnim] = useState<{ fase: 'rolando' | 'fim'; premio: string; ganhador?: any } | null>(null);
  const [rolNum, setRolNum] = useState(0);
  const [imprimirOpen, setImprimirOpen] = useState(false);
  // Placar do evento — vem de COUNTs no banco (não de contar a lista em JS), e
  // é ele que responde "quanto já entrou de dinheiro".
  const [resumo, setResumo] = useState<any>(null);

  // Devolve a lista recarregada: quem confirma um pagamento dentro da ficha
  // precisa que a MESMA ficha reflita o novo estado (senão a badge continuaria
  // "aguardando" logo depois de confirmar, e isso se lê como bug).
  function carregar(): Promise<any[] | null> {
    if (!id) return Promise.resolve(null);
    const p = Promise.all([api.evento(id), api.inscricoesDoEvento(id)])
      .then(([evento, inscritos]: any[]) => {
        const lista = Array.isArray(inscritos) ? inscritos : [];
        setEv({ ...evento, inscritos: lista });
        return lista;
      })
      .catch(() => { toast.error('Erro ao carregar o evento'); return null; })
      .finally(() => setLoading(false));
    // Best-effort e em paralelo: o placar não pode atrasar nem derrubar a tela.
    api.eventoResumo(id).then((r: any) => setResumo(r?.contadores || null)).catch(() => setResumo(null));
    return p;
  }
  useEffect(() => { setLoading(true); carregar(); }, [id]);
  useEffect(() => { api.areas().then((a: any) => setAreas(Array.isArray(a) ? a : [])).catch(() => {}); }, []);

  const link = ev ? `${window.location.origin}/evento/${ev.slug}` : '';
  function copiar() {
    navigator.clipboard.writeText(link);
    if (ev?.status === 'publicado') toast.success('Link copiado — formulário no ar');
    else toast.warning('Link copiado, mas o evento não está publicado — clique em Publicar pra ativar');
  }
  const waTexto = ev?.msg_whatsapp
    ? String(ev.msg_whatsapp).replaceAll('{link}', link)
    : `Confirme sua presença no ${ev?.nome || 'evento'}: ${link}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(waTexto)}`;

  const ativos = useMemo(
    () => (ev?.inscritos || []).filter((i: any) => i.status !== 'cancelada'),
    [ev],
  );
  // Filtros pelos campos extras do evento. As contagens de cada opção são do
  // evento INTEIRO (não do recorte atual) de propósito: número que muda a cada
  // letra digitada na busca não serve pra decidir por qual opção filtrar.
  const camposFiltro = useMemo(
    () => camposFiltraveis(ev?.campos || [], ev?.inscritos || []),
    [ev],
  );
  const filtrosAtivos = contarFiltrosAtivos(filtrosCampo);

  const inscritos = useMemo(() => {
    const porCampo = aplicarFiltroCampos(ev?.inscritos || [], filtrosCampo);
    const q = busca.trim().toLowerCase();
    if (!q) return porCampo;
    return porCampo.filter((i: any) =>
      String(i.nome_completo || '').toLowerCase().includes(q)
      || String(i.telefone || '').includes(q.replace(/\D/g, '') || ' ')
      || String(i.numero_sorte || '') === q,
    );
  }, [ev, busca, filtrosCampo]);

  const premiosGanhos = (inscricaoId: string) =>
    (ev?.sorteios || []).filter((s: any) => s.inscricao_id === inscricaoId);

  function confeteBig() {
    const cores = ['#00B39D', '#00d9bd', '#ffd166', '#ef476f', '#118ab2', '#ffffff'];
    const raja = (x: number) => confetti({ particleCount: 80, spread: 80, startVelocity: 55, origin: { x, y: 0.55 }, colors: cores });
    raja(0.5); setTimeout(() => raja(0.2), 200); setTimeout(() => raja(0.8), 400);
    setTimeout(() => confetti({ particleCount: 140, spread: 120, startVelocity: 45, origin: { y: 0.5 }, colors: cores }), 250);
  }

  const sorteioDoPremio = (nome: string) => (ev?.sorteios || []).find((s: any) => (s.premio || '') === nome);

  async function sortearPremio(nome: string) {
    if (anim || !id) return;
    setSorteando(true);
    setAnim({ fase: 'rolando', premio: nome });
    const iv = setInterval(() => setRolNum(1000 + Math.floor(Math.random() * 9000)), 65);
    try {
      const s: any = await api.sortear(id, nome);
      await new Promise(r => setTimeout(r, 2400));
      clearInterval(iv);
      setRolNum(s.numero_sorteado);
      setAnim({ fase: 'fim', premio: nome, ganhador: { numero: s.numero_sorteado, nome: s.ganhador_nome } });
      confeteBig();
      carregar();
    } catch (e: any) {
      clearInterval(iv); setAnim(null);
      toast.error(e?.message || 'Erro ao sortear');
    } finally { setSorteando(false); }
  }
  async function sortearTodos() {
    if (!id) return;
    setSorteando(true);
    try {
      const pendentes = (ev?.premios || []).filter((p: string) => !sorteioDoPremio(p));
      for (const p of pendentes) { await api.sortear(id, p); }
      carregar();
      toast.success(`${pendentes.length} prêmio(s) sorteado(s)`);
    } catch (e: any) { toast.error(e?.message || 'Erro ao sortear'); } finally { setSorteando(false); }
  }
  async function publicar() {
    if (!id) return;
    try {
      await api.atualizarEvento(id, { status: 'publicado' });
      toast.success('Evento publicado — o link já está no ar');
      carregar();
    } catch (e: any) { toast.error(e?.message || 'Erro ao publicar'); }
  }
  async function excluir() {
    if (!id || !window.confirm('Excluir este evento? (some da lista · reversível por super-admin)')) return;
    try { await api.excluirEvento(id); toast.success('Evento excluído'); navigate('/inscricoes'); }
    catch (e: any) { toast.error(e?.message || 'Sem permissão pra excluir'); }
  }
  async function excluirInscrito(i: any) {
    if (!id || !window.confirm(`Excluir a inscrição de ${i.nome_completo}? Ela não entra mais nos sorteios.`)) return;
    try {
      await api.excluirInscricao(id, i.id);
      toast.success('Inscrição excluída');
      setEv((prev: any) => (prev ? { ...prev, inscritos: (prev.inscritos || []).filter((x: any) => x.id !== i.id) } : prev));
      setSelecionadas(prev => { const s = new Set(prev); s.delete(i.id); return s; });
      // ⚠️ O motivo técnico do servidor vai junto: "Erro ao excluir" sozinho foi
      // o que escondeu por meses que a tabela não estava na whitelist do
      // soft-delete (o log tinha a resposta, a tela não).
    } catch (e: any) { toast.error([e?.message, e?.detalhe].filter(Boolean).join(' · ') || 'Erro ao excluir a inscrição'); }
  }

  function alternarSelecao(inscricaoId: string) {
    setSelecionadas(prev => {
      const s = new Set(prev);
      if (s.has(inscricaoId)) s.delete(inscricaoId); else s.add(inscricaoId);
      return s;
    });
  }

  // "Selecionar todos" marca o RECORTE VISÍVEL (filtro + busca), não a base
  // inteira — o botão fica embaixo dos filtros, e marcar 241 pessoas quando a
  // tela mostra 3 é o caminho mais curto pra um estrago em massa.
  function selecionarVisiveis() {
    setSelecionadas(prev => {
      const s = new Set(prev);
      inscritos.forEach((i: any) => s.add(i.id));
      return s;
    });
  }

  async function excluirSelecionadas() {
    if (!id || !selecionadas.size || excluindoLote) return;
    const ids = [...selecionadas];
    const nomes = (ev?.inscritos || [])
      .filter((i: any) => selecionadas.has(i.id))
      .map((i: any) => i.nome_completo)
      .slice(0, 8);
    // ⚠️ Confirmação COM OS NOMES (até 8): exclusão em massa é o clique em que
    // "12 selecionadas" não diz quem vai sumir — mesma régua da renovação de
    // grupos e da "confira a lista".
    const lista = nomes.join('\n· ');
    const resto = ids.length > nomes.length ? `\n… e mais ${ids.length - nomes.length}` : '';
    const ok = window.confirm(
      `Excluir ${ids.length === 1 ? 'esta inscrição' : `estas ${ids.length} inscrições`}?\n\n· ${lista}${resto}\n\n`
      + 'Elas somem da lista, do placar e dos sorteios (reversível por super-admin).',
    );
    if (!ok) return;
    setExcluindoLote(true);
    try {
      const r: any = await api.excluirInscricoesLote(id, ids);
      const excluidas = new Set<string>(r?.excluidas || []);
      // Some da tela SÓ o que o servidor confirmou ter excluído — quem foi
      // barrado por pagamento continua na lista, que é o estado real.
      setEv((prev: any) => (prev
        ? { ...prev, inscritos: (prev.inscritos || []).filter((x: any) => !excluidas.has(x.id)) }
        : prev));
      setSelecionadas(new Set());
      if (r?.com_pagamento?.length || r?.falhas?.length) {
        // Falha traz o motivo do banco junto — "3 falharam" sozinho manda a
        // pessoa tentar de novo pra sempre.
        const motivo = (r?.falhas_motivo || []).join(' · ');
        toast.warning([r?.resumo || 'Exclusão parcial', motivo].filter(Boolean).join(' — '));
      }
      else toast.success(r?.resumo || 'Inscrições excluídas');
      if (r?.contadores) setEv((prev: any) => (prev ? { ...prev, contadores: r.contadores } : prev));
    } catch (e: any) {
      toast.error([e?.message, e?.detalhe].filter(Boolean).join(' · ') || 'Erro ao excluir as inscrições');
    } finally {
      setExcluindoLote(false);
    }
  }

  // CSV com os campos padrão + uma coluna por campo extra do form-builder
  function exportarCsv() {
    if (!ev) return;
    const campos = (ev.campos || []) as any[];
    const esc = (v: any) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const header = [
      // Primeira coluna: é por ele que a pessoa se identifica no atendimento.
      'Código', 'Nome completo', 'WhatsApp', 'E-mail', 'Nascimento', 'Idade', 'Faixa', 'Sexo',
      'Pagamento', 'Forma', 'Nº da sorte', 'Status', 'Inscrição em',
      ...campos.map((c: any) => c.label),
    ];
    // ⚠️ Exporta o RECORTE VISÍVEL (filtro + busca), não a base inteira: o botão
    // fica ao lado dos filtros e "exportar" logo depois de filtrar significa
    // "leva isto". Quando há recorte, o nome do arquivo diz que é um recorte —
    // planilha parcial com nome de completa é a que engana meses depois.
    const linhas = inscritos.map((i: any) => [
      i.codigo || '', i.nome_completo, i.telefone || '', i.email || '',
      i.data_nascimento ? new Date(`${i.data_nascimento}T00:00:00`).toLocaleDateString('pt-BR') : '',
      idadeEmAnos(i.data_nascimento) ?? '',
      i.data_nascimento ? faixaLabel(i.data_nascimento, true) : '',
      i.sexo ? sexoLabel(i.sexo) : '',
      i.pagamento?.status_pagamento ? (PAG_LABEL[i.pagamento.status_pagamento] || i.pagamento.status_pagamento) : '',
      i.pagamento?.metodo ? (METODO_LABEL[i.pagamento.metodo] || i.pagamento.metodo) : '',
      i.numero_sorte ?? '', i.status,
      i.created_at ? new Date(i.created_at).toLocaleString('pt-BR') : '',
      ...campos.map((c: any) => {
        const v = i.dados?.[c.key];
        return Array.isArray(v) ? v.join(', ') : (v ?? '');
      }),
    ]);
    const csv = '﻿' + [header, ...linhas].map(l => l.map(esc).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    const recorte = (filtrosAtivos > 0 || busca.trim()) ? '-recorte' : '';
    a.href = url; a.download = `inscritos-${ev.slug}${recorte}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!ev) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-3">
      <p className="text-muted-foreground">Evento não encontrado.</p>
      <Button variant="outline" onClick={() => navigate('/inscricoes')}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar pras inscrições</Button>
    </div>
  );

  return (
    <>
    {anim && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
        style={{ background: 'radial-gradient(circle at 50% 40%, rgba(0,60,55,0.92), rgba(4,10,12,0.97))', backdropFilter: 'blur(6px)' }}>
        <div className="absolute inset-0 opacity-30" style={{ background: 'conic-gradient(from 0deg at 50% 45%, transparent, rgba(0,179,157,0.25), transparent 60%)', animation: anim.fase === 'rolando' ? 'spin 8s linear infinite' : undefined }} />
        <div className="relative text-center px-6">
          <div className="uppercase tracking-[0.35em] text-white/60 text-sm mb-4">{anim.premio || 'Sorteio'}</div>
          <div className="font-black tabular-nums leading-none"
            style={{
              fontSize: 'clamp(72px, 18vw, 180px)',
              background: 'linear-gradient(90deg,#00d9bd,#00B39D,#7CF5E4)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              filter: anim.fase === 'fim' ? 'drop-shadow(0 0 30px rgba(0,217,189,0.6))' : 'none',
              transform: anim.fase === 'fim' ? 'scale(1)' : 'scale(0.96)', transition: 'transform .3s ease',
            }}>
            {String(rolNum).padStart(4, '0')}
          </div>
          {anim.fase === 'rolando' ? (
            <div className="mt-6 text-white/80 text-lg tracking-wide animate-pulse">Sorteando…</div>
          ) : (
            <div className="mt-4">
              <div className="text-white text-3xl sm:text-4xl font-bold">{anim.ganhador?.nome}</div>
              <div className="text-teal-300 mt-1">🎉 Ganhador(a) do sorteio</div>
              <button onClick={() => setAnim(null)}
                className="mt-8 rounded-full bg-white/10 hover:bg-white/20 text-white px-8 py-2.5 text-sm font-semibold border border-white/20">
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    )}

    {editOpen && <EventoModal evento={ev} areas={areas} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); carregar(); }} />}
    {qrOpen && (
      <QrLinkDialog
        link={link}
        titulo={ev.nome}
        nomeArquivo={`qr-${ev.slug}`}
        descricao="Imprima ou projete no telão — quem escanear cai direto no formulário de inscrição."
        onClose={() => setQrOpen(false)}
      />
    )}
    {imprimirOpen && (
      <ImprimirListaDialog
        evento={ev}
        // Imprime o recorte visível — filtrar por ministério e imprimir é
        // justamente o caso de uso (a folha de um ministério só).
        inscritos={inscritos}
        recorte={filtrosAtivos > 0 || !!busca.trim()}
        totalEvento={(ev.inscritos || []).length}
        onClose={() => setImprimirOpen(false)}
      />
    )}
    {inscSel && (
      <InscricaoDetalheDialog
        inscricao={inscSel}
        campos={ev.campos || []}
        premios={premiosGanhos(inscSel.id)}
        eventoId={ev.id}
        evento={ev}
        podeEditar={podeEditar}
        onSaved={(atualizada: any) => { setInscSel(atualizada); carregar(); }}
        // Confirmou pagamento pelo comprovante: recarrega e re-seleciona a MESMA
        // pessoa, pra badge de pagamento da ficha aberta refletir na hora.
        onPago={async () => {
          const lista = await carregar();
          const fresca = lista?.find((i: any) => i.id === inscSel.id);
          if (fresca) setInscSel(fresca);
        }}
        onClose={() => setInscSel(null)}
      />
    )}

    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <button onClick={() => navigate('/inscricoes')} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Inscrições
      </button>

      {/* Cabeçalho do evento */}
      <Card className="glass-solid overflow-hidden">
        {ev.capa_url && <img src={ev.capa_url} alt="capa do evento" className="w-full h-36 sm:h-48 object-cover" />}
        <div className="p-4 sm:p-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold break-words">{ev.nome}</h1>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1.5">
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[ev.status] || ''}`}>{ev.status}</span>
                <span className="rounded bg-foreground/8 px-1.5 py-0.5 text-xs">{ev.area}</span>
                {ev.serie && (
                  <span className="inline-flex items-center gap-1 text-xs"><Repeat className="h-3 w-3 text-primary" /> {ev.serie.nome}{ev.edicao_rotulo ? ` · ${ev.edicao_rotulo}` : ''}</span>
                )}
                {ev.data && <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" />{new Date(ev.data + 'T00:00:00').toLocaleDateString('pt-BR')}</span>}
                {ev.hora && <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{ev.hora}</span>}
                {ev.local && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{ev.local}</span>}
                <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" />{ativos.length} confirmados{ev.vagas ? ` · ${ev.vagas} vagas` : ''}</span>
                {ev.inscricoes_encerram_em && Date.now() > new Date(ev.inscricoes_encerram_em).getTime() && (
                  <span className="text-amber-600 font-medium">inscrições encerradas</span>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {ev.status === 'rascunho' && (
                <Button size="sm" onClick={publicar} title="Coloca o formulário no ar agora">
                  <Megaphone className="h-3.5 w-3.5 mr-1" /> Publicar
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-3.5 w-3.5 mr-1" /> Editar</Button>
              <Button size="sm" variant="ghost" onClick={excluir} className="text-red-600 hover:text-red-700"><Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir</Button>
            </div>
          </div>
          {ev.descricao && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ev.descricao}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={copiar}><Link2 className="h-3.5 w-3.5 mr-1" /> Copiar link</Button>
            <a href={wa} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><MessageCircle className="h-3.5 w-3.5 mr-1 text-emerald-500" /> WhatsApp</Button></a>
            <Button size="sm" variant="outline" onClick={() => setQrOpen(true)}><QrCode className="h-3.5 w-3.5 mr-1" /> QR Code</Button>
            {podeCheckin && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/inscricoes/evento/${id}/checkin`)}
                title="Tela de check-in do dia: leitura do QR do comprovante + busca por nome/CPF">
                <ScanLine className="h-3.5 w-3.5 mr-1" /> Check-in
              </Button>
            )}
            <a href={link} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir formulário</Button></a>
          </div>
        </div>
      </Card>

      {/* Placar do evento — contadores + arrecadado */}
      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <PlacarTile label="Inscritos" valor={resumo.ativos} dica="Sem contar as canceladas" />
          <PlacarTile label="Confirmadas" valor={resumo.confirmadas} cor="text-emerald-600"
            dica="Pagamento confirmado ou evento gratuito" />
          {ev.pagamento_ativo && (
            <PlacarTile label="Aguardando pagamento" valor={resumo.aguardando_pagamento} cor="text-amber-600"
              dica="Vaga reservada até o prazo — depois volta pra fila" />
          )}
          {ev.pagamento_ativo && (
            <PlacarTile
              label="Arrecadado"
              valor={resumo.arrecadado_centavos == null
                ? '—'
                : (resumo.arrecadado_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              cor="text-primary"
              dica="Soma das inscrições PAGAS. É acompanhamento do evento — o caixa recebe o repasse do provedor, lançado no Financeiro."
            />
          )}
          {ev.checkin_ativo && (
            <PlacarTile label="Presentes" valor={resumo.presentes} dica="Check-in feito na entrada" />
          )}
          {/* Fila de TRABALHO: sem número visível, comprovante anexado no sábado
              só apareceria quando alguém abrisse a ficha da pessoa por acaso. */}
          {ev.pagamento_ativo && resumo.comprovantes_em_analise > 0 && (
            <PlacarTile label="Comprovantes pra conferir" valor={resumo.comprovantes_em_analise} cor="text-amber-600"
              dica="Pix/transferência anexado pela pessoa · confira e confirme na ficha dela" />
          )}
        </div>
      )}

      {/* Por forma de pagamento — a versão agregada de "como cada um pagou".
          Só conta quem PAGOU; isenta aparece separada porque não pagou nada. */}
      {resumo && ev.pagamento_ativo && (Object.keys(resumo.por_metodo || {}).length > 0 || resumo.isentas > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground px-1">
          <span className="font-medium text-foreground">Como pagaram:</span>
          {Object.entries(resumo.por_metodo || {})
            .sort((a: any, b: any) => b[1] - a[1])
            .map(([m, n]: any) => (
              <span key={m}>
                {m === 'nao_informado' ? 'Forma não informada' : (METODO_LABEL[m] || m)} <b className="text-foreground">{n}</b>
              </span>
            ))}
          {resumo.isentas > 0 && <span>Isentas <b className="text-primary">{resumo.isentas}</b></span>}
        </div>
      )}

      {/* Sorteio */}
      {(ev.tem_sorteio !== false) && (
        <Card className="glass-solid p-4">
          <div className="text-sm font-semibold mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5"><Gift className="h-4 w-4 text-primary" /> Sorteio</span>
            {(ev.premios || []).length > 0 && (ev.premios || []).some((p: string) => !sorteioDoPremio(p)) && (
              <Button size="sm" variant="outline" onClick={sortearTodos} disabled={sorteando || !ativos.length}>
                {sorteando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Sortear todos'}
              </Button>
            )}
          </div>
          {(ev.premios || []).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {(ev.premios || []).map((p: string, i: number) => {
                const s = sorteioDoPremio(p);
                return (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p || `${i + 1}º prêmio`}</div>
                      {s && <div className="text-xs text-primary">🎉 Nº {s.numero_sorteado} · {s.ganhador_nome}</div>}
                    </div>
                    {s ? (
                      <Button size="sm" variant="ghost" onClick={() => sortearPremio(p)} disabled={sorteando} className="text-xs shrink-0">Re-sortear</Button>
                    ) : (
                      <Button size="sm" onClick={() => sortearPremio(p)} disabled={sorteando || !ativos.length} className="shrink-0">
                        {sorteando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sortear'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-1">
              Nenhum prêmio definido. Clique em <b>"Editar"</b> e adicione os prêmios do sorteio pra sortear um ganhador por prêmio.
            </p>
          )}
        </Card>
      )}

      {/* Gratuidade/desconto autorizado por CPF — configuração de ANTES das
          inscrições. Fica em card próprio (não escondido num modal) porque é
          tarefa de preparação do evento, feita uma vez, antes de abrir. */}
      {ev.pagamento_ativo && podeVerBeneficios && (
        <BeneficiosCard eventoId={ev.id} evento={ev} podeEditar={podeEditar} />
      )}

      {/* Inscritos */}
      <Card className="glass-solid p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="text-sm font-semibold flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" /> Inscritos ({ativos.length})</div>
          {(ev.inscritos?.length || 0) > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="h-8" onClick={() => setImprimirOpen(true)}
                title="Imprimir a lista de participantes (por faixa de idade, sexo…)">
                <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir lista
              </Button>
              {podeExportar && (
                <Button size="sm" variant="outline" className="h-8" onClick={exportarCsv} title="Baixar a lista em CSV (Excel)">
                  <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
                </Button>
              )}
              {(() => {
                const todosRecolhidos = (ev.inscritos || []).length > 0 && (ev.inscritos || []).every((i: any) => recolhidos.has(i.id));
                return (
                  <Button size="sm" variant="outline" className="h-8"
                    onClick={() => setRecolhidos(todosRecolhidos ? new Set() : new Set((ev.inscritos || []).map((i: any) => i.id)))}>
                    {todosRecolhidos
                      ? <><ChevronsUpDown className="h-3.5 w-3.5 mr-1" /> Expandir todos</>
                      : <><ChevronsDownUp className="h-3.5 w-3.5 mr-1" /> Recolher todos</>}
                  </Button>
                );
              })()}
              {/* Um filtro por campo de escolha do formulário deste evento. */}
              {camposFiltro.map(c => (
                <select
                  key={c.key}
                  value={filtrosCampo[c.key] ?? TODOS}
                  onChange={e => setFiltrosCampo(prev => ({ ...prev, [c.key]: e.target.value }))}
                  title={c.label}
                  aria-label={c.label}
                  className={`h-8 rounded-md border bg-[var(--cbrio-input-bg)] text-sm px-2 max-w-[15rem] ${
                    (filtrosCampo[c.key] ?? TODOS) !== TODOS ? 'border-primary text-primary' : 'border-border'
                  }`}
                >
                  <option value={TODOS}>{c.label} · todos</option>
                  {c.opcoes.map(o => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo} ({o.total}){o.foraDoCatalogo ? ' · fora da lista' : ''}
                    </option>
                  ))}
                  {c.semResposta > 0 && (
                    <option value={SEM_RESPOSTA}>Sem resposta ({c.semResposta})</option>
                  )}
                </select>
              ))}
              {filtrosAtivos > 0 && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setFiltrosCampo({})}>
                  Limpar {filtrosAtivos === 1 ? 'filtro' : 'filtros'}
                </Button>
              )}
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar por nome, telefone ou nº" value={busca} onChange={e => setBusca(e.target.value)} className="h-8 pl-8 text-sm w-64 max-w-full" />
              </div>
            </div>
          )}
          {/* Quantos o recorte atual mostra — sem isso o filtro muda a lista e
              não diz o tamanho do resultado, que é o número que a pessoa quer. */}
          {(filtrosAtivos > 0 || busca.trim()) && (ev.inscritos || []).length > 0 && (
            <p className="text-xs text-muted-foreground">
              Mostrando <strong className="text-foreground">{inscritos.length}</strong> de {(ev.inscritos || []).length} inscritos.
            </p>
          )}
        </div>
        {/* Barra de seleção — só pra quem pode excluir (nível 3, a mesma régua
            do backend). Fica ACIMA da lista pra a ação existir na tela mesmo
            sem nada marcado: o botão de lixeira por linha é discreto demais e
            não resolvia "excluir várias". */}
        {podeEditar && inscritos.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap text-xs mb-2">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
              onClick={selecionadas.size ? () => setSelecionadas(new Set()) : selecionarVisiveis}>
              {selecionadas.size ? 'Limpar seleção' : `Selecionar ${inscritos.length === (ev.inscritos || []).length ? 'todos' : `os ${inscritos.length} do filtro`}`}
            </Button>
            {selecionadas.size > 0 && (
              <>
                <span className="text-muted-foreground">
                  {selecionadas.size} selecionada{selecionadas.size > 1 ? 's' : ''}
                </span>
                <Button size="sm" variant="ghost" disabled={excluindoLote} onClick={excluirSelecionadas}
                  className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-500/10">
                  {excluindoLote
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Excluindo…</>
                    : <><Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir selecionadas</>}
                </Button>
              </>
            )}
          </div>
        )}
        {(ev.inscritos || []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Ninguém se inscreveu ainda.</p>
        ) : inscritos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {filtrosAtivos > 0 && busca.trim()
              ? 'Nenhum inscrito bate com o filtro e a busca.'
              : filtrosAtivos > 0
                ? 'Nenhum inscrito neste filtro.'
                : 'Nenhum inscrito bate com a busca.'}
          </p>
        ) : (
          <div className="space-y-2">
            {inscritos.map((i: any) => {
              const ganhos = premiosGanhos(i.id);
              const tel = String(i.telefone || '').replace(/\D/g, '');
              const respostas = (ev.campos || []).filter((c: any) => {
                const v = i.dados?.[c.key];
                return Array.isArray(v) ? v.length > 0 : !!v;
              });
              const recolhido = recolhidos.has(i.id);
              const cancelada = i.status === 'cancelada';
              return (
                <div key={i.id} onClick={() => setInscSel(i)}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${cancelada ? 'opacity-60' : ''} ${
                    selecionadas.has(i.id)
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border hover:border-primary/40 hover:bg-primary/5'}`}>
                  {/* Linha principal: nº + nome + contato + quando + recolher */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Seleção pra excluir em lote. ⚠️ `stopPropagation` no
                          clique: sem ele, marcar a caixa abriria a ficha por
                          cima da própria seleção. */}
                      {podeEditar && (
                        <input type="checkbox" checked={selecionadas.has(i.id)}
                          onClick={e => e.stopPropagation()}
                          onChange={() => alternarSelecao(i.id)}
                          title="Selecionar para excluir"
                          className="h-4 w-4 shrink-0 accent-[#00B39D] cursor-pointer" />
                      )}
                      {i.numero_sorte != null && (
                        <span className="inline-flex items-center rounded-full bg-primary/15 text-primary text-xs font-bold px-2 py-0.5 tabular-nums shrink-0">
                          Nº {i.numero_sorte}
                        </span>
                      )}
                      <span className="font-semibold text-sm truncate">{i.nome_completo}</span>
                      {/* Código da inscrição: é o que a pessoa dita no telefone.
                          Some em linha antiga sem código (backend em deploy). */}
                      {i.codigo && (
                        <span className="text-[11px] font-mono text-muted-foreground shrink-0" title="Código da inscrição">
                          {i.codigo}
                        </span>
                      )}
                      {cancelada && <span className="rounded-full bg-red-500/10 text-red-600 text-[11px] font-medium px-2 py-0.5 shrink-0">cancelada</span>}
                      {i.telefone && (
                        <a href={`https://wa.me/55${tel}`} target="_blank" rel="noreferrer"
                          title="Enviar WhatsApp" onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 shrink-0">
                          <MessageCircle className="h-3.5 w-3.5" /> {i.telefone}
                        </a>
                      )}
                      {ganhos.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-600 text-[11px] font-semibold px-2 py-0.5 shrink-0">
                          <Gift className="h-3 w-3" /> {ganhos.length > 1 ? `${ganhos.length} prêmios` : (ganhos[0].premio || 'Prêmio')}
                        </span>
                      )}
                      {/* Idade e sexo: a operação do evento (quarto, ônibus,
                          separação por faixa) precisa disso na linha, não só no
                          detalhe. */}
                      {idadeEmAnos(i.data_nascimento) != null && (
                        <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums"
                          title={faixaLabel(i.data_nascimento)}>
                          {idadeEmAnos(i.data_nascimento)} anos
                        </span>
                      )}
                      {i.sexo && (
                        <span className="text-[11px] text-muted-foreground shrink-0">{sexoLabel(i.sexo)}</span>
                      )}
                      {/* Isenta não fica "aguardando pagamento" — não está
                          aguardando nada. O selo diz o que aconteceu. */}
                      {i.bolsa_tipo === 'integral' && (
                        <span className="inline-flex items-center gap-1 rounded-full text-[11px] font-medium px-2 py-0.5 shrink-0 bg-primary/15 text-primary"
                          title={i.bolsa_motivo || 'Bolsa integral'}>
                          isenta
                        </span>
                      )}
                      {i.bolsa_tipo === 'parcial' && (
                        <span className="inline-flex items-center gap-1 rounded-full text-[11px] font-medium px-2 py-0.5 shrink-0 bg-primary/15 text-primary"
                          title={i.bolsa_motivo || 'Bolsa parcial'}>
                          bolsa
                        </span>
                      )}
                      {i.bolsa_tipo !== 'integral' && i.pagamento?.status_pagamento && (
                        <span className={`inline-flex items-center gap-1 rounded-full text-[11px] font-medium px-2 py-0.5 shrink-0 ${PAG_BADGE[i.pagamento.status_pagamento] || 'bg-foreground/10 text-muted-foreground'}`}
                          title={i.pagamento.metodo ? `Forma: ${METODO_LABEL[i.pagamento.metodo] || i.pagamento.metodo}` : undefined}>
                          <CreditCard className="h-3 w-3" />
                          {PAG_LABEL[i.pagamento.status_pagamento] || i.pagamento.status_pagamento}
                          {i.pagamento.metodo ? ` · ${METODO_LABEL[i.pagamento.metodo] || i.pagamento.metodo}` : ''}
                        </span>
                      )}
                      {/* Comprovante anexado esperando conferência — o clipe é o
                          que faz alguém abrir a ficha e conferir. */}
                      {i.comprovantes?.em_analise > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full text-[11px] font-medium px-2 py-0.5 shrink-0 bg-amber-500/15 text-amber-600"
                          title="Comprovante de Pix/transferência aguardando conferência">
                          <Paperclip className="h-3 w-3" /> comprovante
                        </span>
                      )}
                      {recolhido && respostas.length > 0 && (
                        <span className="text-[11px] text-muted-foreground shrink-0">{respostas.length} resposta{respostas.length > 1 ? 's' : ''}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] text-muted-foreground">
                        {i.created_at ? new Date(i.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                      {respostas.length > 0 && (
                        <button
                          onClick={e => { e.stopPropagation(); toggleRecolhido(i.id); }}
                          title={recolhido ? 'Expandir respostas' : 'Recolher respostas'}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors">
                          {recolhido ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); excluirInscrito(i); }}
                        title="Excluir inscrição"
                        className="p-1 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {/* Respostas do formulário: pergunta em cima, resposta embaixo */}
                  {!recolhido && respostas.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 mt-2.5 pt-2.5 border-t border-border/50">
                      {respostas.map((c: any) => {
                        const v = i.dados?.[c.key];
                        return (
                          <div key={c.key} className="min-w-0">
                            <div className="text-[11px] text-muted-foreground truncate" title={c.label}>{c.label}</div>
                            {c.tipo === 'imagem' && ehImagemUrl(v) ? (
                              <a href={v} target="_blank" rel="noreferrer" title="Abrir imagem" onClick={e => e.stopPropagation()}>
                                <img src={v} alt={c.label} className="mt-0.5 h-10 w-auto max-w-[120px] object-contain rounded border border-border" />
                              </a>
                            ) : c.tipo === 'imagem' && /^https?:\/\//i.test(String(v)) ? (
                              <a href={v} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                className="text-sm text-primary hover:underline break-all line-clamp-2">{v}</a>
                            ) : (
                              <div className="text-sm break-words line-clamp-2" title={Array.isArray(v) ? v.join(', ') : String(v)}>
                                {Array.isArray(v) ? v.join(', ') : v}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* RESPONSÁVEL do menor (17/08) — bloco PRÓPRIO, fora das
                      respostas do formulário, e SEMPRE visível (não recolhe com
                      elas): é o telefone que a equipe liga se um adolescente
                      passar mal no retiro, não uma resposta a mais.
                      ⚠️ CPF fica FORA da lista pela mesma régua do CPF da pessoa
                      (`INSCRITOS_COLS` no backend): identificação sensível se vê
                      no cadastro, não numa lista aberta na portaria. */}
                  {i.responsavel && (
                    <div className="mt-2.5 pt-2.5 border-t border-amber-500/40 rounded-md">
                      <div className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">
                        Menor de idade · responsável
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 mt-1">
                        <div className="min-w-0">
                          <div className="text-[11px] text-muted-foreground">Nome</div>
                          <div className="text-sm break-words">{i.responsavel.nome}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] text-muted-foreground">Parentesco</div>
                          <div className="text-sm">{i.responsavel.parentesco || '—'}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] text-muted-foreground">Celular</div>
                          {i.responsavel.telefone ? (
                            <a href={`tel:+55${i.responsavel.telefone}`} onClick={e => e.stopPropagation()}
                              className="text-sm text-primary hover:underline">{i.responsavel.telefone}</a>
                          ) : <div className="text-sm">—</div>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] text-muted-foreground">E-mail</div>
                          <div className="text-sm break-all line-clamp-1" title={i.responsavel.email || ''}>
                            {i.responsavel.email || '—'}
                          </div>
                        </div>
                      </div>
                      {/* ⚠️ Três estados, e confundi-los é grave: autorizado ·
                          NÃO autorizado · não respondeu. NULL nunca é "pode". */}
                      <div className="text-[11px] mt-1">
                        <span className="text-muted-foreground">Batismo no evento: </span>
                        {i.responsavel.autoriza_batismo === true ? (
                          <span className="text-primary font-semibold">autorizado pelo responsável</span>
                        ) : i.responsavel.autoriza_batismo === false ? (
                          <span className="text-red-600 font-semibold">NÃO autorizado</span>
                        ) : (
                          <span className="text-muted-foreground">não respondido — perguntar antes de incluir</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {(ev.inscritos?.length || 0) > 0 && (
          <p className="text-[11px] text-muted-foreground mt-2">Clique na pessoa pra ver o detalhamento completo da inscrição.</p>
        )}
      </Card>
    </div>
    </>
  );
}

// Escolha do agrupamento + colunas antes de mandar pra impressora.
// ⚠️ A ordem alfabética vem PRIMEIRO e é o padrão. Antes o padrão era "faixa
// de idade", que parte a folha em até 5 blocos (Criança · Adolescente · Jovem ·
// Adulto · Sem data de nascimento) com o total só no rodapé da última página —
// e foi assim que uma lista de 64 pessoas do Kids foi lida como "40 e poucas"
// (37 no bloco Adulto, 17 num bloco separado no fim). Agrupar continua a um
// clique, para quem precisa da folha dividida.
const AGRUPAMENTOS: { key: Agrupamento; label: string; dica: string }[] = [
  { key: 'nenhum', label: 'Ordem alfabética (A–Z)', dica: 'Uma lista só, do A ao Z — todo mundo na mesma tabela' },
  { key: 'faixa', label: 'Faixa de idade', dica: 'Criança · Adolescente · Jovem · Adulto (folha dividida em blocos)' },
  { key: 'sexo', label: 'Sexo', dica: 'Feminino · Masculino (folha dividida em blocos)' },
  { key: 'status', label: 'Status', dica: 'Confirmadas · Aguardando pagamento' },
  { key: 'pagamento', label: 'Pagamento', dica: 'Pago · Aguardando · Sem cobrança' },
];

function ImprimirListaDialog({ evento, inscritos, recorte, totalEvento, onClose }: {
  evento: any; inscritos: any[]; recorte?: boolean; totalEvento?: number; onClose: () => void;
}) {
  const [ag, setAg] = useState<Agrupamento>('nenhum');
  const [contato, setContato] = useState(false);
  const [pagamento, setPagamento] = useState<boolean>(!!evento?.pagamento_ativo);
  const [presenca, setPresenca] = useState(true);
  const [incluirCanceladas, setIncluirCanceladas] = useState(false);

  const naFolha = inscritos.filter((i: any) => incluirCanceladas || i.status !== 'cancelada');
  const total = naFolha.length;
  const semNascimento = naFolha.filter((i: any) => !i.data_nascimento).length;

  // Prévia dos BLOCOS que a folha vai ter. Sem isso, quem agrupa não sabe que a
  // lista sai partida — e conta um bloco achando que é o total.
  const blocos = useMemo(() => {
    if (ag === 'nenhum') return [];
    const contagem = new Map<string, number>();
    for (const i of naFolha) {
      const k = ag === 'faixa'
        ? (i.data_nascimento ? faixaLabel(i.data_nascimento, true) : 'Sem data de nascimento')
        : ag === 'sexo'
          ? (i.sexo ? sexoLabel(i.sexo) : 'Sexo não informado')
          : ag === 'status'
            ? (i.status || 'sem status')
            : (i.pagamento?.status_pagamento
              ? (PAG_LABEL[i.pagamento.status_pagamento] || i.pagamento.status_pagamento)
              : 'Sem cobrança');
      contagem.set(k, (contagem.get(k) || 0) + 1);
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  }, [ag, naFolha]);

  function imprimir() {
    imprimirListaInscritos(
      { nome: evento.nome, data: evento.data, hora: evento.hora, local: evento.local },
      inscritos,
      { agrupamento: ag, colunas: { contato, pagamento, presenca }, incluirCanceladas },
    );
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md flex flex-col max-h-[88vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Printer className="h-4 w-4 text-primary" /> Imprimir lista de participantes</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3 text-sm">
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">Agrupar por</div>
            <div className="space-y-1.5">
              {AGRUPAMENTOS.map(a => (
                <button key={a.key} onClick={() => setAg(a.key)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${ag === a.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                  <div className="font-medium">{a.label}</div>
                  <div className="text-[11px] text-muted-foreground">{a.dica}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">Colunas</div>
            <label className="flex items-start gap-2 py-1 cursor-pointer">
              <input type="checkbox" checked={presenca} onChange={e => setPresenca(e.target.checked)} className="mt-0.5" />
              <span>Quadradinho de presença <span className="text-muted-foreground">(pra marcar no dia)</span></span>
            </label>
            <label className="flex items-start gap-2 py-1 cursor-pointer">
              <input type="checkbox" checked={pagamento} onChange={e => setPagamento(e.target.checked)} className="mt-0.5" />
              <span>Pagamento <span className="text-muted-foreground">(situação e forma)</span></span>
            </label>
            <label className="flex items-start gap-2 py-1 cursor-pointer">
              <input type="checkbox" checked={contato} onChange={e => setContato(e.target.checked)} className="mt-0.5" />
              <span>
                Telefone / e-mail
                {/* Papel impresso circula e fica em cima de mesa. Fora por padrão. */}
                <span className="block text-[11px] text-amber-600">Sai da tela e vira papel — marque só se for necessário.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 py-1 cursor-pointer">
              <input type="checkbox" checked={incluirCanceladas} onChange={e => setIncluirCanceladas(e.target.checked)} className="mt-0.5" />
              <span>Incluir inscrições canceladas <span className="text-muted-foreground">(riscadas)</span></span>
            </label>
          </div>

          <div className="rounded-lg border border-border bg-foreground/[0.03] p-2.5 text-[12px] space-y-1">
            <div><strong>{total}</strong> participante{total === 1 ? '' : 's'} na lista.</div>
            {recorte && (
              <div className="rounded-md border border-[var(--warning,#E0A24E)]/40 bg-[var(--warning,#E0A24E)]/10 px-2 py-1.5 text-[11px]">
                Esta folha é o <strong>recorte que está na tela</strong> (filtro/busca ativos)
                {typeof totalEvento === 'number' ? ` — o evento tem ${totalEvento} inscritos no total` : ''}.
                Limpe o filtro antes de imprimir se quiser a lista completa.
              </div>
            )}
            {semNascimento > 0 && ag === 'faixa' && (
              // Sem nascimento não há faixa — dizer isso antes evita a pessoa
              // achar que a folha veio incompleta.
              <div className="text-amber-600">
                {semNascimento} sem data de nascimento — {semNascimento === 1 ? 'vai' : 'vão'} para um grupo "Sem data de nascimento" no fim.
              </div>
            )}
            {/* ⚠️ A folha agrupada sai PARTIDA em blocos, e o total geral fica
                só no rodapé da última página — quem confere conta um bloco e
                acha que sumiu gente. A prévia mostra a divisão antes de imprimir. */}
            {blocos.length > 1 && (
              <div className="pt-1 border-t border-border/60">
                <div className="text-muted-foreground">
                  A folha sai dividida em <strong className="text-foreground">{blocos.length} blocos</strong>, somando {total}:
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {blocos.map(([nome, n]) => (
                    <span key={nome} className="rounded-full border border-border px-2 py-0.5 text-[11px]">
                      {nome}: <strong>{n}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={imprimir} disabled={!total}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Pop-up com o detalhamento completo de UMA inscrição.
// Editor de resposta de "rede social" ("Rede · @handle" numa string só)
const REDES_SOCIAIS_ADM = ['Instagram', 'Facebook', 'X (Twitter)', 'TikTok', 'YouTube', 'LinkedIn', 'Kwai', 'Outra'];

// Campo tipo "imagem" pode guardar uma URL de imagem (upload) OU um texto/@handle
// (ex.: o campo "Instagram ou logo" — a pessoa às vezes cola o @/link em vez de subir imagem).
const ehImagemUrl = (v: any) =>
  typeof v === 'string' && /^https?:\/\//i.test(v) && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(v);
function RedeSocialEdit({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const i = String(value || '').indexOf(' · ');
  const rede = i >= 0 ? String(value).slice(0, i) : '';
  const handle = i >= 0 ? String(value).slice(i + 3) : String(value || '');
  const emit = (r: string, h: string) => onChange(r && h ? `${r} · ${h}` : (h || r || ''));
  return (
    <div className="flex gap-2">
      <select value={rede} onChange={e => emit(e.target.value, handle)}
        className="h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-2 w-36 shrink-0">
        <option value="">Rede…</option>
        {REDES_SOCIAIS_ADM.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <Input value={handle} placeholder="@usuário ou link" onChange={e => emit(rede, e.target.value)} className="h-9" />
    </div>
  );
}

/**
 * Bolsa, desconto e gratuidade de UMA inscrição.
 *
 * Modal dentro de modal → z-index 1100 (convenção da casa; o Dialog padrão é
 * 1000). O que a tela deixa explícito, porque é dinheiro:
 *  • gratuidade confirma a inscrição na hora (a vaga já é dela);
 *  • desconto emite cobrança NOVA e devolve o link pra equipe enviar;
 *  • quem já pagou não recebe devolução automática — a tela diz isso.
 */
function BolsaDialog({ inscricao, evento, eventoId, onClose, onSaved }: {
  inscricao: any; evento?: any; eventoId: string;
  onClose: () => void; onSaved: (i: any) => void;
}) {
  const [tipo, setTipo] = useState<'integral' | 'parcial'>(inscricao.bolsa_tipo || 'integral');
  const [valor, setValor] = useState(
    inscricao.bolsa_tipo === 'parcial' && inscricao.valor_cobrado_centavos
      ? String(inscricao.valor_cobrado_centavos / 100) : '');
  const [motivo, setMotivo] = useState(inscricao.bolsa_motivo || '');
  const [salvando, setSalvando] = useState(false);
  const tabela = evento?.valor_centavos != null ? evento.valor_centavos / 100 : null;
  const jaPagou = inscricao.pagamento?.status_pagamento === 'pago';

  async function salvar() {
    if (motivo.trim().length < 3) { toast.error('Diga o motivo da bolsa'); return; }
    setSalvando(true);
    try {
      const r: any = await api.darBolsa(eventoId, inscricao.id, { tipo, valor, motivo: motivo.trim() });
      (r.avisos || []).forEach((a: string) => toast.warning(a, { duration: 8000 }));
      if (r.cobranca?.link) {
        await navigator.clipboard.writeText(r.cobranca.link).catch(() => {});
        toast.success('Bolsa registrada · link de pagamento copiado pra você enviar');
      } else {
        toast.success(tipo === 'integral' ? 'Inscrição isenta e confirmada' : 'Bolsa registrada');
      }
      onSaved({ ...inscricao, ...(r.inscricao || {}) });
    } catch (e: any) { toast.error(e?.message || 'Erro ao registrar a bolsa'); } finally { setSalvando(false); }
  }

  async function remover() {
    setSalvando(true);
    try {
      const r: any = await api.tirarBolsa(eventoId, inscricao.id);
      toast.success('Bolsa removida — volta ao valor de tabela');
      onSaved({ ...inscricao, ...(r.inscricao || {}) });
    } catch (e: any) { toast.error(e?.message || 'Erro ao remover'); } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md z-[1100] flex flex-col max-h-[90vh]">
        <DialogHeader><DialogTitle>Bolsa / isenção</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3 text-sm">
          <p className="text-muted-foreground">
            {inscricao.nome_completo}
            {tabela != null && <> · valor de tabela <b>R$ {tabela.toFixed(2).replace('.', ',')}</b></>}
          </p>
          {jaPagou && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 text-xs">
              Esta pessoa já pagou. A bolsa fica registrada, mas a devolução não é automática —
              decidam e façam o estorno.
            </p>
          )}
          <div className="flex gap-2">
            {(['integral', 'parcial'] as const).map(t => (
              <button key={t} onClick={() => setTipo(t)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${tipo === t ? 'border-primary text-primary bg-primary/10 font-semibold' : 'border-border text-muted-foreground'}`}>
                {t === 'integral' ? 'Vai de graça' : 'Paga menos'}
              </button>
            ))}
          </div>
          {tipo === 'parcial' && (
            <div>
              <label className="text-xs text-muted-foreground">Quanto esta pessoa vai pagar (R$)</label>
              <Input value={valor} onChange={e => setValor(e.target.value)} placeholder="100,00" inputMode="decimal" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Emite uma cobrança nova com este valor. A anterior é cancelada — a vaga continua dela.
              </p>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Motivo (fica registrado com seu nome)</label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
              placeholder="Ex.: situação financeira conversada com a liderança"
              className="w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div className="flex justify-between gap-2 pt-2">
          {inscricao.bolsa_tipo ? (
            <Button variant="ghost" size="sm" onClick={remover} disabled={salvando} className="text-red-600 hover:text-red-700">
              Remover bolsa
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button size="sm" onClick={salvar} disabled={salvando} className="bg-primary text-primary-foreground">
              {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Gratuidade e desconto autorizados por CPF, ANTES da inscrição.
 *
 * A pessoa digita o CPF no formulário público e o benefício se aplica sozinho:
 * gratuidade entra já confirmada (sem cobrança), desconto gera cobrança com o
 * valor reduzido.
 *
 * ⚠️ O valor pedido é **quanto a pessoa vai pagar**, não o desconto — mesma
 * semântica de `valor_cobrado_centavos` no banco. Inverter isso numa ponta e não
 * na outra é como se cobra R$ 700 de quem devia pagar R$ 200.
 */
function BeneficiosCard({ eventoId, evento, podeEditar }: {
  eventoId: string; evento: any; podeEditar?: boolean;
}) {
  const [itens, setItens] = useState<any[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ cpf: '', nome_referencia: '', tipo: 'integral', valor: '', motivo: '' });

  async function carregar() {
    try {
      const r = await api.beneficios(eventoId);
      setItens(r?.itens || []);
      setAviso(r?.aviso || null);
    } catch {
      setItens([]);
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [eventoId]);

  async function salvar() {
    const cpf = soDigitos(form.cpf);
    if (!cpfValido(cpf)) { toast.error('CPF inválido'); return; }
    if (form.motivo.trim().length < 3) { toast.error('Diga o motivo (fica registrado)'); return; }
    if (form.tipo === 'parcial' && !(Number(form.valor.replace(',', '.')) > 0)) {
      toast.error('Informe quanto essa pessoa vai pagar'); return;
    }
    setSalvando(true);
    try {
      await api.criarBeneficio(eventoId, {
        cpf, nome_referencia: form.nome_referencia, tipo: form.tipo,
        valor: form.tipo === 'parcial' ? form.valor.replace(',', '.') : undefined,
        motivo: form.motivo,
      });
      toast.success('Benefício cadastrado — vale quando essa pessoa se inscrever');
      setForm({ cpf: '', nome_referencia: '', tipo: 'integral', valor: '', motivo: '' });
      setAbrindo(false);
      carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao cadastrar');
    } finally { setSalvando(false); }
  }

  async function remover(b: any) {
    if (!window.confirm(b.usado_em
      ? 'Este benefício já foi usado. Remover tira da lista, mas a inscrição continua com o valor concedido. Remover?'
      : 'Remover este benefício?')) return;
    try {
      const r = await api.removerBeneficio(eventoId, b.id);
      toast.success(r?.aviso || 'Benefício removido');
      carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao remover');
    }
  }

  const valorTabela = evento?.valor_centavos
    ? `R$ ${(Number(evento.valor_centavos) / 100).toFixed(2).replace('.', ',')}` : null;

  return (
    <Card className="glass-solid p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          <Gift className="h-4 w-4 text-primary" /> Gratuidade e desconto por CPF
          {itens?.length ? <span className="text-xs text-muted-foreground font-normal">({itens.length})</span> : null}
        </div>
        {podeEditar && !abrindo && (
          <Button size="sm" variant="outline" className="h-8" onClick={() => setAbrindo(true)}>
            Adicionar CPF
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Cadastre o CPF de quem vai pagar menos (ou nada). Quando a pessoa se inscrever com esse CPF,
        o sistema aplica sozinho{valorTabela ? ` — o valor de tabela do evento é ${valorTabela}` : ''}.
        Quem <b>já se inscreveu</b> recebe pelo botão "Dar bolsa" na ficha dela.
      </p>

      {aviso && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-700 mb-3">{aviso}</div>}

      {abrindo && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 mb-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wide">CPF *</label>
              <Input value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: mascaraCpf(e.target.value) }))}
                placeholder="000.000.000-00" inputMode="numeric" className="h-9" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wide">Nome (pra vocês reconhecerem)</label>
              <Input value={form.nome_referencia} onChange={e => setForm(f => ({ ...f, nome_referencia: e.target.value }))}
                placeholder="opcional" className="h-9" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wide block mb-1">Benefício</label>
              <div className="flex gap-1.5">
                {[['integral', 'Gratuidade'], ['parcial', 'Desconto']].map(([v, l]) => (
                  <button key={v} onClick={() => setForm(f => ({ ...f, tipo: v }))}
                    className={`h-9 px-3 rounded-md text-xs font-medium border transition-colors ${
                      form.tipo === v ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {form.tipo === 'parcial' && (
              <div className="min-w-[180px]">
                <label className="text-[11px] text-muted-foreground uppercase tracking-wide">Quanto vai pagar (R$) *</label>
                <Input value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                  placeholder="ex.: 200,00" inputMode="decimal" className="h-9" />
              </div>
            )}
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wide">Motivo * (fica registrado)</label>
            <Input value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
              placeholder="ex.: bolsa aprovada pela liderança do AMI" className="h-9" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Cadastrar benefício'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAbrindo(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {itens === null ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
      ) : itens.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Nenhum CPF com benefício cadastrado.</p>
      ) : (
        <div className="space-y-1.5">
          {itens.map(b => (
            <div key={b.id} className="rounded-lg border border-border px-2.5 py-2 flex items-center gap-2 flex-wrap text-sm">
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  {b.nome_referencia || 'Sem nome'}
                  <span className="text-xs text-muted-foreground font-normal">{mascaraCpf(b.cpf)}</span>
                  <span className={`rounded-full text-[11px] font-medium px-2 py-0.5 ${
                    b.tipo === 'integral' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-primary/15 text-primary'}`}>
                    {b.tipo === 'integral'
                      ? 'gratuidade'
                      : `paga R$ ${(Number(b.valor_centavos || 0) / 100).toFixed(2).replace('.', ',')}`}
                  </span>
                  {/* "Usado" é o que diz se a autorização ainda vale — sem isso a
                      equipe não sabe se a pessoa já entrou com o benefício. */}
                  {b.usado_em && (
                    <span className="rounded-full text-[11px] font-medium px-2 py-0.5 bg-foreground/10 text-muted-foreground">
                      usado em {new Date(b.usado_em).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {b.motivo}
                  {b.criado_por_nome ? ` · por ${b.criado_por_nome}` : ''}
                </div>
              </div>
              {podeEditar && (
                <button onClick={() => remover(b)} className="text-red-500 p-1.5 shrink-0" title="Remover benefício">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const COMPROVANTE_LABEL: Record<string, string> = {
  em_analise: 'Em análise', aceito: 'Aceito', recusado: 'Recusado',
};
const COMPROVANTE_BADGE: Record<string, string> = {
  em_analise: 'bg-amber-500/15 text-amber-600',
  aceito: 'bg-emerald-500/15 text-emerald-600',
  recusado: 'bg-rose-500/15 text-rose-600',
};

/**
 * Comprovante de Pix/transferência que a PESSOA anexou na página de pagamento.
 *
 * ⚠️ Aceitar aqui é o que BAIXA o pagamento (manual, com autoria) — a imagem
 * nunca fez isso sozinha. Por isso o botão diz "Confirmar pagamento", não
 * "aceitar arquivo": quem clica está afirmando que conferiu que o dinheiro
 * entrou na conta, e é o nome dele que fica no registro.
 */
function ComprovantesBloco({ eventoId, inscricao, podeEditar, onPago }: {
  eventoId: string; inscricao: any; podeEditar?: boolean; onPago: () => void;
}) {
  const [itens, setItens] = useState<any[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [agindo, setAgindo] = useState<string | null>(null);

  async function carregar() {
    try {
      const r = await api.comprovantes(eventoId, inscricao.id);
      setItens(r?.itens || []);
      setAviso(r?.aviso || null);
    } catch {
      setItens([]);
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [inscricao.id]);

  async function aceitar(c: any) {
    if (!window.confirm('Confirmar que o dinheiro entrou na conta? Isso marca o pagamento como PAGO no seu nome.')) return;
    setAgindo(c.id);
    try {
      const r = await api.aceitarComprovante(eventoId, inscricao.id, c.id);
      toast.success(r?.ja_estava_pago ? 'Comprovante aceito (pagamento já constava pago)' : 'Pagamento confirmado');
      await carregar();
      onPago();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao confirmar');
    } finally { setAgindo(null); }
  }

  async function recusar(c: any) {
    // A pessoa LÊ este motivo na página de pagamento pra corrigir e reenviar —
    // por isso é obrigatório, aqui e no banco.
    const motivo = window.prompt('Por que está recusando? (a pessoa vai ler pra reenviar)');
    if (!motivo || motivo.trim().length < 3) return;
    setAgindo(c.id);
    try {
      await api.recusarComprovante(eventoId, inscricao.id, c.id, motivo.trim());
      toast.success('Comprovante recusado');
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao recusar');
    } finally { setAgindo(null); }
  }

  if (itens === null) {
    return (
      <div className="rounded-lg border border-border p-2.5 text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando comprovantes…
      </div>
    );
  }
  if (aviso) return <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-700">{aviso}</div>;
  if (!itens.length) return null;

  const pendentes = itens.filter((c) => c.status === 'em_analise').length;

  return (
    <div className={`rounded-lg border p-2.5 ${pendentes ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'}`}>
      <div className="text-[11px] uppercase tracking-wide mb-1.5 flex items-center gap-1 text-muted-foreground">
        <Paperclip className="h-3 w-3" /> Comprovante anexado
        {pendentes > 0 && <span className="text-amber-600 font-semibold normal-case">· {pendentes} pra conferir</span>}
      </div>
      <div className="space-y-2">
        {itens.map((c) => (
          <div key={c.id} className="rounded-md border border-border bg-card/50 p-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className={`rounded-full font-medium px-2 py-0.5 ${COMPROVANTE_BADGE[c.status] || 'bg-foreground/10'}`}>
                {COMPROVANTE_LABEL[c.status] || c.status}
              </span>
              <span>{c.metodo_declarado === 'transferencia' ? 'Transferência' : 'Pix'}</span>
              <span className="text-muted-foreground">
                enviado em {new Date(c.created_at).toLocaleString('pt-BR')}
              </span>
              {/* Signed URL de 15 min (bucket privado). Abre em aba nova: PDF e
                  imagem grande não caberiam legíveis dentro do modal. */}
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1 font-medium">
                  <ExternalLink className="h-3 w-3" /> Ver arquivo
                </a>
              )}
            </div>
            {c.observacao && <div className="text-xs text-muted-foreground mt-1">"{c.observacao}"</div>}
            {c.status === 'recusado' && c.motivo_recusa && (
              <div className="text-xs text-rose-600 mt-1">Recusado: {c.motivo_recusa}</div>
            )}
            {c.revisado_em && (
              <div className="text-[11px] text-muted-foreground mt-1">
                conferido por {c.revisado_por_nome || 'equipe'} em {new Date(c.revisado_em).toLocaleString('pt-BR')}
              </div>
            )}
            {podeEditar && c.status === 'em_analise' && (
              <div className="flex flex-wrap gap-2 mt-2">
                <Button size="sm" className="h-7 text-xs" disabled={agindo === c.id} onClick={() => aceitar(c)}>
                  {agindo === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirmar pagamento'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={agindo === c.id} onClick={() => recusar(c)}>
                  Recusar
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {podeEditar && pendentes > 0 && (
        <div className="text-[11px] text-muted-foreground mt-2">
          Confira o valor e a data no extrato antes de confirmar — o comprovante sozinho não baixa o pagamento.
        </div>
      )}
    </div>
  );
}

function InscricaoDetalheDialog({ inscricao, campos, premios, eventoId, evento, podeEditar, onSaved, onPago, onClose }: {
  inscricao: any; campos: any[]; premios: any[]; eventoId: string;
  evento?: any; podeEditar?: boolean;
  onSaved: (atualizada: any) => void; onPago?: () => void; onClose: () => void;
}) {
  const tel = String(inscricao.telefone || '').replace(/\D/g, '');
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [bolsaOpen, setBolsaOpen] = useState(false);
  const [form, setForm] = useState<{ nome_completo: string; telefone: string; email: string; dados: Record<string, string> }>({ nome_completo: '', telefone: '', email: '', dados: {} });
  const cancelada = inscricao.status === 'cancelada';

  function entrarEdicao() {
    setForm({
      nome_completo: inscricao.nome_completo || '',
      telefone: inscricao.telefone || '',
      email: inscricao.email || '',
      // Inclui TODOS os campos (inclusive imagem) já com o valor atual — assim o
      // merge do backend preserva o que não foi tocado e o campo de imagem/rede
      // social fica editável como texto/link.
      dados: Object.fromEntries(campos.map((c: any) => {
        const v = inscricao.dados?.[c.key];
        return [c.key, Array.isArray(v) ? v.join(', ') : String(v ?? '')];
      })),
    });
    setEditando(true);
  }

  async function salvar() {
    if (form.nome_completo.trim().length < 2) { toast.error('Nome inválido'); return; }
    setSalvando(true);
    try {
      const atualizada = await api.atualizarInscricao(eventoId, inscricao.id, form);
      toast.success('Inscrição atualizada');
      setEditando(false);
      onSaved(atualizada);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(novo: 'confirmada' | 'cancelada') {
    setSalvando(true);
    try {
      const atualizada = await api.atualizarInscricao(eventoId, inscricao.id, { status: novo });
      toast.success(novo === 'cancelada' ? 'Inscrição cancelada' : 'Inscrição reativada');
      onSaved(atualizada);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar');
    } finally {
      setSalvando(false);
    }
  }

  const setDado = (key: string, v: string) => setForm(f => ({ ...f, dados: { ...f.dados, [key]: v } }));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg flex flex-col max-h-[88vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <span className="truncate">{inscricao.nome_completo}</span>
            {inscricao.numero_sorte != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary text-xs font-semibold px-2 py-0.5 shrink-0">
                <Ticket className="h-3 w-3" /> Nº {inscricao.numero_sorte}
              </span>
            )}
            {cancelada && <span className="rounded-full bg-red-500/10 text-red-600 text-xs font-medium px-2 py-0.5 shrink-0">cancelada</span>}
            {!editando && (
              <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={entrarEdicao}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3 text-sm">
          {editando ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Nome completo</div>
                  <Input value={form.nome_completo} onChange={e => setForm(f => ({ ...f, nome_completo: e.target.value }))} className="h-9" />
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">WhatsApp</div>
                  <Input value={form.telefone} inputMode="tel" onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} className="h-9" />
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">E-mail</div>
                  <Input value={form.email} type="email" onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-9" />
                </div>
              </div>
              {campos.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Respostas do formulário</div>
                  {campos.map((c: any) => (
                    <div key={c.key} className="rounded-lg border border-border p-2.5">
                      <div className="text-[11px] text-muted-foreground mb-1">{c.label}</div>
                      {c.tipo === 'imagem' ? (
                        <div className="space-y-1.5">
                          {ehImagemUrl(form.dados[c.key]) && (
                            <a href={form.dados[c.key]} target="_blank" rel="noreferrer" title="Abrir imagem em tamanho real">
                              <img src={form.dados[c.key]} alt={c.label} className="max-h-28 w-auto max-w-full object-contain rounded border border-border" />
                            </a>
                          )}
                          <Input value={form.dados[c.key] || ''} onChange={e => setDado(c.key, e.target.value)} className="h-9"
                            placeholder="@usuário ou link da rede social" />
                          <p className="text-[11px] text-muted-foreground">Cole o @ ou o link da rede social. Para manter a imagem/logo enviada, deixe o link acima como está.</p>
                        </div>
                      ) : c.tipo === 'rede_social' ? (
                        <RedeSocialEdit value={form.dados[c.key] || ''} onChange={v => setDado(c.key, v)} />
                      ) : (c.tipo === 'select' || c.tipo === 'escolha') ? (
                        <select value={form.dados[c.key] || ''} onChange={e => setDado(c.key, e.target.value)}
                          className="h-9 w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-2">
                          <option value="">—</option>
                          {(c.opcoes || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
                          {form.dados[c.key] && !(c.opcoes || []).includes(form.dados[c.key]) && (
                            <option value={form.dados[c.key]}>{form.dados[c.key]}</option>
                          )}
                        </select>
                      ) : c.tipo === 'textarea' ? (
                        <textarea value={form.dados[c.key] || ''} onChange={e => setDado(c.key, e.target.value)}
                          className="w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] px-2 py-1.5 text-sm min-h-[70px]" />
                      ) : (
                        <Input value={form.dados[c.key] || ''} onChange={e => setDado(c.key, e.target.value)} className="h-9"
                          placeholder={c.tipo === 'multi' ? 'separe as opções por vírgula' : undefined} />
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setEditando(false)} disabled={salvando}>Cancelar</Button>
                <Button size="sm" onClick={salvar} disabled={salvando} className="bg-primary text-primary-foreground">
                  {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-lg border border-border p-2.5">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">WhatsApp</div>
                  {inscricao.telefone ? (
                    <a href={`https://wa.me/55${tel}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 font-medium">
                      <MessageCircle className="h-4 w-4" /> {inscricao.telefone}
                    </a>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>
                <div className="rounded-lg border border-border p-2.5">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Inscrição feita em</div>
                  {inscricao.created_at ? new Date(inscricao.created_at).toLocaleString('pt-BR') : '—'}
                </div>
                {inscricao.email && (
                  <div className="rounded-lg border border-border p-2.5 sm:col-span-2">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">E-mail</div>
                    <span className="break-all">{inscricao.email}</span>
                  </div>
                )}
                {inscricao.data_nascimento && (
                  <div className="rounded-lg border border-border p-2.5">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Nascimento</div>
                    {new Date(`${inscricao.data_nascimento}T00:00:00`).toLocaleDateString('pt-BR')}
                    <span className="text-muted-foreground">
                      {' · '}{idadeEmAnos(inscricao.data_nascimento)} anos · {faixaLabel(inscricao.data_nascimento, true)}
                    </span>
                  </div>
                )}
                {inscricao.sexo && (
                  <div className="rounded-lg border border-border p-2.5">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Sexo</div>
                    {sexoLabel(inscricao.sexo)}
                  </div>
                )}
              </div>

              {inscricao.pagamento && (
                <div className="rounded-lg border border-border p-2.5">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                    <CreditCard className="h-3 w-3" /> Pagamento
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={`rounded-full text-xs font-medium px-2 py-0.5 ${PAG_BADGE[inscricao.pagamento.status_pagamento] || 'bg-foreground/10 text-muted-foreground'}`}>
                      {PAG_LABEL[inscricao.pagamento.status_pagamento] || inscricao.pagamento.status_pagamento}
                    </span>
                    {inscricao.pagamento.metodo && (
                      <span>{METODO_LABEL[inscricao.pagamento.metodo] || inscricao.pagamento.metodo}
                        {inscricao.pagamento.parcelas_total > 1 ? ` · ${inscricao.pagamento.parcelas_total}x` : ''}
                      </span>
                    )}
                    {inscricao.pagamento.cartao_last4 && (
                      <span className="text-muted-foreground">
                        {inscricao.pagamento.cartao_brand || 'cartão'} ····{inscricao.pagamento.cartao_last4}
                      </span>
                    )}
                    {inscricao.pagamento.valor_centavos != null && (
                      <span className="font-medium">
                        R$ {(inscricao.pagamento.valor_centavos / 100).toFixed(2).replace('.', ',')}
                        {inscricao.pagamento.valor_pago_centavos != null
                          && inscricao.pagamento.valor_pago_centavos !== inscricao.pagamento.valor_centavos
                          && ` (pago R$ ${(inscricao.pagamento.valor_pago_centavos / 100).toFixed(2).replace('.', ',')})`}
                      </span>
                    )}
                    {inscricao.pagamento.pago_em && (
                      <span className="text-muted-foreground">em {new Date(inscricao.pagamento.pago_em).toLocaleString('pt-BR')}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Comprovante de Pix/transferência anexado pela pessoa. Só em
                  evento pago — em evento gratuito não há o que comprovar. */}
              {evento?.pagamento_ativo && (
                <ComprovantesBloco
                  eventoId={eventoId}
                  inscricao={inscricao}
                  podeEditar={podeEditar}
                  onPago={() => onPago?.()}
                />
              )}

              {/* Bolsa / isenção — só em evento pago. O preço é da INSCRIÇÃO;
                  o evento guarda o valor de tabela. */}
              {evento?.pagamento_ativo && (
                <div className={`rounded-lg border p-2.5 ${inscricao.bolsa_tipo ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
                  <div className="text-[11px] uppercase tracking-wide mb-1 flex items-center justify-between gap-2">
                    <span className={inscricao.bolsa_tipo ? 'text-primary' : 'text-muted-foreground'}>
                      {inscricao.bolsa_tipo ? (inscricao.bolsa_tipo === 'integral' ? 'Isenta (bolsa integral)' : 'Bolsa parcial') : 'Valor desta inscrição'}
                    </span>
                    {podeEditar && (
                      <button onClick={() => setBolsaOpen(true)} className="text-primary hover:underline text-[11px] font-semibold normal-case">
                        {inscricao.bolsa_tipo ? 'Alterar' : 'Dar bolsa / isentar'}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium">
                      {inscricao.valor_cobrado_centavos != null
                        ? (inscricao.valor_cobrado_centavos === 0
                          ? 'Gratuita'
                          : `R$ ${(inscricao.valor_cobrado_centavos / 100).toFixed(2).replace('.', ',')}`)
                        : (evento?.valor_centavos != null
                          ? `R$ ${(evento.valor_centavos / 100).toFixed(2).replace('.', ',')} (valor de tabela)`
                          : '—')}
                    </span>
                    {inscricao.bolsa_motivo && <span className="text-muted-foreground">· {inscricao.bolsa_motivo}</span>}
                    {inscricao.bolsa_por_nome && (
                      <span className="text-muted-foreground text-xs">
                        concedida por {inscricao.bolsa_por_nome}
                        {inscricao.bolsa_em ? ` em ${new Date(inscricao.bolsa_em).toLocaleDateString('pt-BR')}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {bolsaOpen && (
                <BolsaDialog
                  inscricao={inscricao}
                  evento={evento}
                  eventoId={eventoId}
                  onClose={() => setBolsaOpen(false)}
                  onSaved={(atualizada: any) => { setBolsaOpen(false); onSaved(atualizada); }}
                />
              )}

              {premios.length > 0 && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5">
                  <div className="text-[11px] text-primary uppercase tracking-wide mb-1 flex items-center gap-1"><Gift className="h-3 w-3" /> Ganhou no sorteio</div>
                  {premios.map((s: any) => (
                    <div key={s.id} className="text-sm font-medium">🎉 {s.premio || 'Prêmio'}</div>
                  ))}
                </div>
              )}

              {campos.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Respostas do formulário</div>
                  {campos.map((c: any) => {
                    const v = inscricao.dados?.[c.key];
                    return (
                      <div key={c.key} className="rounded-lg border border-border p-2.5">
                        <div className="text-[11px] text-muted-foreground mb-0.5">{c.label}</div>
                        {c.tipo === 'imagem' ? (
                          !v ? (
                            <span className="text-muted-foreground">—</span>
                          ) : ehImagemUrl(v) ? (
                            <a href={v} target="_blank" rel="noreferrer" title="Abrir imagem em tamanho real">
                              <img src={v} alt={c.label} className="max-h-40 w-auto max-w-full object-contain rounded border border-border" />
                            </a>
                          ) : /^https?:\/\//i.test(v) ? (
                            <a href={v} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">{v}</a>
                          ) : (
                            <span className="break-words">{v}</span>
                          )
                        ) : (
                          <div className="whitespace-pre-wrap break-words">{Array.isArray(v) ? v.join(', ') : (v || <span className="text-muted-foreground">—</span>)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end pt-1">
                {cancelada ? (
                  <Button size="sm" variant="outline" onClick={() => mudarStatus('confirmada')} disabled={salvando}>
                    {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Reativar inscrição
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => mudarStatus('cancelada')} disabled={salvando}
                    className="text-red-600 hover:text-red-700">
                    {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Cancelar inscrição
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
