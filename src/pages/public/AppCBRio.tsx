// Página pública do APLICATIVO CBRio · é a "Application home page" declarada na
// tela de consentimento OAuth do Google (projeto `crm-cbrio`).
//
// ⚠️ POR QUE ELA EXISTE (não apagar sem trocar a URL no console do Google):
// a verificação da marca foi RECUSADA em 04/08/2026 com dois motivos, e os dois
// eram sobre a página inicial declarada lá:
//   1. "Your home page does not explain the purpose of your app."
//   2. "The app name 'CBRio' configured for your OAuth consent screen does not
//       match the app name on your home page."
// A causa medida: a home do cbrio.org é o SPA do ERP — quem revisa cai numa
// tela de LOGIN, que não explica propósito nenhum, e o <title> global do
// index.html diz "CBRio · Comunidade Batista do Rio de Janeiro", diferente do
// "CBRio" do consentimento.
//
// Por isso esta página, deliberadamente:
//   · usa "CBRio" como nome exibido (h1) e no document.title — o MESMO string
//     do campo "App name" do consentimento e do `expo.name` do app.json;
//   · explica em texto o que o aplicativo faz;
//   · declara quais dados o login com Google entrega e para quê.
// Mudou o "App name" no console? Muda o h1 e o title aqui também, senão o
// motivo 2 volta.
//
// Registrada nas DUAS árvores de rota do App.tsx (ERP em cbrio.org e site
// público em cbrio.com.br), como o /suporte — assim a URL funciona em qualquer
// um dos dois domínios e não depende de qual deles está no console.
// Autossuficiente (sem AppShell, sem login, sem tema logado), igual ao /suporte.
import { useEffect } from 'react';

const C = {
  bg: '#0d1117', card: '#161b22', border: '#232a33',
  text: '#e6edf3', text2: '#9aa4b2', primary: '#00B39D',
};

const EMAIL_SUPORTE = 'gestao@cbrio.com.br';

// ⚠️ O nome tem que ser IDÊNTICO ao "App name" da tela de consentimento.
const APP_NAME = 'CBRio';

const RECURSOS: Array<{ t: string; d: string }> = [
  { t: 'Cartão de membro', d: 'O seu cartão digital com QR, para se identificar nos cultos e eventos da igreja.' },
  { t: 'Inscrições', d: 'Batismo, grupos de conexão, Next e eventos — inscrição pelo próprio aplicativo.' },
  { t: 'Devocional diário', d: 'O plano de leitura da igreja, com marcação de leitura e sequência de dias.' },
  { t: 'Avisos da igreja', d: 'Comunicados e notificações do que está acontecendo na comunidade.' },
  { t: 'Meu grupo de conexão', d: 'Informações do seu grupo, contato do líder e materiais de estudo.' },
  { t: 'Check-in do Kids', d: 'Pais e responsáveis preparam o check-in dos filhos antes de chegar na igreja.' },
  { t: 'Generosidade', d: 'Dízimos e ofertas pelo aplicativo, com comprovante anual para o imposto de renda.' },
  { t: 'Pregações', d: 'As mensagens e séries da igreja para assistir quando quiser.' },
];

export default function AppCBRio() {
  useEffect(() => { document.title = APP_NAME; }, []);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, padding: '40px 20px', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        <header style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 60, height: 60, borderRadius: 15, background: `${C.primary}22`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.primary, fontSize: 32, fontWeight: 800 }}>♡</div>
          <h1 style={{ fontSize: 30, fontWeight: 800, margin: '16px 0 6px', letterSpacing: '-0.5px' }}>{APP_NAME}</h1>
          <p style={{ fontSize: 15, color: C.text2, margin: 0, lineHeight: 1.6 }}>
            O aplicativo de membros da Igreja Comunidade Batista do Rio de Janeiro.
          </p>
        </header>

        {/* Propósito — é o que o motivo 1 da recusa pedia explicitamente. */}
        <section style={{ background: C.card, border: `1px solid ${C.primary}55`, borderRadius: 14, padding: 22, marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px' }}>Para que serve o {APP_NAME}</h2>
          <p style={{ fontSize: 14.5, color: C.text2, margin: 0, lineHeight: 1.65 }}>
            O {APP_NAME} é o aplicativo da nossa igreja para quem faz parte da comunidade. Por ele, cada
            pessoa acompanha a própria caminhada na igreja: acessa o cartão de membro, se inscreve nos
            cursos e eventos, acompanha o devocional diário, recebe os avisos da igreja, vê as informações
            do seu grupo de conexão, prepara o check-in dos filhos no ministério infantil, contribui com
            dízimos e ofertas e assiste às pregações.
          </p>
          <p style={{ fontSize: 14.5, color: C.text2, margin: '12px 0 0', lineHeight: 1.65 }}>
            O aplicativo é oferecido gratuitamente pela igreja aos seus membros e frequentadores. Não
            vendemos nada dentro dele além das contribuições e inscrições da própria igreja, e não
            exibimos publicidade.
          </p>
        </section>

        <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 14px' }}>O que você faz no aplicativo</h2>
          <div style={{ display: 'grid', gap: 14 }}>
            {RECURSOS.map((r) => (
              <div key={r.t}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{r.t}</div>
                <div style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.55, marginTop: 2 }}>{r.d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Login com Google — o que o app recebe e para quê. */}
        <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px' }}>Como você entra na sua conta</h2>
          <p style={{ fontSize: 14.5, color: C.text2, margin: '0 0 14px', lineHeight: 1.65 }}>
            Você pode criar a conta com e-mail e senha, ou entrar com Google ou Apple — o que for mais
            simples para você.
          </p>
          <div style={{ borderLeft: `3px solid ${C.primary}`, paddingLeft: 14 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 6 }}>Ao entrar com Google</div>
            <p style={{ fontSize: 13.5, color: C.text2, margin: 0, lineHeight: 1.6 }}>
              Recebemos apenas o seu <strong style={{ color: C.text }}>nome</strong>, o seu{' '}
              <strong style={{ color: C.text }}>endereço de e-mail</strong> e a{' '}
              <strong style={{ color: C.text }}>foto do seu perfil</strong>. Usamos esses dados só para
              criar e identificar a sua conta no aplicativo, para que você não precise preencher tudo de
              novo nem lembrar de mais uma senha.
            </p>
            <p style={{ fontSize: 13.5, color: C.text2, margin: '10px 0 0', lineHeight: 1.6 }}>
              O login <strong style={{ color: C.text }}>não pede acesso</strong> aos seus contatos, ao
              Gmail, ao Google Drive, à sua agenda ou ao seu canal do YouTube. Não usamos esses dados
              para publicidade e não os vendemos.
            </p>
          </div>
        </section>

        <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px' }}>Quem oferece o aplicativo</h2>
          <p style={{ fontSize: 14.5, color: C.text2, margin: 0, lineHeight: 1.65 }}>
            O {APP_NAME} é desenvolvido e mantido pela <strong style={{ color: C.text }}>Igreja
            Comunidade Batista do Rio de Janeiro</strong>, no Rio de Janeiro, Brasil. Para dúvidas,
            problemas de acesso ou pedidos sobre os seus dados, fale com a gente:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
            <a href={`mailto:${EMAIL_SUPORTE}?subject=Aplicativo%20CBRio`}
              style={{ background: C.primary, color: '#04241f', fontWeight: 700, textDecoration: 'none', padding: '11px 18px', borderRadius: 10, fontSize: 14 }}>
              {EMAIL_SUPORTE}
            </a>
            <a href="/suporte"
              style={{ background: 'transparent', color: C.text, fontWeight: 600, textDecoration: 'none', padding: '11px 18px', borderRadius: 10, fontSize: 14, border: `1px solid ${C.border}` }}>
              Central de suporte
            </a>
          </div>
        </section>

        <footer style={{ textAlign: 'center', color: C.text2, fontSize: 12.5, marginTop: 26, lineHeight: 1.7 }}>
          Igreja Comunidade Batista do Rio de Janeiro · {APP_NAME} · {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}
