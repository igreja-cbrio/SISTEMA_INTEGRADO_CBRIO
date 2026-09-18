// ════════════════════════════════════════════════════════════════════════════
//  ENTRADA PRÓPRIA da página pública do censo (`censo.html`)
//
//  ⚠️⚠️ POR QUE UMA SEGUNDA ENTRADA (11/09/2026 · pedido do Marcos:
//  "podemos colocar para carregar apenas essa área do censo?")
//
//  A página do censo é a única do sistema aberta por CENTENAS DE CELULARES NO
//  MESMO MINUTO, no WiFi de um templo cheio. Servida pelo SPA do ERP, ela
//  obrigava cada aparelho a baixar o chunk de entrada inteiro — medido em
//  11/09: **1.051 KB (326 KB comprimidos)**, com AppShell, ícones, Radix,
//  react-query, sonner e Sentry. Nada disso é usado por quem só responde um
//  questionário, e com 500 pessoas o gargalo da coleta deixa de ser o servidor
//  (p95 de 94ms no teste de carga) e passa a ser o download.
//
//  Aqui montamos SÓ a página. As peças pesadas foram cortadas assim:
//   · sem `AuthProvider`/`api.js` → sem `@supabase/supabase-js` e sem sessão
//     aberta no load (o cliente HTTP é o `lib/censoApi`, que só faz `fetch`);
//   · sem `AppShell`, `sonner`, `react-query`, Sentry e menus;
//   · `MemoryRouter` em vez de `BrowserRouter`: esta página não navega para
//     lugar nenhum, e o roteador de memória evita puxar o histórico do DOM.
//
//  ⚠️ A URL NÃO MUDA: `/censo/p/<slug>` continua sendo o endereço impresso no
//  QR e no link curto `/r/censo`. Quem serve `censo.html` nesse caminho é o
//  rewrite do `vercel.json`. A rota equivalente segue existindo no `App.tsx`
//  como rede de segurança: se o rewrite sair, a página volta a ser servida pelo
//  SPA — mais pesada, mas viva.
// ════════════════════════════════════════════════════════════════════════════
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CensoPublica from './pages/public/CensoPublica';
import './index.css';

// O slug vem do CAMINHO (`/censo/p/censo-cbrio-2026`). `?slug=` existe para
// abrir a página direto pelo arquivo (`/censo.html?slug=...`), que é como ela é
// conferida num build local, sem o rewrite da Vercel no meio.
const doCaminho = window.location.pathname.match(/\/censo\/p\/([^/?#]+)/);
const slug = doCaminho
  ? decodeURIComponent(doCaminho[1])
  : new URLSearchParams(window.location.search).get('slug') || '';

// A busca (`?t=`, `?canal=`) é preservada: é o que identifica quem chegou pelo
// link pessoal ou pelo app.
const entrada = `/censo/p/${encodeURIComponent(slug)}${window.location.search}`;

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[entrada]}>
    <Routes>
      <Route path="/censo/p/:slug" element={<CensoPublica />} />
    </Routes>
  </MemoryRouter>,
);
