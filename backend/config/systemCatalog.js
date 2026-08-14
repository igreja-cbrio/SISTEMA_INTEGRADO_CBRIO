const SERVICES = [
  { id: 'erp-web', name: 'CBRio ERP', surface: 'web', runtime: 'Vercel', state: 'cataloged' },
  { id: 'api', name: 'API CBRio', surface: 'api', runtime: 'Vercel Functions', state: 'cataloged' },
  { id: 'site-publico', name: 'Site público', surface: 'web', runtime: 'Vercel', state: 'cataloged' },
  { id: 'app-membros', name: 'App de membros', surface: 'mobile', runtime: 'Android / iOS', state: 'partial' },
  { id: 'app-staff', name: 'App CBRio Staff', surface: 'mobile', runtime: 'Android / iOS', state: 'partial' },
  { id: 'database', name: 'Banco, Auth e Storage', surface: 'data', runtime: 'Supabase', state: 'cataloged' },
  { id: 'agent-worker', name: 'Worker de agentes', surface: 'worker', runtime: 'Railway', state: 'external_pending' },
  { id: 'observability', name: 'Erros e performance', surface: 'observability', runtime: 'Sentry', state: 'external_pending' },
];

const ALERT_POLICY_DEFAULT = Object.freeze({
  enabled: true,
  threshold: 3,
  recoveryThreshold: 2,
  severity: 'warning',
  ownerLabel: 'Tecnologia e responsavel do modulo',
  runbook: 'Abra Sistema, correlacione o request ID com o Sentry e valide a dependencia da rotina antes de reexecutar.',
  runbookUrl: '/sistema?view=incidents',
});

const ALERT_POLICY_BY_CATEGORY = Object.freeze({
  platform: {
    threshold: 3, severity: 'critical', ownerLabel: 'Tecnologia',
    runbook: 'Valide API, Vercel, Supabase e o release atual; use o request ID para localizar a causa no Sentry.',
  },
  payments: {
    threshold: 2, severity: 'error', ownerLabel: 'Financeiro e Tecnologia',
    runbook: 'Confira Asaas e Mercado Pago, identifique a etapa que falhou e nao reenvie cobrancas sem reconciliar o estado.',
  },
  finance: {
    threshold: 2, severity: 'error', ownerLabel: 'Financeiro e Tecnologia',
    runbook: 'Confira credenciais e disponibilidade bancaria; antes de repetir, valide se os lancamentos ja foram importados.',
  },
  data: {
    threshold: 3, severity: 'error', ownerLabel: 'Tecnologia e Dados',
    runbook: 'Valide Supabase e a origem dos dados; confira contagens e duplicidade antes de repetir a rotina.',
  },
  agents: {
    threshold: 3, severity: 'warning', ownerLabel: 'Tecnologia e dono do agente',
    runbook: 'Valide a fila, o worker Railway e o provedor de IA; confirme idempotencia antes de reprocessar.',
  },
});

function alertPolicyFor(path, category) {
  const categoryPolicy = ALERT_POLICY_BY_CATEGORY[category] || {};
  const healthOverride = path === '/api/health'
    ? { threshold: 3, severity: 'critical', ownerLabel: 'Tecnologia' }
    : {};
  return { ...ALERT_POLICY_DEFAULT, ...categoryPolicy, ...healthOverride };
}

const JOBS = [
  ['/api/health', '*/5 * * * *', 'platform'],
  // ⚠️ ENTROU NO CATÁLOGO EM 11/08/2026 e o motivo é a lição do próprio caso:
  // este cron existia no vercel.json, era interceptado pelo `authenticate` do
  // `routes/sistema.js` e levava 401 a cada 15 minutos — invisível, porque cron
  // fora do catálogo não tem política de alerta e não abre incidente. Resultado
  // medido: 0 de 4.509 tickets de push com `receipt_status`, dois meses depois
  // de um conserto que acreditou ter resolvido isso.
  ['/api/sistema/cron/push-receipts', '*/15 * * * *', 'platform'],
  ['/api/sistema/cron/incident-triage', '*/5 * * * *', 'agents'],
  ['/api/voluntariado/cron/emails', '*/5 * * * *', 'volunteers'],
  ['/api/pagamentos-webhook/cron/tick', '*/10 * * * *', 'payments'],
  ['/api/totem-kids/cron/age-out', '0 5 * * *', 'kids'],
  ['/api/totem-kids/cron/encerrar-vencidas', '0 6 * * *', 'kids'],
  ['/api/totem-kids/cron/resumo-kids', '0 * * * *', 'kids'],
  ['/api/integracao/cron/gerar-cultos-recorrentes', '0 4 1 * *', 'ministry'],
  ['/api/cerebro/processar', '0 3 * * *', 'data'],
  ['/api/cerebro/sync-erp', '30 3 * * *', 'data'],
  ['/api/governanca/cron/lembrete', '0 10 * * 1', 'governance'],
  ['/api/public/grupos/cron/frequencia-mensal', '0 15 28 * *', 'groups'],
  ['/api/kpis/cultos/auto-create', '5 3 * * 0', 'ministry'],
  ['/api/processos/cron/coletar', '0 4 * * *', 'data'],
  ['/api/jornada/cron/refresh-papeis', '0 5 * * *', 'data'],
  // ⚠️ `/api/wifi/cron/sync` SAIU em 13/08/2026 junto com o cron do
  // vercel.json (o portal cativo foi desativado · última conexão 26/06). Ele
  // vinha FALHANDO 3×/semana desde 02/08 com 42P10 — `ON CONFLICT (tipo,
  // membro_id, membro_conflito_id) WHERE status='pendente'` de
  // `fn_wifi_processar_vinculos` deixou de casar quando a migration
  // 20260731120000 acrescentou `AND tipo <> 'inscricao_sem_vinculo'` ao índice
  // `uniq_identidade_pendencia_aberta`. Conferido no catálogo: aquela função é
  // a ÚNICA viva com esse ON CONFLICT, então o defeito morre com o cron.
  // ⚠️ Reativar o WiFi exige consertar o predicado ANTES de repor o cron aqui.
  ['/api/online/cron/sync', '0 6 * * *', 'online'],
  ['/api/online/cron/ds-collect', '0 10 * * *', 'online'],
  ['/api/online/cron/ddus-collect', '30 10 * * *', 'online'],
  ['/api/online/cron/subs-collect', '0 11 * * *', 'online'],
  ['/api/online/cron/trafego-collect', '30 11 * * *', 'online'],
  ['/api/online/cron/retencao-curva-collect', '0 12 * * *', 'online'],
  ['/api/online/cron/sub-status-collect', '30 12 * * *', 'online'],
  ['/api/online/cron/catch-up?limit=20', '0 13 * * *', 'online'],
  ['/api/online/cron/engajamento-collect', '45 12 * * *', 'online'],
  ['/api/online/cron/verificar', '0 14 * * *', 'online'],
  ['/api/devocional-planos/cron/enviar-diario', '0 9 * * *', 'communication'],
  ['/api/public/grupos/cron/whatsapp-fila', '0 * * * *', 'communication'],
  ['/api/comunicacao/cron/agendamentos', '5 * * * *', 'communication'],
  ['/api/devocional-planos/cron/lancar-semanal', '0 8 * * 1', 'communication'],
  ['/api/financeiro/alertas/cron-gerar', '0 8 * * *', 'finance'],
  ['/api/rh/cron/nao-pagos', '0 12 10 * *', 'people'],
  ['/api/santander/cron/sync', '0 5 * * *', 'finance'],
  ['/api/kpis/v2/cron/coletar', '0 7 * * *', 'data'],
  ['/api/whatsapp-grupos/cron/diario', '0 12 * * *', 'communication'],
  ['/api/voluntariado/cron/antecedentes', '0 8 * * *', 'volunteers'],
  ['/api/voluntariado/cron/sync', '0 * * * *', 'volunteers'],
  ['/api/face/cron/expurgo', '0 4 * * *', 'facial'],
  ['/api/whatsapp-cron/aniversarios', '0 12 * * *', 'communication'],
  ['/api/whatsapp-cron/batismos-lembrete', '0 21 * * *', 'communication'],
  ['/api/notificacoes/cron/alerta-culto-dados', '0 13 * * 1', 'data'],
  ['/api/monitor-automacoes/cron/checar', '0 11 * * *', 'platform'],
  ['/api/agente-primeiro-contato/cron/enfileirar', '5 11 * * *', 'agents'],
  ['/api/agente-voluntariado/cron/checar', '10 11 * * *', 'agents'],
  ['/api/agente-batismo-next/cron/enfileirar', '15 11 * * *', 'agents'],
].map(([path, schedule, category]) => ({
  id: `vercel:${path}`,
  name: path.split('?')[0].split('/').filter(Boolean).slice(-2).join(' · '),
  provider: 'Vercel Cron',
  path,
  schedule,
  category,
  alertPolicy: alertPolicyFor(path, category),
  executionState: 'awaiting_canonical_runs',
}));

const WORKFLOWS = [
  'criar-usuarios.yml',
  'deploy-vercel.yml',
  'e2e.yml',
  'online-live-monitor.yml',
  'resumo-merge-email.yml',
  'santander-cron-sync.yml',
  'santander-pix-realtime.yml',
  'santander-saldo-monitor.yml',
  'solicitacoes-ml-tracker.yml',
  'system-report.yml',
].map((file) => ({
  id: `github:${file}`,
  name: file.replace(/\.yml$/, ''),
  provider: 'GitHub Actions',
  file,
  executionState: 'external_pending',
}));

const INTEGRATIONS = [
  ['supabase', 'Supabase', 'platform', 'connected'],
  ['vercel', 'Vercel', 'platform', 'connected'],
  ['github', 'GitHub', 'platform', 'external_pending'],
  ['sentry', 'Sentry', 'observability', 'external_pending'],
  ['railway', 'Railway', 'platform', 'external_pending'],
  // ⚠️ Credenciais seguem válidas e o sync MANUAL (`POST /api/wifi/sync`,
  // superadmin) continua sendo a porta de reativação — mas a COLETA AUTOMÁTICA
  // está desligada desde 13/08/2026 e a integração não alimenta mais nada
  // sozinha. Ver o comentário do cron removido em JOBS.
  ['wifi-supabase', 'Supabase externo do Wi-Fi', 'wifi', 'connected'],
  ['meta-whatsapp', 'WhatsApp Cloud API / Meta', 'communication', 'connected'],
  ['microsoft-graph', 'Microsoft Graph / SharePoint', 'communication', 'connected'],
  ['resend', 'Resend', 'communication', 'connected'],
  ['web-push', 'Web Push / VAPID', 'communication', 'connected'],
  ['expo-push', 'Expo Push', 'mobile', 'connected'],
  ['youtube', 'YouTube Data / Analytics', 'content', 'connected'],
  ['api-bible', 'API.Bible', 'content', 'connected'],
  ['elevenlabs', 'ElevenLabs', 'ai', 'connected'],
  ['openai', 'OpenAI', 'ai', 'connected'],
  ['anthropic', 'Anthropic', 'ai', 'connected'],
  ['santander', 'Santander', 'finance', 'connected'],
  ['asaas', 'Asaas', 'finance', 'connected'],
  ['mercado-livre', 'Mercado Livre', 'operations', 'connected'],
  ['planning-center', 'Planning Center', 'volunteers', 'connected'],
  ['infosimples', 'Infosimples', 'operations', 'connected'],
  ['apple-wallet', 'Apple Wallet', 'mobile', 'connected'],
  ['google-wallet', 'Google Wallet', 'mobile', 'connected'],
  ['google-play', 'Google Play / Android Vitals', 'mobile', 'external_pending'],
  ['app-store', 'App Store / MetricKit', 'mobile', 'external_pending'],
].map(([id, name, category, state]) => ({ id, name, category, state }));

function getReleaseInfo(env = process.env) {
  const commit = env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA || null;
  return {
    commit,
    shortCommit: commit ? commit.slice(0, 8) : null,
    branch: env.VERCEL_GIT_COMMIT_REF || env.GIT_BRANCH || null,
    environment: env.VERCEL_ENV || env.NODE_ENV || 'development',
    deploymentUrl: env.VERCEL_URL || null,
    region: env.VERCEL_REGION || env.AWS_REGION || null,
  };
}

function getFoundationPayload(env = process.env) {
  return {
    generatedAt: new Date().toISOString(),
    contractVersion: 1,
    release: getReleaseInfo(env),
    catalog: {
      services: SERVICES,
      jobs: JOBS,
      workflows: WORKFLOWS,
      integrations: INTEGRATIONS,
    },
    counts: {
      services: SERVICES.length,
      jobs: JOBS.length,
      workflows: WORKFLOWS.length,
      integrations: INTEGRATIONS.length,
      canonicalRuns: 0,
    },
    boundaries: {
      executionRegistry: 'migration_required',
      incidents: 'planned',
      mobileNative: 'external_pending',
      biometrics: 'dpo_gate',
    },
  };
}

module.exports = {
  SERVICES,
  JOBS,
  WORKFLOWS,
  INTEGRATIONS,
  ALERT_POLICY_DEFAULT,
  ALERT_POLICY_BY_CATEGORY,
  alertPolicyFor,
  getReleaseInfo,
  getFoundationPayload,
};
