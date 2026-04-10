

## Plano: Criar tabelas essenciais que faltam no banco de dados

### Diagnóstico

A **tabela `profiles` não existe** no banco de dados. O middleware `authenticate` consulta `profiles` em toda requisição autenticada — quando falha, o backend retorna 500 antes mesmo de chegar na rota de criar solicitação.

Tabelas existentes: `solicitacoes`, `log_fornecedores`, `log_movimentacoes`, `log_notas_fiscais`, `log_pedido_itens`, `log_pedidos`, `log_recebimentos`, `log_solicitacoes_compra`.

Tabelas que faltam (usadas pelo `authenticate` middleware):
- **`profiles`** — essencial, sem ela NENHUMA rota funciona
- **`modulos`** — listagem de módulos do sistema
- **`cargos`** — níveis de permissão por cargo
- **`usuarios`** — vínculo usuário ↔ cargo para permissões granulares
- **`permissoes_modulo`** — overrides de permissão por módulo
- **`areas`** e **`setores`** — estrutura organizacional
- **`usuario_areas`** — vínculo usuário ↔ áreas
- **`rh_funcionarios`** — usado no auto-sync de área do perfil

### Implementação

**Uma migration SQL** criando todas as tabelas com RLS:

1. **`profiles`** — id (FK auth.users), name, email, role (default 'assistente'), area, active (default true), created_at. Trigger para criar perfil automaticamente no signup.

2. **`setores`** — id, nome, ativo, created_at

3. **`areas`** — id, nome, setor_id (FK setores), ativo, created_at

4. **`cargos`** — id, nome, nivel_padrao_leitura (default 1), nivel_padrao_escrita (default 1), created_at

5. **`modulos`** — id, nome, ativo (default true), created_at. Seed com módulos: DP, Pessoas, Financeiro, Logística, Patrimônio, Membresia, TI, Agenda, Projetos, IA / Agentes, Tarefas, Comunicação.

6. **`usuarios`** — id, email, cargo_id (FK cargos), ativo (default true), created_at

7. **`permissoes_modulo`** — id, usuario_id (FK usuarios), modulo_id (FK modulos), nivel_leitura, nivel_escrita

8. **`usuario_areas`** — id, usuario_id (FK usuarios), area_id (FK areas), is_principal (default false)

9. **`rh_funcionarios`** — id, nome, cpf, email, telefone, cargo, area, tipo_contrato, data_admissao, data_demissao, salario, status (default 'ativo'), observacoes, created_at

10. **`rh_documentos`**, **`rh_treinamentos`**, **`rh_treinamentos_funcionarios`**, **`rh_ferias_licencas`** — tabelas de RH dependentes

RLS: todas com políticas permissivas para `authenticated`. Trigger `handle_new_user` para criar perfil automaticamente no registro.

### Nenhuma alteração de código

O backend e frontend já estão prontos — só faltam as tabelas no banco.

### Arquivos envolvidos

| Ação | Detalhe |
|------|---------|
| Migration SQL | Criar ~14 tabelas + trigger de perfil + seed de módulos |

