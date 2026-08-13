// ============================================================================
// Agente de Voluntariado · painel do coordenador (UI)
// ============================================================================
// Mostra as escalas dos próximos cultos que precisam de ação: confirmações
// pendentes (WhatsApp 1-toque), recusas pra repor e no-shows do último culto.
// Modo seguro: só sugere — quem age é o coordenador.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { agenteVoluntariado as api } from '../api';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Sparkles, MessageCircle, Loader2, CalendarClock, UserX, AlertTriangle, Copy, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

type Pendente = { schedule_id: string; nome: string; funcao: string; servico: string | null; quando: string; telefone: string | null; whatsapp: string | null; telefone_fonte?: string | null; telefone_origem?: string | null };
type Reposicao = { schedule_id: string; nome: string; funcao: string; servico: string | null; quando: string };
type NoShow = { schedule_id: string; nome: string; funcao: string; servico: string | null; quando: string };
type Dados = { confirmacoes_pendentes: Pendente[]; reposicoes: Reposicao[]; no_shows: NoShow[] };

export default function AgenteVoluntariadoPainel() {
  const [d, setD] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  // Nasce RECOLHIDO (pedido do Matheus · 13/08/2026): o painel abre no topo do
  // dashboard de voluntariado e a lista aberta empurrava o resto da tela pra
  // baixo. O cabeçalho já carrega o total e o resumo por categoria, então a
  // informação de que existe trabalho pendente não se perde ao recolher.
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    api.analisar()
      .then((r: Dados) => setD(r))
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return null;
  if (!d) return null;
  const total = d.confirmacoes_pendentes.length + d.reposicoes.length + d.no_shows.length;
  if (total === 0) return null;

  // ── Recolher as listas (copiar / baixar CSV) ──────────────────────────────
  const linhas = () => {
    const out: { categoria: string; nome: string; funcao: string; servico: string; quando: string; telefone: string }[] = [];
    d.confirmacoes_pendentes.forEach((p) => out.push({ categoria: 'Aguardando confirmação', nome: p.nome, funcao: p.funcao || '', servico: p.servico || '', quando: p.quando || '', telefone: p.telefone || '' }));
    d.reposicoes.forEach((r) => out.push({ categoria: 'Reposição (recusou)', nome: r.nome, funcao: r.funcao || '', servico: r.servico || '', quando: r.quando || '', telefone: '' }));
    d.no_shows.forEach((n) => out.push({ categoria: 'Faltou sem avisar', nome: n.nome, funcao: n.funcao || '', servico: n.servico || '', quando: n.quando || '', telefone: '' }));
    return out;
  };
  const textoListas = () => {
    const secao = (titulo: string, arr: { nome: string; funcao: string; servico: string | null; quando: string; telefone?: string | null }[], comTel = false) =>
      arr.length
        ? `\n${titulo} (${arr.length}):\n` + arr.map((x) => `- ${[x.nome, x.funcao, x.servico, x.quando, comTel ? x.telefone : ''].filter(Boolean).join(' · ')}`).join('\n') + '\n'
        : '';
    return 'Agente de Voluntariado\n' +
      secao('Aguardando confirmação', d.confirmacoes_pendentes, true) +
      secao('Recusadas — precisam de reposição', d.reposicoes) +
      secao('Faltaram sem avisar no último culto', d.no_shows);
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(textoListas().trim()); toast.success('Listas copiadas — é só colar.'); }
    catch { toast.error('Não consegui copiar. Tente o "Baixar".'); }
  };
  const comTelefone = d.confirmacoes_pendentes.filter((p) => p.telefone);
  const lembrarTodos = async () => {
    if (comTelefone.length === 0) { toast.error('Ninguém com telefone para lembrar.'); return; }
    if (!window.confirm(`Enviar o lembrete de escala pelo WhatsApp para ${comTelefone.length} voluntário(s)?`)) return;
    setEnviando(true);
    try {
      const r: any = await api.lembrar(); // todos os pendentes com telefone
      // ⚠️ Envio que não enfileirou NINGUÉM não pode aparecer como sucesso
      // (lição do disparo do censo, 05/08: caixa verde para envio que não
      // aconteceu, com o motivo real escondido como slug). O motivo vem do
      // servidor como frase inteira.
      if (!r.enfileirados) {
        toast.warning(r.motivo || 'Nada foi enviado — nenhum lembrete foi enfileirado.', { duration: 10000 });
      } else {
        const extras = [
          r.sem_telefone ? `${r.sem_telefone} sem telefone` : '',
          r.adiados ? `${r.adiados} ficaram para a próxima rodada` : '',
        ].filter(Boolean);
        // "Enfileirado", não "enviado": a entrega é da fila (cron horário, com
        // retry). Dizer "enviado" prometeria o que este clique não garante.
        toast.success(`${r.enfileirados} lembrete(s) na fila de envio${extras.length ? ` · ${extras.join(' · ')}` : ''}`);
      }
    } catch (e: any) { toast.error(e.message); } finally { setEnviando(false); }
  };
  const baixarCsv = () => {
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Categoria', 'Nome', 'Função', 'Serviço', 'Quando', 'Telefone'], ...linhas().map((l) => [l.categoria, l.nome, l.funcao, l.servico, l.quando, l.telefone])];
    const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'agente-voluntariado.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV baixado.');
  };

  return (
    <Card className="p-4 border-primary/30 bg-primary/5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={() => setAberto((v) => !v)} className="flex items-center gap-2 min-w-0" title={aberto ? 'Recolher' : 'Expandir'}>
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold text-sm">Agente de Voluntariado</span>
          <Badge variant="secondary" className="text-[10px]">{total}</Badge>
          {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        <div className="flex items-center gap-1.5 flex-wrap">
          {comTelefone.length > 0 && (
            <Button size="sm" onClick={lembrarTodos} disabled={enviando} className="h-8 gap-1.5">
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />} Lembrar todos ({comTelefone.length})
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={copiar} className="h-8 gap-1.5">
            <Copy className="h-3.5 w-3.5" /> Copiar
          </Button>
          <Button size="sm" variant="outline" onClick={baixarCsv} className="h-8 gap-1.5">
            <Download className="h-3.5 w-3.5" /> Baixar CSV
          </Button>
        </div>
      </div>

      {!aberto && (
        <button onClick={() => setAberto(true)} className="text-xs text-muted-foreground text-left">
          {[
            d.confirmacoes_pendentes.length > 0 ? `${d.confirmacoes_pendentes.length} a confirmar` : '',
            d.reposicoes.length > 0 ? `${d.reposicoes.length} p/ repor` : '',
            d.no_shows.length > 0 ? `${d.no_shows.length} faltaram` : '',
          ].filter(Boolean).join(' · ')} · toque para ver
        </button>
      )}

      {aberto && (
      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
      {d.confirmacoes_pendentes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" /> Aguardando confirmação ({d.confirmacoes_pendentes.length}) · lembre em 1 toque
          </div>
          {d.confirmacoes_pendentes.map((p) => (
            <div key={p.schedule_id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{p.nome}</div>
                <div className="text-xs text-muted-foreground truncate">{[p.funcao, p.servico, p.quando].filter(Boolean).join(' · ')}</div>
                {/* De onde veio o telefone. Só aparece quando NÃO é o cadastro
                    do próprio voluntariado — número recuperado do cadastro da
                    pessoa ou de um formulário antigo merece ser conferido antes
                    de mandar, e sem o rótulo ele é indistinguível de um
                    digitado aqui dentro. */}
                {p.telefone && p.telefone_fonte && p.telefone_origem !== 'perfil' && (
                  <div className="text-[11px] text-muted-foreground/80 truncate">telefone do {p.telefone_fonte}</div>
                )}
              </div>
              {p.whatsapp ? (
                <a href={p.whatsapp} target="_blank" rel="noopener noreferrer">
                  <Button size="sm"><MessageCircle className="h-4 w-4 mr-1" /> Lembrar</Button>
                </a>
              ) : <span className="text-xs text-amber-600">sem telefone cadastrado</span>}
            </div>
          ))}
        </div>
      )}

      {d.reposicoes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <UserX className="h-3.5 w-3.5" /> Recusadas — precisam de reposição ({d.reposicoes.length})
          </div>
          {d.reposicoes.map((r) => (
            <div key={r.schedule_id} className="rounded-md border border-amber-300/50 bg-amber-500/5 p-2 text-sm">
              <span className="font-medium">{r.nome}</span>
              <span className="text-xs text-muted-foreground"> — {[r.funcao, r.servico, r.quando].filter(Boolean).join(' · ')}</span>
            </div>
          ))}
        </div>
      )}

      {d.no_shows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" /> Faltaram sem avisar no último culto ({d.no_shows.length})
          </div>
          {d.no_shows.map((n) => (
            <div key={n.schedule_id} className="rounded-md border border-border bg-card p-2 text-sm">
              <span className="font-medium">{n.nome}</span>
              <span className="text-xs text-muted-foreground"> — {[n.funcao, n.servico, n.quando].filter(Boolean).join(' · ')}</span>
            </div>
          ))}
        </div>
      )}
      </div>
      )}
    </Card>
  );
}
