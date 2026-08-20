# Módulo `integracao`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Telas (ERP)
| rota | arquivo | nível |
|---|---|---|
| `/integracao/coleta` | `src/pages/ministerial/coleta/ColetaCulto` | 2 |
## Backend
- `backend/routes/integracao.js`
Guard: `authorizeModule('integracao', 1 | 2 | 3)`
<details><summary>Endpoints (14)</summary>
- `GET /api/integracao/coleta/cultos-abertos`
- `GET /api/integracao/coleta/minhas`
- `GET /api/integracao/coleta/pendentes`
- `GET /api/integracao/cron/gerar-cultos-recorrentes`
- `GET /api/integracao/dashboard`
- `GET /api/integracao/decisoes-app`
- `GET /api/integracao/historico-anual`
- `GET /api/integracao/historico-batismos`
- `GET /api/integracao/kpis/taticos`
- `POST /api/integracao/coleta`
- `POST /api/integracao/coleta/:id/aprovar`
- `POST /api/integracao/coleta/:id/rejeitar`
- `POST /api/integracao/decisoes-app/:id/confirmar`
- `POST /api/integracao/decisoes-app/:id/descartar`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/cronAuth.js`
- `backend/utils/isoWeek.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/notificar.js`

**Tabelas que estas rotas tocam**

- `app_decisoes`
- `batismo_inscricoes`
- `cultos`
- `cultos_dados_submissoes`
- `cultos_decisoes_pessoas`
- `kpi_indicadores_taticos`
- `mem_trilha_valores`
- `profiles`
- `vw_batismo_historico_anual`
- `vw_culto_historico_anual`
- `vw_kpi_trajetoria_atual`

**RPCs**

- `gerar_cultos_recorrentes`

**Namespace no front (src/api.js)**

- `integracao`

