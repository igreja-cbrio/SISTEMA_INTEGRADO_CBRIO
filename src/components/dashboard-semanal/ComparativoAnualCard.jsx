// ============================================================================
// "Comparativo do ano" — frequência, decisões e batismos dos 3 últimos anos, com
// botão de COPIAR pro WhatsApp.
//
// ⚠️ Isto NÃO é um segundo cálculo: chama o MESMO `GET /dashboard-semanal/ytd`
// que o bloco detalhado da aba Mensal (`YtdAcumuladoCard`) usa. Duas contas pro
// mesmo número é como as telas passam a discordar — aqui o que muda é só a
// FORMA: os três indicadores de uma vez, sem seletor, e copiável.
//
// ⚠️ O corte é o do próprio endpoint: 1º de janeiro até HOJE, aplicado igual nos
// três anos. Comparar "o ano inteiro" de 2026 com 2024/2025 daria número errado —
// os cultos de 2026 já estão pré-agendados até dezembro com frequência 0.
// ============================================================================
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dashboardSemanal as api } from '../../api';
import { Button } from '../ui/button';
import { montarResumoAnual, linhasDoYtd, numeroBr } from '../../lib/resumoAnualTexto';

// ⚠️ Os compostos, não as colunas soltas: "Frequência" aqui é templo + kids, e
// "Decisões" é presencial + online + kids — foi assim que o Matheus pediu, e é o
// que o resto do sistema chama de total.
const IND_FREQ = 'frequencia_total';
const IND_DEC = 'aceitacoes_total_kids';

export default function ComparativoAnualCard() {
  const [copiado, setCopiado] = useState(false);
  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual - 2, anoAtual - 1, anoAtual];
  const anosKey = anos.join(',');

  const freq = useQuery({
    queryKey: ['dash-sem', 'ytd', anosKey, IND_FREQ, 'resumo'],
    queryFn: () => api.ytd({ anos: anosKey, indicador: IND_FREQ }),
    staleTime: 5 * 60 * 1000,
  });
  const dec = useQuery({
    queryKey: ['dash-sem', 'ytd', anosKey, IND_DEC, 'resumo'],
    queryFn: () => api.ytd({ anos: anosKey, indicador: IND_DEC }),
    staleTime: 5 * 60 * 1000,
  });

  const carregando = freq.isLoading || dec.isLoading;
  const erro = freq.error || dec.error;

  const linhas = useMemo(() => linhasDoYtd({
    anos,
    frequencia: freq.data?.resultados,
    decisoes: dec.data?.resultados,
    // Batismos vêm de carona no payload de qualquer indicador (mesma janela).
    batismos: freq.data?.batismos,
  }), [freq.data, dec.data, anosKey]);

  const periodo = freq.data?.corte?.rotulo || '';

  async function copiar() {
    const texto = montarResumoAnual({
      titulo: 'CBRio · comparativo do ano',
      periodo,
      linhas,
    });
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
      toast.success('Copiado — é só colar no WhatsApp.');
    } catch {
      // ⚠️ `clipboard` exige contexto seguro e pode ser negado. Falhar em
      // silêncio faria o botão parecer quebrado.
      toast.error('O navegador não deixou copiar. Selecione o texto e copie na mão.');
    }
  }

  if (erro) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <strong>Não conseguimos carregar o comparativo do ano.</strong>
        <p className="mt-1 text-muted-foreground">{erro.message}</p>
        <Button variant="ghost" size="sm" className="mt-2 pl-0"
          onClick={() => { freq.refetch(); dec.refetch(); }}>Tentar de novo</Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Comparativo do ano</h3>
          {/* ⚠️ A JANELA vai colada no número: "78.416" sem "até 27/08" é o
              número que alguém compara com o ano fechado do ano passado. */}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {periodo ? `${periodo} · mesmo recorte nos três anos` : 'mesmo recorte nos três anos'}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={copiar} disabled={carregando}>
          {copiado ? 'Copiado!' : 'Copiar para WhatsApp'}
        </Button>
      </div>

      {carregando ? (
        <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 text-left font-semibold">Indicador</th>
                {anos.map((a) => <th key={a} className="py-1.5 text-right font-semibold">{a}</th>)}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.chave} className="border-t">
                  <td className="py-2 pr-3 font-medium">{l.rotulo}</td>
                  {l.anos.map((a) => (
                    <td key={a.ano} className="py-2 text-right">
                      {a.valor == null
                        // ⚠️ "—" e nunca 0: sem dado e zero levam a conclusões
                        // opostas.
                        ? <span className="text-muted-foreground" title="Sem dado para este ano">—</span>
                        : numeroBr(a.valor)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Frequência = templo + kids · Decisões = presencial + online + kids ·
        Batismos = cerimônias realizadas. Para abrir por mês, tipo de culto ou ver
        a média por culto, use a aba <strong>Mensal</strong>.
      </p>
    </div>
  );
}
