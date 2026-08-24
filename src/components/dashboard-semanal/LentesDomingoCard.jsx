// Prévia do NOVO FORMATO de domingo (docs/cultos-domingo/ · corte 24/08/2026).
//
// ⚠️ Mora na ABA "Domingo" do Dashboard Semanal, NÃO na aba Semanal (pedido do
// Matheus em 24/08: no meio do resumo da semana ele polui a tela de quem só
// quer o número do domingo passado). Quem decide se a aba existe é o mesmo
// `useLentesDomingo` que este card consome.
//
// ATRÁS DO VÉU: o backend só devolve dado com a flag ligada OU pra super-admin
// (GET /dashboard-semanal/lentes-domingo). Sem visibilidade, o card nem
// renderiza — é a "página teste" combinada com o Marcos em 13/08.
//
// Mostra as 3 lentes aprovadas (separada · continuidade · consolidação), a
// ocupação sobre lugares OFERECIDOS (1050 × cultos vigentes no domingo) e a
// tabela de vigência/chaves dos tipos — os dados do Lote 3 ficam visíveis aqui.
import { useState } from 'react';
import useLentesDomingo from './useLentesDomingo';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import OcupacaoGauge from './OcupacaoGauge';
import { FlaskConical } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine,
} from 'recharts';

const PALETA = ['#00B39D', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

const LENTES = [
  { key: 'separada', rotulo: 'Separada', hint: 'Dado cru por culto — o 09:30 nasce como série nova e o 10:00 encerra. É a lente padrão.' },
  { key: 'continuidade', rotulo: 'Continuidade', hint: 'O 10:00 vira o 09:30: a mesma linha atravessa o corte (chave de linhagem).' },
  { key: 'consolidacao', rotulo: 'Consolidação', hint: '08:30 + 10:00 SOMADOS por semana no passado, contra o 09:30 novo — compare o bloco, não o culto.' },
];

function fmtVigencia(t) {
  if (t.vigente_ate) return `até ${t.vigente_ate.slice(8, 10)}/${t.vigente_ate.slice(5, 7)}`;
  if (t.vigente_de) return `a partir de ${t.vigente_de.slice(8, 10)}/${t.vigente_de.slice(5, 7)}`;
  return 'contínuo';
}

export default function LentesDomingoCard() {
  const [lente, setLente] = useState('separada');
  const { data } = useLentesDomingo();

  // véu fechado / carregando / erro → não ocupa espaço de ninguém
  if (!data?.visivel) return null;

  const l = data.lentes?.[lente] || { series: [], pontos: [], medias: {} };
  const chart = (l.pontos || []).map((p) => ({ label: p.label, ...p.valores }));
  const ocupAtual = [...(data.ocupacao || [])].reverse().find((o) => o.taxa != null) || null;
  const linhaCorte = data.corte?.label || null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <FlaskConical className="h-4 w-4 text-[#00B39D]" />
          <CardTitle className="text-base">Cultos de domingo · prévia do novo formato (corte 24/08)</CardTitle>
          {!data.flag_publica && (
            <span className="text-[11px] rounded-full border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 px-2 py-0.5">
              atrás do véu · visível só pra super-admin
            </span>
          )}
        </div>
        {!data.chaves_ok && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            A migration 20260813150000 ainda não foi aplicada — sem as chaves de linhagem/consolidação,
            as lentes mostram o dado separado.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* seletor de lente */}
        <div>
          <div className="flex flex-wrap gap-2">
            {LENTES.map((op) => (
              <button
                key={op.key}
                type="button"
                onClick={() => setLente(op.key)}
                className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                  lente === op.key
                    ? 'bg-[#00B39D] text-white border-[#00B39D]'
                    : 'border-border text-muted-foreground hover:border-[#00B39D]/50'
                }`}
              >
                {op.rotulo}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {LENTES.find((op) => op.key === lente)?.hint}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr,240px] gap-4">
          {/* série semanal por lente + marcador do corte */}
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} width={44} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {linhaCorte && (
                  <ReferenceLine
                    x={linhaCorte}
                    stroke="#00B39D"
                    strokeDasharray="4 4"
                    label={{ value: 'novo formato', position: 'top', fontSize: 11, fill: '#00B39D' }}
                  />
                )}
                {(l.series || []).map((s, i) => (
                  <Line
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    type="monotone"
                    stroke={s.cor || PALETA[i % PALETA.length]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ocupação sobre lugares OFERECIDOS */}
          <div className="flex flex-col items-center justify-center gap-1">
            {ocupAtual ? (
              <>
                <OcupacaoGauge taxa={ocupAtual.taxa} capacidade={ocupAtual.capacidade_total} />
                <p className="text-[11px] text-muted-foreground text-center leading-snug">
                  ocupação do domingo {ocupAtual.label} sobre lugares <b>ofertados</b> ·{' '}
                  {data.capacidade_unitaria} × {ocupAtual.cultos_vigentes} culto
                  {ocupAtual.cultos_vigentes === 1 ? '' : 's'} vigente{ocupAtual.cultos_vigentes === 1 ? '' : 's'}
                  {' '}(após o corte o denominador cai sozinho pela vigência)
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Sem domingo com dado na janela.</p>
            )}
          </div>
        </div>

        {/* médias por série (média das SOMAS semanais — regra da consolidação) */}
        {(l.series || []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(l.series || []).map((s, i) => (
              <span key={s.key} className="text-[11px] rounded-md border border-border px-2 py-1 text-muted-foreground">
                <span
                  className="inline-block h-2 w-2 rounded-full mr-1.5 align-middle"
                  style={{ background: s.cor || PALETA[i % PALETA.length] }}
                />
                {s.label}: <b className="text-foreground">{l.medias?.[s.key] ?? '—'}</b>/sem
              </span>
            ))}
          </div>
        )}

        {/* vigência + chaves (os dados do Lote 3, à vista pra conferência) */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left font-medium py-1.5 pr-3">Tipo de culto</th>
                <th className="text-left font-medium py-1.5 pr-3">Hora</th>
                <th className="text-left font-medium py-1.5 pr-3">Vigência</th>
                <th className="text-left font-medium py-1.5 pr-3">Linhagem</th>
                <th className="text-left font-medium py-1.5">Consolidação</th>
              </tr>
            </thead>
            <tbody>
              {(data.tipos || []).map((t) => (
                <tr key={t.id} className="border-b border-border/50">
                  <td className="py-1.5 pr-3">{t.nome}{!t.is_active && <span className="text-muted-foreground"> · encerrado</span>}</td>
                  <td className="py-1.5 pr-3">{t.hora}</td>
                  <td className="py-1.5 pr-3">{fmtVigencia(t)}</td>
                  <td className="py-1.5 pr-3">{t.linhagem_key || '—'}</td>
                  <td className="py-1.5">{t.consolidacao_key || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
