# Módulo `permissoes`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/permissoes.js`
Guard: `authorizeModule('permissoes', 4)`
<details><summary>Endpoints (17)</summary>
- `DELETE /api/permissoes/usuario/:id/modulo/:moduloId`
- `GET /api/permissoes/cargo/:id`
- `GET /api/permissoes/colaboradores`
- `GET /api/permissoes/diagnostico/:email`
- `GET /api/permissoes/estrutura`
- `GET /api/permissoes/matriz`
- `GET /api/permissoes/usuario-por-email/:email`
- `GET /api/permissoes/usuario/:id`
- `POST /api/permissoes/cache/bust`
- `POST /api/permissoes/criar-login`
- `POST /api/permissoes/usuario`
- `PUT /api/permissoes/matriz/celula`
- `PUT /api/permissoes/usuario/:id/areas`
- `PUT /api/permissoes/usuario/:id/cargo`
- `PUT /api/permissoes/usuario/:id/email`
- `PUT /api/permissoes/usuario/:id/modulo`
- `PUT /api/permissoes/usuario/:id/role`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/supabase.js`

**Tabelas que estas rotas tocam**

- `app_audit_log`
- `app_super_admins`
- `areas`
- `cargo_modulo_permissao`
- `cargos`
- `mem_cadastros_pendentes`
- `mem_membros`
- `modulos`
- `permissoes_escopo_extra`
- `permissoes_modulo`
- `profiles`
- `rh_funcionarios`
- `setores`
- `usuario_areas`
- `usuarios`
- `vol_profiles`

**RPCs**

- `app_soft_delete`

**Namespace no front (src/api.js)**

- `permissoes`

