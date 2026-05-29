import { useEffect } from 'react';

/**
 * /novosite — Ambiente de teste para o novo layout do site público da CBRio
 * (redesign de cbrio.com.br).
 *
 * Esta é uma página PÚBLICA e standalone:
 *   - Renderiza FORA do AppShell e FORA do ProtectedRoute (sem login).
 *   - NÃO está linkada em nenhum menu/navbar — só é acessível digitando
 *     diretamente /novosite.
 *   - Marcada como `noindex` + bloqueada no robots.txt, pois vive no domínio
 *     real (cbrio.com.br) e não deve aparecer em buscas enquanto é só teste.
 *
 * COMO PREENCHER (quando a landing page chegar):
 *   1. Substitua todo o conteúdo dentro de <main data-slot="landing"> pelas
 *      seções da landing (hero, sobre, horários, ministérios, CTA, footer…).
 *   2. Assets estáticos (imagens, vídeos, fontes) vão em /public e são servidos
 *      na raiz — sugestão: criar /public/novosite/ e referenciar como
 *      <img src="/novosite/hero.jpg" />.
 *   3. O container raiz já isola o tema do ERP (fundo/cor/fonte próprios), então
 *      pode usar Tailwind à vontade OU CSS próprio sem herdar o shell.
 *   4. Pode quebrar a landing em sub-componentes em
 *      src/pages/public/novosite/ e importar aqui.
 */
export default function NovoSite() {
  useEffect(() => {
    // Isola o canvas do tema (possivelmente escuro) do ERP enquanto a página
    // está montada — restaura ao desmontar.
    const prevBg = document.body.style.background;
    document.body.style.background = '#ffffff';

    // Evita indexação no domínio real enquanto é apenas prévia interna.
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);

    const prevTitle = document.title;
    document.title = 'CBRio · novo site (prévia)';

    return () => {
      document.body.style.background = prevBg;
      document.head.removeChild(meta);
      document.title = prevTitle;
    };
  }, []);

  return (
    <div
      data-page="novosite"
      style={{
        minHeight: '100vh',
        width: '100%',
        background: '#ffffff',
        color: '#0a0a0a',
        fontFamily:
          "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        overflowX: 'hidden',
      }}
    >
      {/* Faixa de ambiente interno — remover quando a landing for pra valer */}
      <div
        style={{
          width: '100%',
          background: '#00B39D',
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textAlign: 'center',
          padding: '6px 12px',
        }}
      >
        PRÉVIA INTERNA · /novosite · não listado, não indexado
      </div>

      {/*
        ┌─────────────────────────────────────────────────────────────────┐
        │  SLOT DA LANDING PAGE                                            │
        │  Troque o conteúdo deste <main> pelas seções do novo site.      │
        └─────────────────────────────────────────────────────────────────┘
      */}
      <main
        data-slot="landing"
        style={{
          minHeight: 'calc(100vh - 30px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: 20,
          padding: '48px 24px',
        }}
      >
        <img
          src="/logo-cbrio.svg"
          alt="CBRio"
          style={{ width: 72, height: 72, opacity: 0.95 }}
        />
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: '#00B39D',
          }}
        >
          Novo site
        </p>
        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(28px, 5vw, 52px)',
            fontWeight: 800,
            lineHeight: 1.1,
            maxWidth: 720,
          }}
        >
          Ambiente pronto para a landing page
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 'clamp(15px, 2vw, 18px)',
            color: '#525252',
            maxWidth: 560,
            lineHeight: 1.6,
          }}
        >
          Esta página é o canvas em branco para testar o novo layout do
          cbrio.com.br. Me mande o contexto do que você quer testar aqui e eu
          construo a landing dentro deste espaço.
        </p>
      </main>
    </div>
  );
}
