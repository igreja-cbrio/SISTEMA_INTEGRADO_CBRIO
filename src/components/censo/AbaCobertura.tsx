// A pergunta que esta aba responde não é "quantas respostas temos" — é
// "posso confiar nisso?".
//
// 300 respostas de 1.798 membros ativos é o retrato de 17% da comunidade. Quem
// vai decidir a estratégia do ano em cima desses números precisa ver o
// denominador ANTES do numerador — por isso a cobertura vem no primeiro cartão,
// não escondida num rodapé.
import { useCallback, useEffect, useState } from 'react';
import { censo } from '../../api';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Users, CheckCircle2, Clock, TrendingDown } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line,
} from 'recharts';
import EmptyState from '@/components/EmptyState';

type Cobertura = {
  pesquisa: { titulo: string | null; status: string | null; total_perguntas: number; ultima_resposta_em: string | null };
  iniciadas: number; concluidas: number; abandonadas: number;
  taxa_conclusao: number | null; duracao_media_seg: number | null;
  identificadas: number; anonimas: number;
  membros_ativos: number; cobertura_pct: number | null;
  por_canal: { canal: string; iniciadas: number; concluidas: number; identificadas: number }[];
  por_dia: { dia: string; iniciadas: number; concluidas: number }[];
  abandono: { pergunta_id: string; pergunta_texto: string; respostas: number; pct_do_total: number }[];
};

const CANAL_LABEL: Record<string, string> = {
  qr: 'QR do culto', app: 'aplicativo', link: 'link', email: 'e-mail',
  whatsapp: 'WhatsApp', totem: 'totem', importado: 'importação',
};

function minutos(seg: number | null) {
  if (!seg) return '—';
  const m = Math.floor(seg / 60);
  return m >= 1 ? `${m} min ${Math.round(seg % 60)}s` : `${Math.round(seg)}s`;
}

function Cartao({ icone: Icone, label, valor, apoio, tom }: {
  icone: typeof Users; label: string; valor: string; apoio?: string; tom?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
          <Icone className="size-3.5" />
          <span className="text-[11px] uppercase tracking-wide">{label}</span>
        </div>
        <p className={`text-2xl font-semibold ${tom || ''}`}>{valor}</p>
        {apoio && <p className="text-xs text-muted-foreground mt-1">{apoio}</p>}
      </CardContent>
    </Card>
  );
}

export default function AbaCobertura({ pesquisaId }: { pesquisaId: string | null }) {
  const [d, setD] = useState<Cobertura | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!pesquisaId) return;
    setD(null); setErro(null);
    try { setD(await censo.cobertura(pesquisaId)); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  }, [pesquisaId]);
  useEffect(() => { carregar(); }, [carregar]);

  if (!pesquisaId) {
    return <EmptyState icone={Users} titulo="Escolha uma pesquisa"
      mensagem="Selecione a pesquisa acima para ver a cobertura." />;
  }
  if (erro) return <p className="text-sm text-destructive py-6 text-center">{erro}</p>;
  if (!d) {
    return (
      <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando cobertura…
      </div>
    );
  }

  if (!d.iniciadas) {
    return <EmptyState icone={Users} titulo="Ninguém respondeu ainda"
      mensagem="Assim que a primeira pessoa enviar, os números aparecem aqui." />;
  }

  const cob = d.cobertura_pct;
  // O tom do número diz o que ele significa sem precisar de legenda.
  const tomCobertura = cob === null ? '' : cob >= 60 ? 'text-emerald-600'
    : cob >= 30 ? 'text-amber-600' : 'text-rose-600';

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao
          icone={Users} label="cobertura" tom={tomCobertura}
          valor={cob === null ? '—' : `${cob}%`}
          apoio={`${d.identificadas} pessoas reconhecidas de ${d.membros_ativos} membros ativos`}
        />
        <Cartao icone={CheckCircle2} label="respostas concluídas" valor={String(d.concluidas)}
          apoio={`${d.abandonadas} começaram e não terminaram`} />
        <Cartao icone={Clock} label="tempo médio" valor={minutos(d.duracao_media_seg)}
          apoio={`${d.pesquisa.total_perguntas} perguntas no questionário`} />
        <Cartao icone={CheckCircle2} label="taxa de conclusão"
          valor={d.taxa_conclusao === null ? '—' : `${d.taxa_conclusao}%`}
          apoio={`${d.anonimas} resposta(s) sem identificação`} />
      </div>

      {/* A ressalva fica na tela, não numa nota de rodapé: é ela que impede a
          leitura errada. */}
      {cob !== null && cob < 40 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm">
            <p className="font-medium mb-1">Esta amostra ainda não representa a igreja.</p>
            <p className="text-muted-foreground">
              {d.identificadas} de {d.membros_ativos} membros ativos responderam ({cob}%). Dá para
              ver tendência, não para afirmar proporção — quem respondeu primeiro tende a ser quem
              está mais presente e mais engajado, então o retrato puxa para o lado positivo.
            </p>
          </CardContent>
        </Card>
      )}

      {d.por_dia.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Respostas por dia</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={d.por_dia}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="concluidas" name="concluídas"
                  stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line type="monotone" dataKey="iniciadas" name="iniciadas"
                  stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Por onde entraram</h3>
          <div className="space-y-2">
            {d.por_canal.map((c) => (
              <div key={c.canal} className="flex items-center gap-3">
                <span className="text-xs w-28 shrink-0 text-muted-foreground">
                  {CANAL_LABEL[c.canal] || c.canal}
                </span>
                <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                  <div className="h-full bg-primary/70"
                    style={{ width: `${d.concluidas ? (c.concluidas / d.concluidas) * 100 : 0}%` }} />
                </div>
                <span className="text-xs w-24 text-right tabular-nums">
                  {c.concluidas} · {c.identificadas} com nome
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Este é o gráfico que melhora o PRÓXIMO censo: a pergunta com menos
          resposta é a que está cansando ou incomodando. */}
      {d.abandono.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Onde as pessoas param de responder</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Perguntas que menos gente respondeu. Cansaço, dúvida ou desconforto — vale reler
              o texto delas antes do próximo censo.
            </p>
            <ResponsiveContainer width="100%" height={Math.max(180, d.abandono.length * 34)}>
              <BarChart data={d.abandono} layout="vertical" margin={{ left: 8, right: 40 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <YAxis type="category" dataKey="pergunta_texto" width={200}
                  tick={{ fontSize: 10 }} interval={0}
                  tickFormatter={(v: string) => (v?.length > 34 ? `${v.slice(0, 33)}…` : v)} />
                <Tooltip formatter={(v: number) => `${v}% responderam`} />
                <Bar dataKey="pct_do_total" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
