# Módulo Sistema · Etapa 3

## Estado

Implementada em código. A ativação depende das migrations das Etapas 2 e 3,
publicação do frontend/backend e configuração opcional do adaptador Sentry.

## Entregas

### Performance de campo

- coleta oficial via `web-vitals`;
- CLS, FCP, INP, LCP e TTFB;
- p75 por janela de sete dias;
- rota normalizada sem query string, usuário ou sessão;
- separação entre mobile, tablet e desktop;
- correlação por release;
- ausência de amostra aparece como desconhecida.

### Releases

- comparação de erros de API e Web Vitals por commit;
- release atual enviada ao Sentry quando disponível;
- nenhuma tabela duplicada de deploys;
- Vercel/GitHub continuam como fontes de verdade para o deploy completo.

### Segurança

- configuração conhecida separada de evidência observada;
- leitura real dos cabeçalhos de `/api/health`;
- HSTS, MIME sniffing, proteção contra frame e CSP;
- segredo/DSN nunca retornado ao frontend;
- sanitização reforçada do Sentry, com remoção de body, query, cookies,
  autorização e identificação pessoal.

### Sentry

- adaptador somente leitura;
- resumo de problemas não resolvidos;
- detalhes completos e replays continuam no Sentry;
- requer `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` e projetos;
- token precisa somente do escopo `event:read`.

### Sintéticos

- três jornadas públicas fixas: site, health da API e privacidade;
- somente requisições GET, sem entrada livre de URL e sem efeito colateral;
- tempo, HTTP, asserção, release e ator registrados;
- execução manual superadmin;
- histórico append-only.

## Banco

- `system_web_vitals`;
- `system_synthetic_runs`;
- RLS com leitura superadmin e escrita somente por `service_role`;
- nenhuma política de expurgo aplicada enquanto a retenção estiver pendente de
  decisão DPO.

## Ordem segura de ativação

1. aplicar a migration da Etapa 2;
2. aplicar `20260730113000_sistema_etapa3_web_observabilidade.sql`;
3. publicar backend e frontend;
4. validar `/api/health` e `/sistema`;
5. aguardar amostras reais de Web Vitals;
6. executar uma bateria sintética;
7. configurar o adaptador Sentry, se desejado.

## Variáveis opcionais

- `SYSTEM_PUBLIC_ORIGIN` — padrão `https://cbrio.org`;
- `SENTRY_AUTH_TOKEN`;
- `SENTRY_ORG`;
- `SENTRY_PROJECT_FRONTEND` ou `SENTRY_PROJECT`;
- `SENTRY_PROJECT_BACKEND`;
- `VITE_APP_RELEASE`.

## Critérios de saída

- [x] performance real e anônima;
- [x] p75 e limiares oficiais;
- [x] estabilidade por release;
- [x] segurança observada;
- [x] Sentry por adapter e sem cópia integral;
- [x] jornadas sintéticas sem efeito colateral;
- [x] sanitização de PII/secrets;
- [x] testes unitários;
- [ ] migrations aplicadas no ambiente;
- [ ] frontend/backend publicados;
- [ ] smoke test autenticado em produção.
