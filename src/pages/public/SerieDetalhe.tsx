import { useEffect, useMemo, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, Download, FileText, Play, Lock, Heart as HeartIcon } from 'lucide-react';
import {
  SiteHeader, SiteFooter, Badge, useChrome, useGo, SERIES_PATH, seriePath,
} from './novosite/shared';
import { NS_CSS } from './novosite/styles';
import { SERIES, ANO_SERIES, fundoSerie, type Mensagem, type Serie } from './novosite/series2027';
import { MESES, hojeBRT, mensagemLiberada, dataLonga, youtubeId } from '@/lib/seriesSite';

/**
 * /series/:slug — uma série: objetivo, textos-base, materiais, devocional
 * e a lista de mensagens. Cada mensagem libera vídeo e PDF no DIA dela
 * (BRT); antes disso aparece só a data e o texto bíblico.
 */

/** Player que só carrega o iframe do YouTube no clique (página leve no celular). */
function Video({ id, titulo }: { id: string; titulo: string }) {
  const [on, setOn] = useState(false);
  if (on) {
    return (
      <div className="ns-msg-video">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={titulo}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <button type="button" className="ns-msg-video ns-msg-video-capa" onClick={() => setOn(true)}
      style={{ backgroundImage: `url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)` }} aria-label={`Assistir: ${titulo}`}>
      <span className="ns-msg-play"><Play size={26} /></span>
    </button>
  );
}

function CardMensagem({ m, n, hoje }: { m: Mensagem; n: number; hoje: string }) {
  const liberada = mensagemLiberada(m.data, hoje);
  const id = liberada ? youtubeId(m.youtube) : null;
  return (
    <article className={`ns-msg ns-reveal${liberada ? '' : ' ns-msg-futura'}`}>
      <div className="ns-msg-cab">
        <span className="ns-msg-num">Mensagem {n}</span>
        <span className="ns-msg-data">{dataLonga(m.data)}</span>
      </div>
      <h3 className="ns-msg-titulo">{m.titulo}</h3>
      {m.texto && <p className="ns-msg-texto"><BookOpen size={16} /> {m.texto}</p>}
      {m.pregador && <p className="ns-msg-pregador">{m.pregador}</p>}
      {m.resumo && <p className="ns-msg-resumo">{m.resumo}</p>}
      {liberada ? (
        <>
          {id && <Video id={id} titulo={m.titulo} />}
          {m.pdf && (
            <a className="ns-btn ns-btn-primary ns-btn-sm ns-msg-pdf" href={m.pdf} target="_blank" rel="noopener noreferrer" download>
              <Download size={16} /> Baixar PDF da mensagem
            </a>
          )}
          {!id && !m.pdf && <p className="ns-msg-aviso">O vídeo desta mensagem entra aqui em breve.</p>}
        </>
      ) : (
        <p className="ns-msg-aviso"><Lock size={14} /> Disponível a partir de {dataLonga(m.data)}.</p>
      )}
    </article>
  );
}

function Materiais({ serie }: { serie: Serie }) {
  const d = serie.devocional;
  if (!serie.pdf && !d) return null;
  return (
    <div className="ns-serie-materiais ns-reveal">
      {serie.pdf && (
        <a className="ns-material" href={serie.pdf} target="_blank" rel="noopener noreferrer" download>
          <span className="ns-card-icon"><FileText size={22} /></span>
          <span>
            <strong>Material da série</strong>
            <span>PDF para baixar e estudar em grupo ou em casa.</span>
          </span>
          <Download size={18} />
        </a>
      )}
      {d && (
        <div className="ns-material">
          <span className="ns-card-icon"><HeartIcon size={22} /></span>
          <span>
            <strong>Devocional · {d.titulo}</strong>
            {d.descricao && <span>{d.descricao}</span>}
            <span className="ns-material-links">
              {d.pdf && <a href={d.pdf} target="_blank" rel="noopener noreferrer" download><Download size={14} /> Baixar PDF</a>}
              {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer"><ArrowRight size={14} /> Abrir devocional</a>}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function SerieDetalheConteudo({ slug }: { slug?: string }) {
  const serie = SERIES.find((s) => s.slug === slug && s.titulo);
  const { scrolled, menuOpen, setMenuOpen, rootRef } = useChrome(serie ? `${serie.titulo} · Séries CBRio` : 'Séries · CBRio');
  const go = useGo();
  const hoje = useMemo(() => hojeBRT(), []);
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  // Série inexistente ou ainda sem título volta para a lista.
  if (!serie) return <Navigate to={SERIES_PATH} replace />;

  const publicadas = SERIES.filter((s) => s.titulo);
  const i = publicadas.findIndex((s) => s.slug === serie.slug);
  const ant = i > 0 ? publicadas[i - 1] : null;
  const prox = i < publicadas.length - 1 ? publicadas[i + 1] : null;
  const mensagens = [...serie.mensagens].sort((a, b) => a.data.localeCompare(b.data));

  return (
    <div className="ns" ref={rootRef}>
      <style>{NS_CSS}</style>
      <SiteHeader scrolled menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      {/* Faixa longa só com a arte da série (o nome vem escrito na própria imagem). */}
      <div className="ns-pagina-clara ns-serie-banner-area">
        <div className="ns-container">
          <a className="ns-serie-voltar" href={SERIES_PATH} onClick={go({ to: SERIES_PATH })}>
            <ArrowLeft size={16} /> Todas as séries
          </a>
          <div className="ns-serie-banner" style={fundoSerie(serie)} role="img" aria-label={`Arte da série ${serie.titulo}`}>
            {!serie.imagem && <span className="ns-serie-banner-nome">{serie.titulo}</span>}
          </div>
          <h1 className="ns-sr-only">{serie.titulo}</h1>
          <p className="ns-eyebrow ns-petrol-accent ns-serie-banner-meta">
            {MESES[serie.mes - 1]} · {ANO_SERIES}{serie.subtitulo ? ` · ${serie.subtitulo}` : ''}
          </p>
        </div>
      </div>

      <section className="ns-section ns-theme-offwhite ns-historia ns-serie-conteudo">
        <div className="ns-container ns-serie-topo">
          <div className="ns-reveal">
            {serie.objetivo && (
              <>
                <p className="ns-eyebrow ns-petrol-accent">Sobre a série</p>
                <p className="ns-lead">{serie.objetivo}</p>
              </>
            )}
            {!!serie.textos?.length && (
              <div className="ns-serie-textos">
                <p className="ns-eyebrow ns-petrol-accent">Textos da série</p>
                <ul>{serie.textos.map((t) => <li key={t}><BookOpen size={16} /> {t}</li>)}</ul>
              </div>
            )}
          </div>
          <Materiais serie={serie} />
        </div>

        <div className="ns-container">
          <div className="ns-reveal ns-section-head">
            <p className="ns-eyebrow ns-petrol-accent">Mensagens</p>
            <h2 className="ns-h2 ns-petrol-accent">Assista e <b>estude.</b></h2>
          </div>
          {mensagens.length ? (
            <div className="ns-msgs">
              {mensagens.map((m, k) => <CardMensagem key={`${m.data}-${k}`} m={m} n={k + 1} hoje={hoje} />)}
            </div>
          ) : (
            <p className="ns-msg-aviso">As mensagens desta série serão divulgadas em breve.</p>
          )}

          <nav className="ns-serie-nav">
            {ant ? <a href={seriePath(ant.slug)} onClick={go({ to: seriePath(ant.slug) })}><ArrowLeft size={16} /> {ant.titulo}</a> : <span />}
            {prox ? <a href={seriePath(prox.slug)} onClick={go({ to: seriePath(prox.slug) })}>{prox.titulo} <ArrowRight size={16} /></a> : <span />}
          </nav>
        </div>
      </section>

      <SiteFooter />
      <Badge />
    </div>
  );
}

/**
 * `key={slug}` remonta a página ao trocar de série pelo "anterior/próxima":
 * o useChrome observa os `.ns-reveal` só na montagem, e sem remontar os cards
 * da série nova ficariam invisíveis (opacity 0).
 */
export default function SerieDetalhe() {
  const { slug } = useParams();
  return <SerieDetalheConteudo key={slug} slug={slug} />;
}
