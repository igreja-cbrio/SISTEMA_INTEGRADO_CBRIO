# Módulo `next-batismo`
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
| `/entradas` | `src/pages/ministerial/NextBatismo` | 1 |
## Backend
- `backend/routes/nextBatismo.js`
Guard: `authorizeModule('next-batismo', 1 | 2 | 3)`
<details><summary>Endpoints (18)</summary>
- `GET /candidatos`
- `GET /duplicados`
- `GET /duplicados/adiados`
- `GET /duplicados/vizinhos`
- `GET /familias-pendentes`
- `GET /pessoa/:id`
- `GET /resolucoes`
- `GET /resumo`
- `GET /sem-vinculo`
- `POST /adiar-duplicata`
- `POST /adiar-em-lote`
- `POST /fundir`
- `POST /ignorar-duplicata`
- `POST /ignorar-familia`
- `POST /ligar`
- `POST /pessoa/:id/pedir-dados`
- `POST /reativar-duplicata`
- `POST /vincular-familia`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/paresDuplicados.js`
- `backend/utils/prontidaoCadastro.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/censoDisparo.js`
- `backend/services/duplicidadePolicy.js`
- `backend/services/familiaPolicy.js`
- `backend/services/fusaoCampos.js`
- `backend/services/identidadeProgressiva.js`
- `backend/services/membroMatch.js`

**Tabelas que estas rotas tocam**

- `batismo_inscricoes`
- `cui_convertidos`
- `cui_visitas`
- `entradas_pares_adiados`
- `entradas_resolucoes`
- `kids_responsaveis`
- `mem_contatos`
- `mem_duplicados_ignorados`
- `mem_familias`
- `mem_grupo_membros`
- `mem_identidade_observacoes`
- `mem_identidade_pares`
- `mem_membros`
- `mem_trilha_valores`
- `mem_voluntarios`
- `next_inscricoes`
- `next_matriculas`

**RPCs**

- `merge_membros`

