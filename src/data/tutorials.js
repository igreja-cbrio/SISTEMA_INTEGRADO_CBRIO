// Definições dos tutoriais guiados (onboarding)
//
// Cada tour tem:
//   id              · identificador único (slug) · vira chave em app_tutorial_progress
//   name            · título exibido (debug + botão "Refazer")
//   route           · pathname (string) ou matcher (regex) que dispara o tour
//   waitFor         · seletor que precisa existir no DOM antes de iniciar (opcional)
//   delay           · ms de espera após a rota carregar (default 600)
//   qualifies(auth) · função pra decidir se o user (pelas permissões) tem direito
//   steps           · array de passos no formato react-joyride
//
// Os steps usam `target: '[data-tour="..."]'` · marque os elementos no JSX com
// o atributo `data-tour` correspondente.

const STEP_DEFAULTS = {
  disableBeacon: true,
  disableOverlayClose: false,
  spotlightClicks: false,
};

function s(step) {
  return { ...STEP_DEFAULTS, ...step };
}

export const TUTORIALS = [
  // ─────────────────────────────────────────────────────────────────────
  // 1 · Boas-vindas · todo usuário staff vê na primeira vez no /dashboard
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'welcome',
    name: 'Boas-vindas ao sistema',
    route: '/dashboard',
    qualifies: (auth) => !auth.isVoluntario && !auth.isMembroOnly,
    steps: [
      s({
        target: 'body',
        placement: 'center',
        title: 'Bem-vindo ao Sistema CBRio',
        content: 'Vou te mostrar rapidinho como tudo funciona. São 5 passos · menos de 1 minuto.',
      }),
      s({
        target: '[data-tour="megamenu"]',
        placement: 'bottom',
        title: 'Menu principal',
        content: 'Tudo que você pode acessar está aqui em cima. Os módulos aparecem conforme suas permissões.',
      }),
      s({
        target: '[data-tour="search"]',
        placement: 'bottom',
        title: 'Busca rápida',
        content: 'Clique aqui ou use ⌘K (Ctrl+K) pra pular direto pra qualquer página ou pessoa.',
      }),
      s({
        target: '[data-tour="notifications"]',
        placement: 'bottom',
        title: 'Notificações',
        content: 'Pendências, aprovações e avisos importantes aparecem aqui. O número vermelho mostra quantas estão sem ler.',
      }),
      s({
        target: '[data-tour="user-menu"]',
        placement: 'bottom-end',
        title: 'Seu perfil',
        content: 'Foto, cargo, senha e tutoriais. Pode refazer este tour quando quiser indo no perfil.',
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 2 · Painel CBRio · NSM, mandalas, matriz
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'painel',
    name: 'Painel CBRio',
    route: '/painel',
    qualifies: (auth) => auth.canPainel || auth.isAdmin,
    steps: [
      s({
        target: 'body',
        placement: 'center',
        title: 'Painel CBRio',
        content: 'Aqui você vê a saúde da igreja em tempo real · NSM, mandalas de valores e KPIs por área.',
      }),
      s({
        target: '[data-tour="painel-nsm"]',
        placement: 'bottom',
        title: 'NSM · estrela-guia',
        content: 'Mede quantos novos convertidos engajaram em pelo menos 1 valor da CBRio em até 60 dias. Click pra ver a lista de pessoas.',
      }),
      s({
        target: '[data-tour="painel-matriz"]',
        placement: 'top',
        title: 'Matriz Valor × Área',
        content: 'Cada célula mostra o desempenho de uma área num valor da Jornada. Verde = ok, amarelo = atenção, vermelho = crítico. Click pra explorar.',
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 3 · Minha Área · KPIs filtrados por área/valor
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'minha-area',
    name: 'Minha Área',
    route: '/minha-area',
    qualifies: (auth) => auth.canKPIs || auth.isAdmin,
    steps: [
      s({
        target: 'body',
        placement: 'center',
        title: 'Minha Área',
        content: 'Aqui ficam só os indicadores da sua área. Use pra acompanhar o que você lidera.',
      }),
      s({
        target: '[data-tour="minha-area-kpis"]',
        placement: 'top',
        title: 'Seus KPIs',
        content: 'Cada cartão mostra um indicador com o valor atual e a meta. Click pra ver histórico e trajetória.',
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 4 · Eventos · cards, kanban, ciclo criativo
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'eventos',
    name: 'Eventos',
    route: '/eventos',
    qualifies: (auth) => auth.canAgenda || auth.isAdmin,
    steps: [
      s({
        target: 'body',
        placement: 'center',
        title: 'Módulo Eventos',
        content: 'Aqui você cadastra cultos, conferências e eventos. Cada um tem ciclo criativo com tarefas por área.',
      }),
      s({
        target: '[data-tour="eventos-novo"]',
        placement: 'bottom',
        title: 'Criar evento',
        content: 'Clique aqui pra cadastrar um novo evento. Você escolhe categoria, data e o ciclo criativo gera as tarefas automaticamente.',
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 5 · Projetos · kanban, gantt, timeline
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'projetos',
    name: 'Projetos',
    route: '/projetos',
    qualifies: (auth) => auth.canProjetos || auth.isAdmin,
    steps: [
      s({
        target: 'body',
        placement: 'center',
        title: 'Módulo Projetos',
        content: 'Gerencie projetos estratégicos com kanban, gantt e timeline. Cada projeto tem responsável, líder e tarefas.',
      }),
      s({
        target: '[data-tour="projetos-tabs"]',
        placement: 'bottom',
        title: 'Visualizações',
        content: 'Alterne entre kanban (status), lista (tabela), gantt (cronograma) e timeline (visão temporal).',
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 6 · Membresia · cadastros, jornada, duplicados
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'membresia',
    name: 'Membresia',
    route: '/ministerial/membresia',
    qualifies: (auth) => auth.canMembresia || auth.isAdmin,
    steps: [
      s({
        target: 'body',
        placement: 'center',
        title: 'Módulo Membresia',
        content: 'Cadastros, jornada nos 5 valores, famílias, grupos e detecção de duplicados.',
      }),
      s({
        target: '[data-tour="membresia-tabs"]',
        placement: 'bottom',
        title: 'Abas',
        content: 'Navegue entre Membros, Jornada (5 valores), Duplicados (merge), Famílias e Cadastros pendentes.',
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 7 · Cuidados · acompanhamento pastoral
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'cuidados',
    name: 'Cuidados',
    route: '/ministerial/cuidados',
    qualifies: (auth) => auth.canCuidados || auth.isAdmin,
    steps: [
      s({
        target: 'body',
        placement: 'center',
        title: 'Módulo Cuidados',
        content: 'Acompanhamento pastoral · pedidos, encontros Jornada 180 e convertidos. Aqui também ficam os devocionais.',
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 8 · Integração · cultos, decisões, batismos
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'integracao',
    name: 'Integração',
    route: '/ministerial/integracao',
    qualifies: (auth) => {
      if (auth.isAdmin) return true;
      const integ = auth.modulePerms?.integracao;
      return (integ?.leitura || 0) >= 1 || auth.canMembresia;
    },
    steps: [
      s({
        target: 'body',
        placement: 'center',
        title: 'Módulo Integração',
        content: 'Preencha dados dos cultos · frequência, decisões, batismos. Esses números alimentam os KPIs automaticamente.',
      }),
      s({
        target: '[data-tour="integracao-tabs"]',
        placement: 'bottom',
        title: 'Abas',
        content: 'Cultos (calendário), Frequência, Decisões (pessoas decididas), Batismos e Histórico de longo prazo.',
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 9 · Financeiro
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'financeiro',
    name: 'Financeiro',
    route: '/admin/financeiro',
    qualifies: (auth) => auth.canFinanceiro || auth.isAdmin,
    steps: [
      s({
        target: 'body',
        placement: 'center',
        title: 'Módulo Financeiro',
        content: 'Contas a pagar, classificação de transações, conciliação, alertas e fila do agente executor.',
      }),
    ],
  },
];

// Encontra o tour aplicável pra uma rota e usuário
export function findTourForRoute(pathname, auth) {
  return TUTORIALS.find((t) => {
    if (t.route instanceof RegExp) {
      if (!t.route.test(pathname)) return false;
    } else if (t.route !== pathname) {
      return false;
    }
    try {
      return t.qualifies(auth);
    } catch {
      return false;
    }
  });
}

export function getTourById(id) {
  return TUTORIALS.find((t) => t.id === id);
}

// Lista de tours que o user qualifica · usado no Perfil pra mostrar "Refazer"
export function getQualifyingTours(auth) {
  return TUTORIALS.filter((t) => {
    try { return t.qualifies(auth); } catch { return false; }
  });
}
