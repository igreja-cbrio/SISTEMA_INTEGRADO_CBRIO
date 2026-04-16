

## Plan: Corrigir erro "Unexpected token '{'" no MemberWalletPass

### Problema
Quando o usuario confirma o cadastro e o componente `MemberWalletPass` tenta chamar `/api/public/membresia/wallet/qr-token`, a resposta nao e JSON valido (provavelmente HTML de erro do Vercel ou resposta malformada), e `res.json()` lanca "Unexpected token '{'". O erro aparece cru para o usuario sem mensagem util.

### Causa raiz
As funcoes `walletQrToken`, `walletGoogle` e `walletApple` em `src/api.js` nao validam o `Content-Type` da resposta antes de chamar `res.json()`. Se o backend retornar HTML (404 do Vercel, erro de startup, rate limit HTML), o parse falha com mensagem criptica.

### Mudanca

**Arquivo: `src/api.js`** — linhas 585-620

Adicionar validacao de `Content-Type` antes de `res.json()` nos 4 metodos wallet (`walletVerify`, `walletQrToken`, `walletGoogle`, `walletApple`):

```javascript
walletQrToken: async (cpf, data_nascimento) => {
  const res = await fetch(`${API}/public/membresia/wallet/qr-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cpf, data_nascimento }),
  });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    if (ct.includes('application/json')) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    throw new Error(`Erro no servidor (HTTP ${res.status}). Tente novamente.`);
  }
  if (!ct.includes('application/json')) {
    throw new Error('Resposta inesperada do servidor. Tente novamente.');
  }
  return res.json();
},
```

Aplicar o mesmo padrao nos outros 3 metodos (`walletVerify`, `walletGoogle`, `walletApple` — exceto Apple que espera blob).

### Arquivo modificado
- `src/api.js`

