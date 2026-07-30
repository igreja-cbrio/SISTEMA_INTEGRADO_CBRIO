// Página pública de SUPORTE (exigência Apple · Guideline 1.5 · Support URL).
// Fora do AppShell/ProtectedRoute · sem login · info de contato e ajuda dos apps
// da CBRio (Membros e Staff). Autossuficiente (sem depender de tema logado).
import { useEffect } from 'react';

const C = {
  bg: '#0d1117', card: '#161b22', border: '#232a33',
  text: '#e6edf3', text2: '#9aa4b2', primary: '#00B39D',
};
const EMAIL_SUPORTE = 'gestao@cbrio.com.br';
const WHATS = '5521999079031'; // número institucional CBRio

export default function Suporte() {
  useEffect(() => { document.title = 'Suporte · CBRio'; }, []);

  const secao = (titulo: string, itens: Array<{ p: string; d: string }>) => (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 12px' }}>{titulo}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {itens.map((i, k) => (
          <div key={k}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{i.p}</div>
            <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.55, marginTop: 2 }}>{i.d}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, padding: '40px 20px', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: `${C.primary}22`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.primary, fontSize: 30, fontWeight: 800 }}>♡</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '14px 0 4px' }}>Central de Suporte · CBRio</h1>
          <p style={{ fontSize: 14, color: C.text2, margin: 0 }}>
            Ajuda para os aplicativos da Igreja CBRio (Membros e Portal do Colaborador — CBRio Staff).
          </p>
        </header>

        <div style={{ background: C.card, border: `1px solid ${C.primary}55`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Fale com a gente</h2>
          <p style={{ fontSize: 13, color: C.text2, margin: '0 0 14px', lineHeight: 1.55 }}>
            Tem dúvida, problema de acesso ou precisa de ajuda com o app? Entre em contato — respondemos em dias úteis.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <a href={`mailto:${EMAIL_SUPORTE}?subject=Suporte%20app%20CBRio`}
              style={{ background: C.primary, color: '#04241f', fontWeight: 700, textDecoration: 'none', padding: '11px 18px', borderRadius: 10, fontSize: 14 }}>
              E-mail: {EMAIL_SUPORTE}
            </a>
            <a href={`https://wa.me/${WHATS}`} target="_blank" rel="noreferrer"
              style={{ background: 'transparent', color: C.text, fontWeight: 600, textDecoration: 'none', padding: '11px 18px', borderRadius: 10, fontSize: 14, border: `1px solid ${C.border}` }}>
              WhatsApp
            </a>
          </div>
        </div>

        {secao('Acesso ao app', [
          { p: 'Como entro?', d: 'Use o seu e-mail institucional (@cbrio.org) e a senha cadastrada. No CBRio Staff, o acesso é para colaboradores da igreja.' },
          { p: 'Esqueci a senha / não consigo entrar', d: `Envie um e-mail para ${EMAIL_SUPORTE} com o seu nome e e-mail que redefinimos o acesso.` },
          { p: 'Face ID', d: 'Depois do primeiro login, você pode ativar o Face ID para entrar mais rápido no mesmo aparelho.' },
        ])}

        {secao('Dúvidas frequentes', [
          { p: 'Para quem é o app CBRio Staff?', d: 'É um app interno da Igreja CBRio, para colaboradores e voluntários da equipe acompanharem suas informações e tarefas.' },
          { p: 'Meus dados estão seguros?', d: 'Sim. Os dados são usados apenas para a operação interna da igreja e não são compartilhados para publicidade.' },
          { p: 'Encontrei um erro no app', d: `Descreva o que aconteceu (e uma captura de tela, se possível) e envie para ${EMAIL_SUPORTE}.` },
        ])}

        <footer style={{ textAlign: 'center', color: C.text2, fontSize: 12, marginTop: 24 }}>
          Igreja Comunidade Batista do Rio · CBRio · {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}
