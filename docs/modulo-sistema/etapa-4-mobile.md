# Módulo Sistema · Etapa 4 · Mobile

## Resultado

A operação mobile passa a ter uma superfície própria em `/sistema`, com
alternância explícita entre Android e iOS. O painel agrega somente metadados
operacionais e nunca devolve `user_id`, `session_id` ou `installation_id`.

## Fontes

| Fonte | Estado nesta etapa |
|---|---|
| `app_eventos` | conectada; contrato v2 aceito pelo backend |
| Expo Push | tickets persistidos sem token/conteúdo; recibos consultados sob ação do superadmin |
| Sentry Android/iOS | adaptadores prontos; dependem de projetos e token |
| Google Play Developer Reporting | fronteira e credenciais catalogadas; coleta de Android Vitals pendente |
| App Store Connect / MetricKit | fronteira e credenciais catalogadas; coleta nativa pendente |

## Contrato v2 de telemetria

O endpoint continua sendo `POST /api/app/telemetria`, aceita até 50 eventos e
mantém compatibilidade com o payload atual. Os novos campos são:

```json
{
  "event_id": "uuid",
  "session_id": "id aleatório por abertura",
  "installation_id": "id aleatório persistente, sem identidade",
  "build_number": "42",
  "os_version": "18.5",
  "device_model": "iPhone 15",
  "manufacturer": "Apple",
  "network_type": "wifi",
  "duration_ms": 842,
  "outcome": "success",
  "is_offline": false,
  "occurred_at": "2026-07-31T14:30:00.000Z"
}
```

`props` agora é uma allowlist. Campos como token, e-mail, senha, corpo de
requisição e query string são descartados. `endpoint` guarda somente o path.

## Semântica mínima recomendada ao aplicativo

| Evento | Tipo | Uso |
|---|---|---|
| `app_startup` | `acao` | startup e `duration_ms` |
| `network_error` | `erro` | falha de API, status/path seguros |
| `auth_error` / `session_expired` | `erro` | autenticação |
| `push_permission` / `push_received` / `push_opened` | `acao` | funil de push |
| `deep_link_opened` | `acao` | deep links |
| `journey_started` / `journey_completed` / `journey_abandoned` | `acao` | abandono |
| exceção JS/global | `erro` | `message` sanitizada e `fatal` |

Sem `session_id`, o painel não calcula crash-free nem abandono. Sem amostras de
startup, ele não afirma que o desempenho está saudável.

## Ativação

1. Aplicar `20260731143000_sistema_etapa4_mobile_operacao.sql`.
2. Publicar backend e frontend.
3. Configurar, quando disponíveis:
   - `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_ANDROID`,
     `SENTRY_PROJECT_IOS`;
   - `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_PACKAGE_NAME`;
   - `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_ID`,
     `APP_STORE_CONNECT_PRIVATE_KEY`.
4. Evoluir o app Expo para emitir o contrato v2.

Credenciais configuradas não ativam automaticamente leitura das lojas: Android
Vitals e MetricKit continuam marcados como fonte externa pendente até seus
adaptadores de coleta serem implementados e validados.
