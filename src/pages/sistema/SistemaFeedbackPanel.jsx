// Feedback do piloto DENTRO do /sistema (2026-09-01).
//
// Pedido do Matheus: "preciso que dentro de adm/sistema eu tenha um local para
// acessar essa tela" — a tela é `/admin/feedback`, onde ele estava.
//
// ⚠️ Este painel NÃO reimplementa a tela: ela tem filtros, mudança de status e
// três abas próprias. Duas versões da mesma fila divergiriam na primeira regra
// nova, e uma delas ficaria mentindo. Aqui fica o RETRATO (o que faria alguém
// abrir a tela) e o caminho pra ela.
//
// ⚠️ E não há risco de permissão divergente: `/sistema` e `/admin/feedback` são
// as duas gated por `SuperAdminGuard`, e o backend de `/api/feedback` exige
// `requireSuperAdmin`. Quem enxerga este painel entra na tela.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ExternalLink, Loader2, MessageSquareWarning, RefreshCw, ServerCrash,
} from 'lucide-react';
import { feedback as feedbackApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function quando(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const TOM = {
  neutro: 'text-foreground',
  marca: 'text-primary',
  alerta: 'text-amber-600 dark:text-amber-400',
  grave: 'text-red-600 dark:text-red-400',
};

function Metrica({ label, valor, tom = 'neutro', nota }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className={`text-2xl font-semibold leading-none ${TOM[tom] || TOM.neutro}`}>{valor ?? '—'}</div>
      <div className="mt-1.5 text-xs text-muted-foreground">{label}</div>
      {nota && <div className="mt-0.5 text-[11px] text-muted-foreground/80">{nota}</div>}
    </div>
  );
}

export function FeedbackPilotoPanel() {
  const [resumo, setResumo] = useState(null);
  const [erros, setErros] = useState(null);
  const [relatorio, setRelatorio] = useState(null);
  const [erro, setErro] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      // ⚠️ `Promise.all`, não `allSettled`: se uma das leituras falhar eu prefiro
      // DECLARAR que o retrato não veio a mostrar meio painel com zeros — zero
      // aqui se lê como "não há erro nenhum", que é a conclusão oposta.
      const [res, errs, rels] = await Promise.all([
        feedbackApi.resumo(),
        feedbackApi.erros(),
        feedbackApi.relatorios(),
      ]);
      setResumo(res || null);
      setErros(Array.isArray(errs) ? errs : []);
      setRelatorio(Array.isArray(rels) && rels.length ? rels[0] : null);
    } catch (e) {
      setErro(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const acoes = relatorio?.actions_taken || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Feedback do piloto</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O que os testadores reportaram pelo botão “Reportar” e os erros 500 capturados no
            backend. Triar, filtrar e mudar status é na tela completa.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          {/* ⚠️ `Link`, não `<a href>`: âncora recarrega o app inteiro (bundle,
              sessão, permissões) só pra trocar de tela dentro do mesmo SPA. */}
          <Button asChild size="sm">
            <Link to="/admin/feedback">
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir o painel completo
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-40 items-center justify-center rounded-xl border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : erro ? (
        // ⚠️ Erro NUNCA vira painel zerado: "não há feedback" e "a consulta
        // falhou" levam a decisões opostas.
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Não consegui carregar o retrato do feedback
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {erro?.message || 'A resposta da API veio vazia.'}
            {erro?.requestId && <> Código de rastreio: <code>{erro.requestId}</code>.</>}
          </p>
          <Button className="mt-4" size="sm" variant="outline" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" />Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metrica label="Reportes no total" valor={resumo?.total} />
            <Metrica label="Novos" valor={resumo?.novos} tom={resumo?.novos ? 'marca' : 'neutro'} nota="ainda sem triagem" />
            <Metrica label="Críticos abertos" valor={resumo?.criticos} tom={resumo?.criticos ? 'grave' : 'neutro'} />
            <Metrica label="Erros 500" valor={erros?.length} tom={erros?.length ? 'alerta' : 'neutro'} nota="capturados no backend" />
          </div>

          <section className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 md:px-5">
              <MessageSquareWarning className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Último relatório do agente</h3>
              {relatorio && (
                <>
                  <Badge variant="secondary">{quando(relatorio.created_at)}</Badge>
                  {typeof acoes.feedbacks === 'number' && (
                    <span className="text-xs text-muted-foreground">{acoes.feedbacks} reporte(s)</span>
                  )}
                  {typeof acoes.erros === 'number' && (
                    <span className="text-xs text-muted-foreground">· {acoes.erros} erro(s)</span>
                  )}
                  {relatorio.status === 'failed' && (
                    <Badge variant="outline" className="border-destructive/40 text-destructive">falhou</Badge>
                  )}
                </>
              )}
            </div>
            {relatorio ? (
              // ⚠️ `max-h` + rolagem: o relatório é texto corrido do agente e pode
              // ter dezenas de linhas. Sem teto ele empurra o resto da aba pra
              // fora da dobra e o painel deixa de ser um retrato.
              <div className="max-h-96 overflow-y-auto whitespace-pre-wrap px-4 py-4 text-sm leading-6 md:px-5">
                {relatorio.summary || '(sem conteúdo)'}
              </div>
            ) : (
              <div className="px-4 py-8 text-center md:px-5">
                <ServerCrash className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Nenhum relatório ainda. O agente roda 1×/dia (07:00), resume os reportes e os
                  erros do dia e avisa no sino.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default FeedbackPilotoPanel;
