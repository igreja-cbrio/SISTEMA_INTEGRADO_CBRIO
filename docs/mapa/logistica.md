# Módulo `logistica`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/logistica.js`
Guard: `authorizeModule('logistica', padrão)`
<details><summary>Endpoints (51)</summary>
- `DELETE /api/logistica/compras/:id`
- `DELETE /api/logistica/estoque/produtos/:id`
- `DELETE /api/logistica/fornecedores/:id`
- `DELETE /api/logistica/itens/:id`
- `DELETE /api/logistica/notas/:id`
- `DELETE /api/logistica/pedidos/:id`
- `GET /api/logistica/compras`
- `GET /api/logistica/compras/:id/sugestoes-vinculo`
- `GET /api/logistica/compras/aux/centros-custo`
- `GET /api/logistica/compras/aux/compradores`
- `GET /api/logistica/compras/aux/plano-contas`
- `GET /api/logistica/compras/kpis`
- `GET /api/logistica/dashboard`
- `GET /api/logistica/estoque/consumo`
- `GET /api/logistica/estoque/lotes`
- `GET /api/logistica/estoque/movimentacoes`
- `GET /api/logistica/estoque/produtos`
- `GET /api/logistica/estoque/relatorio`
- `GET /api/logistica/fornecedores`
- `GET /api/logistica/notas`
- `GET /api/logistica/notas/:id/danfe`
- `GET /api/logistica/notas/:id/nfe`
- `GET /api/logistica/notas/aux/categorias`
- `GET /api/logistica/pedidos`
- `GET /api/logistica/pedidos/:id/itens`
- `PATCH /api/logistica/estoque/produtos/:id`
- `POST /api/logistica/compras`
- `POST /api/logistica/compras/:id/aprovar`
- `POST /api/logistica/compras/:id/desvincular`
- `POST /api/logistica/compras/:id/rejeitar`
- `POST /api/logistica/compras/:id/vincular`
- `POST /api/logistica/compras/escanear`
- `POST /api/logistica/compras/importar`
- `POST /api/logistica/estoque/gerar-compra`
- `POST /api/logistica/estoque/movimentacoes`
- `POST /api/logistica/estoque/produtos`
- `POST /api/logistica/fornecedores`
- `POST /api/logistica/fornecedores/:id/enriquecer`
- `POST /api/logistica/fornecedores/enriquecer-incompletos`
- `POST /api/logistica/notas`
- `POST /api/logistica/notas/:id/enviar-financeiro`
- `POST /api/logistica/notas/escanear`
- `POST /api/logistica/notas/importar-danfe`
- `POST /api/logistica/notas/importar-xml`
- `POST /api/logistica/pedidos`
- `POST /api/logistica/pedidos/:id/itens`
- `POST /api/logistica/pedidos/:id/recebimento`
- `PUT /api/logistica/compras/:id`
- `PUT /api/logistica/fornecedores/:id`
- `PUT /api/logistica/notas/:id`
- `PUT /api/logistica/pedidos/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/nfeArquivo.js`
- `backend/utils/nfeXml.js`
- `backend/utils/storagePath.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/anexosLogArquivos.js`
- `backend/services/comprasImporter.js`
- `backend/services/comprasMatch.js`
- `backend/services/comprasShared.js`
- `backend/services/finFaturas.js`
- `backend/services/fornecedorEnriquecer.js`
- `backend/services/mercadoLivreService.js`
- `backend/services/nfScanner.js`
- `backend/services/notificar.js`
- `backend/services/whatsappService.js`

**Tabelas que estas rotas tocam**

- `fin_centros_custo`
- `fin_plano_contas`
- `fin_transacoes`
- `log_compras`
- `log_estoque_movimentacoes`
- `log_estoque_produtos`
- `log_fornecedores`
- `log_notas_fiscais`
- `log_pedido_itens`
- `log_pedidos`
- `log_recebimentos`
- `profiles`
- `rh_funcionarios`
- `solicitacoes`
- `vw_log_estoque_saldo`

**RPCs**

- `app_soft_delete`

**Namespace no front (src/api.js)**

- `logistica`

