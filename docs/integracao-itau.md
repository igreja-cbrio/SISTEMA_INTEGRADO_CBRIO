# Integração Banco Itaú (Itaú for Developers)

Fundação da integração mTLS + OAuth com o **Itaú for Developers**, espelhando
o padrão já consolidado da integração Santander (`backend/services/santander/`).

> **Status:** fundação implementada (auth + health + log). Os produtos
> (Extrato, PIX, Boleto, Pagamentos) entram em iterações seguintes conforme
> forem **contratados/liberados** no portal Itaú e testados em homologação.

---

## 1. Pré-requisitos no portal Itaú (feito pelo Marcos/gerente — não por código)

A parte de **contratação e permissão é comercial/operacional do banco** e não
dá pra automatizar. Ordem correta no portal `devportal.itau.com.br`:

1. **Contratar/ativar os produtos** de API desejados (Extrato, PIX, Cobrança,
   Pagamentos). Sem produto contratado, a tela de gerar credencial bloqueia
   ("você não possui permissão para acessar esta página").
2. **Liberar o usuário** com perfil de **administrador** na gestão de credenciais
   (a conta titular/master da empresa precisa autorizar).
3. **Criar a credencial** → gera **Client ID + Client Secret**.
4. **Gerar token temporário** a partir do Client Secret.
5. **Gerar o certificado** (mTLS) usando Client ID + token temporário.
   - Válido por **365 dias** (renovar nos últimos 30 dias antes de expirar).
6. Guardar o certificado (`.crt`/`.pem`) + a **chave privada** (`.key`).

> Dois fluxos diferentes no portal: **Extrato / PIX Indireto / Câmbio** usam o
> *autosserviço de credenciais*; **PIX direto / Cobrança / Pagamentos** usam o
> *certificado dinâmico*. Cada produto pode exigir credencial própria.

Recomendação: começar pelo **Extrato em homologação** (só leitura, risco zero,
maior valor: conciliação automática de dízimos/ofertas).

---

## 2. Variáveis de ambiente (Vercel · backend)

Preencher quando tiver as credenciais. **Nunca** commitar no repositório —
o frontend não vê nenhuma destas (regra de segurança do projeto).

| Env | Obrigatória | Descrição |
|---|---|---|
| `ITAU_AMBIENTE` | sim | `homologacao` (default) ou `producao` |
| `ITAU_CLIENT_ID` | sim | Client ID da credencial (vai no header `x-itau-apikey`) |
| `ITAU_CLIENT_SECRET` | sim | Client Secret da credencial |
| `ITAU_CERT_PEM_BASE64` | sim | Certificado mTLS (PEM) **codificado em base64** |
| `ITAU_KEY_PEM_BASE64` | sim | Chave privada (PEM) **codificada em base64** |
| `ITAU_AGENCIA` | depois | Agência da conta CBRio (usada por extrato/pagamentos) |
| `ITAU_CONTA` | depois | Número da conta CBRio |
| `ITAU_CNPJ_TITULAR` | depois | CNPJ titular da conta |
| `ITAU_BASE_URL` | opcional | Override do host de API (default `https://api.itau.com.br`) |
| `ITAU_TOKEN_URL` | opcional | Override do endpoint OAuth (default `https://sts.itau.com.br/api/oauth/token`) |

### Como gerar o base64 do certificado e da chave

```bash
# Linux/macOS
base64 -w0 certificado.crt    # -> cola em ITAU_CERT_PEM_BASE64
base64 -w0 chave-privada.key  # -> cola em ITAU_KEY_PEM_BASE64

# macOS (sem -w0):
base64 -i certificado.crt | tr -d '\n'
```

> Se o Itaú entregar o certificado em `.pfx`/`.p12`, converter antes:
> ```bash
> openssl pkcs12 -in itau.pfx -clcerts -nokeys -out certificado.crt
> openssl pkcs12 -in itau.pfx -nocerts -nodes -out chave-privada.key
> ```

---

## 3. O que já está implementado (fundação)

- `backend/services/itau/httpClient.js` — autenticação **mTLS** (undici Agent via
  `dispatcher`) + **OAuth client_credentials** com cache de token (memória + DB),
  refresh automático no 401, header `x-itau-apikey` + `x-itau-correlationID`, e
  log de todas as chamadas.
- `backend/routes/itau.js` — montado em `/api/itau`:
  - `GET /api/itau/health` — checa config e tenta o handshake OAuth (mostra
    `missing_env` quando faltar credencial).
  - `GET /api/itau/log` — últimas 100 chamadas (financeiro ≥ 3).
- Migration `20260529060000_itau_integracao.sql` — `itau_oauth_tokens` +
  `itau_sync_log` (com RLS).
- Permissão: `ROUTE_MODULE_MAP['itau'] = ['financeiro']` (reusa o módulo
  Financeiro · sem módulo novo no menu).

### Validar quando as envs estiverem no Vercel

```
GET /api/itau/health
```
- Sem credenciais → `{ ok:false, configured:false, missing_env:[...] }`.
- Com credenciais OK → `{ ok:true, token_obtained:true }`.

---

## 4. Próximas iterações (quando o produto for liberado)

Espelhando o Santander, na ordem de menor risco → maior:

1. **Extrato** → `itau/contasService.js` + `GET /api/itau/extrato` +
   sync pra `fin_lancamentos_brutos` (conciliação). Respeitar a regra contábil:
   **empréstimo não é receita ordinária**.
2. **PIX recebimento** → detectar entradas (dízimos/ofertas).
3. **Boletos** → emissão de cobranças.
4. **Pagamentos** → mutação de saída de dinheiro. **Vai passar pela fila de
   aprovação humana** (`agent_queue`), igual ao agente financeiro — nada paga
   sozinho.
