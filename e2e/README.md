# Testes E2E (Playwright)

Suite de testes end-to-end que validam fluxos criticos da aplicacao em um
browser real (Chromium + iPhone 13 simulator por default).

## Como rodar

### Local

```bash
# 1. Subir o app local (em outra aba)
npm run dev

# 2. Rodar testes contra localhost:5173 (default)
npx playwright test

# 3. Ver relatorio HTML
npx playwright show-report e2e/.report
```

### Contra preview do Vercel

```bash
E2E_BASE_URL=https://crmcbrio-git-claude-improve-kpi-interface-pk6yx-cbr-io.vercel.app \
E2E_TEST_EMAIL=qa@cbrio.com.br \
E2E_TEST_PASSWORD=... \
npx playwright test
```

### CI (GitHub Actions)

Workflow `.github/workflows/e2e.yml` roda os testes automaticamente:
- Manual (Actions > E2E > Run workflow)
- Comentario `/qa` em PR (a ser implementado)

## Variaveis

| Var | Default | Descricao |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:5173` | URL base do app |
| `E2E_TEST_EMAIL` | - | Email do usuario de teste (admin) |
| `E2E_TEST_PASSWORD` | - | Senha do usuario de teste |

## Estrutura

```
e2e/
├── README.md              ← este arquivo
├── helpers/
│   └── auth.ts            ← login + outros helpers
├── tests/
│   ├── public.spec.ts     ← rotas publicas (login page, /next/inscrever)
│   ├── next.spec.ts       ← modulo NEXT (admin)
│   └── kpis.spec.ts       ← modulo KPIs (admin)
└── .report/               ← gerado: HTML + JSON
```

## Convenções

- **Dados de teste sempre com prefixo `_qa_`** (nome, email)
  para que possam ser limpos depois
- **Nao depende de dados pre-existentes** alem do user de teste
- **Cada teste e independente** (pode rodar isoladamente)
- **Cleanup**: cada `test()` deleta o que criou (no `afterEach`)
