# Módulo `apresentacoes`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/apresentacoes.js`
Guard: `authorizeModule('apresentacoes', 1 | 3 | 5)`
<details><summary>Endpoints (12)</summary>
- `DELETE /:id`
- `DELETE /:id/arquivos/:arquivoId`
- `GET `
- `GET /:id`
- `GET /:id/render`
- `GET /contexto/explorar-vault`
- `GET /contexto/ler-arquivo`
- `GET /uso/resumo`
- `POST `
- `POST /:id/arquivos`
- `POST /:id/gerar`
- `POST /:id/reset`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/supabase.js`

**Serviços**

- `backend/services/apresentacaoGenerator.js`
- `backend/services/cerebroContext.js`
- `backend/services/notificar.js`
- `backend/services/storageService.js`
- `backend/services/textExtractor.js`

**Tabelas que estas rotas tocam**

- `apresentacoes`
- `apresentacoes_arquivos`
- `apresentacoes_uso`
- `vw_apresentacoes_uso_mes`

**Namespace no front (src/api.js)**

- `apresentacoes`

