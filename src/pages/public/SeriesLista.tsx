import { useEffect, useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import {
  Wave, SiteHeader, SiteFooter, Badge, useChrome, useGo, seriePath,
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
      <SiteHeader scrolled={scrolled} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      <section className="ns-qs-hero">
        <div className="ns-qs-hero-bg" style={{ backgroundImage: 'url(/novosite/palavra.webp)' }} />
        <div className="ns-qs-hero-ov" />
        <div className="ns-container ns-qs-hero-in ns-reveal">
          <p className="ns-eyebrow ns-hero-eyebrow">Séries {ANO_SERIES}</p>
          {TEMA_ANUAL.titulo ? (
            <>
              <h1 className="ns-hero-title"><span className="ns-hero-black">{TEMA_ANUAL.titulo}</span></h1>
              {TEMA_ANUAL.descricao && <p className="ns-qs-lead-dark">{TEMA_ANUAL.descricao}</p>}
              {TEMA_ANUAL.versiculo && (
                <p className="ns-qs-lead-dark ns-serie-versiculo">
                  “{TEMA_ANUAL.versiculo}”{TEMA_ANUAL.referencia && <span> — {TEMA_ANUAL.referencia}</span>}
                </p>
              )}
            </>
          ) : (
            <h1 className="ns-hero-title">
              <span className="ns-hero-light">Um ano inteiro</span> <span className="ns-hero-black">na Palavra.</span>
            </h1>
          )}
          <p className="ns-qs-lead-dark">
            A cada mês, uma série. Aqui você encontra as mensagens, os textos bíblicos,
            os materiais para baixar e o devocional de cada uma.
          </p>
        </div>
        <Wave color="var(--cb-offwhite)" />
      </section>

      <section className="ns-section ns-theme-offwhite">
        <div className="ns-container">
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
