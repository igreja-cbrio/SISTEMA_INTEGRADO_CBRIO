/**
 * Card auto-suficiente da linha do tempo da jornada: busca os dados e monta o
 * `JornadaTimeline`.
 *
 * Existe para as telas que NÃO carregam `GET /cuidados/jornada-convertidos` por
 * conta própria — hoje o painel de Grupos (pedido do Matheus em 14/08/2026:
 * "liga também no painel de grupos").
 *
 * NÃO usar onde a tela já busca esse endpoint. O módulo Cuidados monta o
 * `JornadaTimeline` direto com o `jornadaData` que o `loadAll()` dele já traz —
 * usar este card lá faria a MESMA consulta duas vezes na mesma página.
 *
 * Nasce RECOLHIDO. O cabeçalho já entrega o número que decide se vale abrir
 * (quantos engajaram), então recolher não esconde que existe informação — é a
 * mesma decisão do painel do agente de voluntariado. Aberto por padrão, ele
 * empurraria as tabelas de grupo para fora da primeira tela.
 */
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Route } from 'lucide-react';
import { cuidados } from '../../api';
import JornadaTimeline from './JornadaTimeline';

export default function JornadaConvertidosCard({
  area,
  titulo = 'Quanto tempo o novo convertido leva até engajar',
  subtitulo = 'Uma linha por pessoa, em dias desde a decisão de fé.',
}: {
  area?: string;
  titulo?: string;
  subtitulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await cuidados.jornadaConvertidos(area ? { area } : undefined);
      setData(r);
    } catch (e: any) {
      // Erro NUNCA se disfarça de "não há ninguém" — são conclusões opostas,
      // e o zero silencioso é justamente o que ninguém investiga.
      setErro(e?.message || 'Não foi possível carregar a jornada dos convertidos.');
    } finally {
      setCarregando(false);
    }
  }, [area]);

  // Busca só quando abre (lazy) — e uma vez só.
  useEffect(() => {
    if (aberto && !data && !carregando && !erro) carregar();
  }, [aberto, data, carregando, erro, carregar]);

  const engajaram = data?.tempo?.engajaram;
  const total = data?.itens?.length;

  return (
    <div className="rounded-[16px] border border-border bg-card">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
        aria-expanded={aberto}
      >
        <div className="flex items-start gap-2 min-w-0">
          <Route className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{titulo}</h3>
            <p className="text-xs text-muted-foreground">
              {subtitulo}
              {typeof engajaram === 'number' && typeof total === 'number' && total > 0 && (
                <>
                  {' · '}
                  <span className="tabular-nums font-medium text-foreground">
                    {engajaram} de {total}
                  </span>{' '}
                  engajaram
                </>
              )}
            </p>
          </div>
        </div>
        {aberto ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {aberto && (
        <div className="px-4 pb-4">
          {carregando && (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando a jornada…</p>
          )}
          {erro && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">{erro}</p>
              <button
                type="button"
                onClick={carregar}
                className="text-xs text-primary hover:underline mt-1"
              >
                Tentar de novo
              </button>
            </div>
          )}
          {data && !erro && <JornadaTimeline data={data} />}
        </div>
      )}
    </div>
  );
}
