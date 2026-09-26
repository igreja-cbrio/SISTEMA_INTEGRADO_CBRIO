import { useEffect, useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import {
  SiteHeader, SiteFooter, Badge, useChrome, useGo, seriePath,
} from './novosite/shared';
import { NS_CSS } from './novosite/styles';
import { SERIES, TEMA_ANUAL, ANO_SERIES, fundoSerie, type Serie } from './novosite/series2027';
import { MESES, hojeBRT, statusSerie, type StatusSerie } from '@/lib/seriesSite';

/**
 * /series — as séries de pregação do ano (uma por mês).
 * Conteúdo em novosite/series2027.ts; estado (em breve / acontecendo /
 * concluída) calculado pela data de hoje em BRT.
 */

const ROTULO_STATUS: Record<StatusSerie, string> = {
  em_breve: 'Em breve',
  acontecendo: 'Acontecendo agora',
  concluida: 'Assista',
};

function CardSerie({ serie, hoje }: { serie: Serie; hoje: string }) {
  const go = useGo();
  const status = statusSerie(ANO_SERIES, serie.mes, hoje);
  const mes = MESES[serie.mes - 1];
  const temConteudo = !!serie.titulo;
  const inner = (
    <>
      <div className="ns-serie-arte" style={fundoSerie(serie)}>
        <span className={`ns-serie-status ns-serie-status-${status}`}>{ROTULO_STATUS[status]}</span>
        <span className="ns-serie-mes">{mes}</span>
      </div>
      <div className="ns-serie-corpo">
        <h3 className="ns-serie-titulo">{serie.titulo || 'Série em breve'}</h3>
        {serie.subtitulo && <p className="ns-serie-sub">{serie.subtitulo}</p>}
        {temConteudo && (
          <span className="ns-card-cta">Ver série <ArrowUpRight size={16} /></span>
        )}
      </div>
    </>
  );
  // Mês sem série definida não abre página vazia.
  if (!temConteudo) return <div className="ns-serie-card ns-serie-card-vazio ns-reveal">{inner}</div>;
  const dest = seriePath(serie.slug);
  return <a className="ns-serie-card ns-reveal" href={dest} onClick={go({ to: dest })}>{inner}</a>;
}

export default function SeriesLista() {
  const { scrolled, menuOpen, setMenuOpen, rootRef } = useChrome(`Séries ${ANO_SERIES} · CBRio`);
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const hoje = useMemo(() => hojeBRT(), []);
  const atual = SERIES.find((s) => s.titulo && statusSerie(ANO_SERIES, s.mes, hoje) === 'acontecendo');

  return (
    <div className="ns" ref={rootRef}>
      <style>{NS_CSS}</style>
      {/* Header sólido desde o topo: a página é clara, o menu branco sumiria. */}
      <SiteHeader scrolled menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      <section className="ns-section ns-theme-offwhite ns-pagina-clara">
        <div className="ns-container">
          <div className="ns-reveal ns-series-cab">
            <p className="ns-eyebrow ns-petrol-accent">Séries de pregação · {ANO_SERIES}</p>
            <h1 className="ns-h2 ns-petrol-accent">Séries de <b>pregação</b></h1>
            {TEMA_ANUAL.titulo && (
              <div className="ns-series-tema">
                <span className="ns-series-tema-rot">Tema do ano</span>
                <strong>{TEMA_ANUAL.titulo}</strong>
                {TEMA_ANUAL.versiculo && (
                  <p>“{TEMA_ANUAL.versiculo}”{TEMA_ANUAL.referencia && <span> — {TEMA_ANUAL.referencia}</span>}</p>
                )}
              </div>
            )}
          </div>
          {atual && (
            <div className="ns-reveal ns-section-head">
              <p className="ns-eyebrow ns-petrol-accent">Neste mês</p>
              <h2 className="ns-h2 ns-petrol-accent"><b>{atual.titulo}</b></h2>
            </div>
          )}
          <div className="ns-series-grid">
            {SERIES.map((s) => <CardSerie key={s.slug} serie={s} hoje={hoje} />)}
          </div>
        </div>
      </section>

      <SiteFooter />
      <Badge />
    </div>
  );
}
