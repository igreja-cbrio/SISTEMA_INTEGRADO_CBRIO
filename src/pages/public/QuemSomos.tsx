import { useEffect } from 'react';
import {
  Heart, Wave, Action, SiteHeader, SiteFooter, Badge, useChrome, useHashScroll, HOME,
} from './novosite/shared';
import { NS_CSS } from './novosite/styles';

/**
 * /novosite/quem-somos — história e missão da CBRio (versão pública do
 * "When Culture Changes Everything"). Pública, standalone, noindex. Reusa o
 * chrome/estilos de novosite/shared. Fotos: as atuais (marketing reavalia depois).
 */

const STATS = [
  { de: '200', para: '1.704', label: 'Decisões por Cristo' },
  { de: '1.014', para: '2.362', label: 'Presença semanal' },
  { de: '245', para: '1.090', label: 'Pequenos grupos' },
  { de: '243', para: '523', label: 'Voluntários' },
  { de: '282', para: '837', label: 'Generosidade · doadores' },
  { de: '1.116', para: '8.365', label: 'Oração e devocionais' },
];

export default function QuemSomos() {
  const { scrolled, menuOpen, setMenuOpen, rootRef } = useChrome('Quem Somos · CBRio');
  useHashScroll();
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="ns" ref={rootRef}>
      <style>{NS_CSS}</style>
      <SiteHeader scrolled={scrolled} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      {/* ░░ SUB-HERO ░░ */}
      <section className="ns-qs-hero">
        <div className="ns-qs-hero-bg" style={{ backgroundImage: 'url(/novosite/auditorio.webp)' }} />
        <div className="ns-qs-hero-ov" />
        <div className="ns-container ns-qs-hero-in ns-reveal">
          <p className="ns-eyebrow ns-hero-eyebrow">Quem somos</p>
          <h1 className="ns-hero-title">
            <span className="ns-hero-light">Quando a cultura</span> <span className="ns-hero-black">muda tudo.</span>
          </h1>
          <p className="ns-qs-lead-dark">
            O Rio é uma cidade que faz você acreditar que algo grande é possível — 7 milhões de histórias
            que merecem ser transformadas pelo Evangelho. Foi pra alcançar essa cidade que Deus nos
            chamou, e a gente nunca tratou esse chamado como pouca coisa.
          </p>
        </div>
        <Wave color="var(--cb-sand)" />
      </section>

      {/* ░░ NOSSA HISTÓRIA ░░ */}
      <section className="ns-section ns-theme-sand has-wave ns-historia">
        <div className="ns-container ns-historia-grid">
          <figure className="ns-reveal ns-qs-fig">
            <img src="/novosite/palavra.webp" alt="Mensagem durante o culto na CBRio" loading="lazy" />
          </figure>
          <div className="ns-reveal ns-qs-prose">
            <p className="ns-eyebrow ns-petrol-accent">Nossa história</p>
            <h2 className="ns-h2 ns-petrol-accent">De uma sala de estar a um <b>movimento.</b></h2>
            <p className="ns-lead">
              Há mais de 21 anos, um pequeno grupo ousou acreditar que uma igreja poderia mudar o Rio.
              Não começamos com prédio nem orçamento — começamos numa sala de estar, na casa do nosso
              pastor fundador, Pedro. Semana após semana, só com fé, uma missão e uns aos outros.
            </p>
            <p className="ns-lead">
              Daquela sala fomos para um shopping. Depois, para um espaço alugado que nunca parecia
              grande o bastante pro que Deus estava fazendo. Cada passo foi um passo de fé, dado antes
              da gente conseguir enxergar o que vinha pela frente.
            </p>
            <p className="ns-lead">
              Essa comunidade se tornou a CBRio. E, desde o início, nunca foi sobre construir uma
              igreja — sempre foi sobre <b>alcançar uma cidade.</b>
            </p>
          </div>
        </div>
        <Wave color="var(--cb-offwhite)" />
      </section>

      {/* ░░ A VIRADA ░░ */}
      <section className="ns-section ns-theme-offwhite has-wave ns-historia">
        <div className="ns-container ns-historia-grid">
          <figure className="ns-reveal ns-qs-fig">
            <img src="/novosite/online.webp" alt="Louvor durante o culto" loading="lazy" />
          </figure>
          <div className="ns-reveal ns-qs-prose">
            <p className="ns-eyebrow ns-petrol-accent">A virada</p>
            <h2 className="ns-h2 ns-petrol-accent">O que <b>nos mudou.</b></h2>
            <p className="ns-lead">
              Por anos crescemos com paixão e dedicação. Mas em 2020 algo mudou. Conhecemos a Eagle
              Brook Church, em Minnesota, e o que encontramos lá foi mais do que inspiração: foi
              clareza. Vimos como é uma igreja totalmente alinhada em torno de uma missão.
            </p>
            <p className="ns-lead">
              Voltamos pro Rio com algo que nunca tínhamos tido com tanta nitidez: uma missão definida
              e uma cultura construída sobre cinco práticas reais. Antes a gente tinha coração. O que
              ganhamos foi direção — e quando as duas coisas se encontram, algo acelera.
            </p>
          </div>
        </div>
        <Wave color="var(--cb-petrol)" />
      </section>

      {/* ░░ MISSÃO ░░ */}
      <section className="ns-section ns-theme-petrol has-wave ns-qs-missao">
        <Heart className="ns-cta-watermark" />
        <div className="ns-container ns-reveal" style={{ position: 'relative', zIndex: 1 }}>
          <p className="ns-eyebrow ns-turq-light">Nossa missão</p>
          <h2 className="ns-h2">Empoderados por Deus para <b>alcançar pessoas para Jesus.</b></h2>
          <p className="ns-lead ns-on-dark">
            A cultura, na CBRio, não é uma mensagem de domingo. É o sistema operacional — está em como
            lideramos, como servimos e como crescemos. Cada decisão passa pela mesma missão.
          </p>
        </div>
        <Wave color="var(--cb-sand)" />
      </section>

      {/* ░░ CRESCIMENTO ░░ */}
      <section className="ns-section ns-theme-sand has-wave ns-historia">
        <div className="ns-container">
          <div className="ns-reveal ns-section-head">
            <p className="ns-eyebrow ns-petrol-accent">O crescimento</p>
            <h2 className="ns-h2 ns-petrol-accent">Entre 2021 e 2025, <b>muito além do planejado.</b></h2>
          </div>
          <div className="ns-stats ns-reveal">
            {STATS.map((s) => (
              <div key={s.label} className="ns-stat">
                <div className="ns-stat-num">{s.para}</div>
                <div className="ns-stat-de">de {s.de} em 2021</div>
                <div className="ns-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="ns-stats-cap ns-reveal">Por trás de cada número há uma pessoa que entrou carregando algo pesado e saiu com algo novo.</p>
        </div>
        <Wave color="var(--cb-offwhite)" />
      </section>

      {/* ░░ O QUE VEM ░░ */}
      <section className="ns-section ns-theme-offwhite">
        <div className="ns-container ns-section-head ns-reveal">
          <p className="ns-eyebrow ns-petrol-accent">O que vem</p>
          <h2 className="ns-h2 ns-petrol-accent">O Brasil precisa de <b>Jesus.</b></h2>
          <p className="ns-lead">
            O que Deus tem feito aqui não cabe só no Rio. Pelo Gênesis — nosso encontro anual com
            líderes de todo o Brasil — e pela CBA, a associação que caminha ao lado de outras igrejas,
            a gente compartilha o que recebeu. E damos o próximo passo: a <b>CBS1</b>, nosso primeiro
            campus multisite, no Recreio. A gente não vai diminuir o passo.
          </p>
        </div>
      </section>

      {/* ░░ CTA ░░ */}
      <section className="ns-section ns-theme-petrol ns-cta">
        <Heart className="ns-cta-watermark" />
        <div className="ns-container ns-center ns-reveal">
          <h2 className="ns-h2">Você <b>pertence</b> aqui.</h2>
          <p className="ns-lead ns-on-dark ns-center-x">Venha fazer parte do que Deus está fazendo no Rio.</p>
          <div className="ns-hero-actions ns-center-x">
            <Action variant="secondary" to={HOME} hash="visita">Planeje sua visita</Action>
            <Action variant="outline" to={HOME} icon={false}>Voltar ao início</Action>
          </div>
        </div>
      </section>

      <SiteFooter />
      <Badge />
    </div>
  );
}
