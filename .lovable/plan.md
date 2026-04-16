

## Plan: Atualizar cores dos passes Apple/Google Wallet (membro e voluntario)

### Problema
Os passes gerados para Apple Wallet e Google Wallet usam a cor antiga `#00B39D` (teal). O card na tela do app ja foi atualizado, mas o passe real que vai para a wallet continua com o design antigo.

### Mudancas

**1. `backend/services/appleWallet.js` — cores dos passes Apple**

- **Membro**: trocar `backgroundColor` de `rgb(0, 179, 157)` para `rgb(234, 227, 218)` (bege `#eae3da`), `foregroundColor` e `labelColor` para `rgb(64, 128, 151)` (azul escuro `#408097`)
- **Voluntario**: trocar `backgroundColor` para `rgb(64, 128, 151)` (azul escuro `#408097`), manter `foregroundColor` e `labelColor` brancos
- Gerar icones PNG separados por tipo (bege para membro, azul para voluntario) em vez de compartilhar os mesmos icones teal

**2. `backend/routes/publicMembresia.js` — Google Wallet membro**

- Linha 434: trocar `hexBackgroundColor: '#00B39D'` para `'#eae3da'`

**3. `backend/routes/voluntariado.js` — Google Wallet voluntario**

- Linha 259: trocar `hexBackgroundColor: '#00B39D'` para `'#408097'`

### Arquivos modificados
- `backend/services/appleWallet.js`
- `backend/routes/publicMembresia.js`
- `backend/routes/voluntariado.js`

