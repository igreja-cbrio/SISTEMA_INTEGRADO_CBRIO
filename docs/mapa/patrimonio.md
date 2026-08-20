# Módulo `patrimonio`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/patrimonio.js`
Guard: `authorizeModule('patrimonio', 3 | 4 | padrão)`
<details><summary>Endpoints (38)</summary>
- `DELETE /api/patrimonio/bens/:id`
- `DELETE /api/patrimonio/categorias/:id`
- `DELETE /api/patrimonio/localizacoes/:id`
- `GET /api/patrimonio/bens`
- `GET /api/patrimonio/bens/:id`
- `GET /api/patrimonio/bens/barcode/:codigo`
- `GET /api/patrimonio/bens/proximo-codigo`
- `GET /api/patrimonio/categorias`
- `GET /api/patrimonio/dashboard`
- `GET /api/patrimonio/dashboard/atividade`
- `GET /api/patrimonio/dashboard/depreciacao`
- `GET /api/patrimonio/dashboard/indicadores`
- `GET /api/patrimonio/inventarios`
- `GET /api/patrimonio/localizacoes`
- `GET /api/patrimonio/movimentacoes`
- `GET /api/patrimonio/revisao/aux/responsaveis`
- `GET /api/patrimonio/revisao/ciclos`
- `GET /api/patrimonio/revisao/convocacoes/:id`
- `GET /api/patrimonio/revisao/indicadores`
- `PATCH /api/patrimonio/inventarios/:id`
- `POST /api/patrimonio/bens`
- `POST /api/patrimonio/bens/:id/dispensar-alerta`
- `POST /api/patrimonio/bens/:id/movimentacoes`
- `POST /api/patrimonio/bens/bulk/baixa`
- `POST /api/patrimonio/bens/bulk/movimentar`
- `POST /api/patrimonio/bens/lote`
- `POST /api/patrimonio/categorias`
- `POST /api/patrimonio/inventarios`
- `POST /api/patrimonio/localizacoes`
- `POST /api/patrimonio/revisao/ciclos`
- `POST /api/patrimonio/revisao/convocacoes/:id/concluir`
- `POST /api/patrimonio/revisao/convocacoes/:id/iniciar`
- `PUT /api/patrimonio/bens/:id`
- `PUT /api/patrimonio/bens/bulk`
- `PUT /api/patrimonio/bens/bulk/renomear`
- `PUT /api/patrimonio/categorias/:id`
- `PUT /api/patrimonio/localizacoes/:id`
- `PUT /api/patrimonio/revisao/itens/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/patrimonioDepreciacao.js`
- `backend/utils/sanitize.js`
- `backend/utils/supabase.js`

**Tabelas que estas rotas tocam**

- `pat_bens`
- `pat_categorias`
- `pat_inventarios`
- `pat_localizacoes`
- `pat_movimentacoes`
- `pat_revisao_ciclos`
- `pat_revisao_convocacoes`
- `pat_revisao_itens`
- `profiles`

**RPCs**

- `pat_dashboard_indicadores`
- `pat_dashboard_stats`
- `pat_proximo_codigo_barras`
- `pat_recalcular_convocacao`
- `pat_registrar_movimentacao`

**Namespace no front (src/api.js)**

- `patrimonio`

