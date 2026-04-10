

## Plano: Corrigir botão "Criar Solicitação"

### Diagnóstico

O problema mais provável é que o `<form onSubmit>` dentro do `<DialogContent>` do Radix não dispara corretamente em certos casos — o Dialog intercepta o evento. Além disso, não há feedback visual (loading) no botão, então o usuário não sabe se algo está acontecendo.

### Correção

**Arquivo: `src/pages/Solicitacoes.jsx`**

1. **Trocar de `form onSubmit` para `onClick` no botão** — mais confiável dentro de Dialogs Radix. Remover a tag `<form>` e colocar `onClick={handleCreate}` diretamente no botão de submit
2. **Remover `e.preventDefault()`** do `handleCreate` (não será mais um evento de form)
3. **Adicionar estado `submitting`** para mostrar loading no botão e evitar duplo-clique
4. **Adicionar `console.error`** no catch para facilitar debug futuro

### Mudança concreta

```jsx
const [submitting, setSubmitting] = useState(false);

async function handleCreate() {
  try {
    setSubmitting(true);
    const payload = { ...form };
    if (payload.valor_estimado) payload.valor_estimado = parseFloat(payload.valor_estimado);
    else delete payload.valor_estimado;
    await api.create(payload);
    toast.success('Solicitação criada com sucesso!');
    setDialogOpen(false);
    setForm({ ... });
    load();
  } catch (e) {
    console.error('[SOLICITACOES] create error:', e);
    toast.error(e.message || 'Erro ao criar solicitação');
  } finally {
    setSubmitting(false);
  }
}

// No JSX: trocar <form> por <div>, botão com onClick
<Button onClick={handleCreate} disabled={!form.titulo || !form.categoria || submitting}>
  {submitting ? 'Criando...' : 'Criar Solicitação'}
</Button>
```

### Arquivo modificado

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Solicitacoes.jsx` | Trocar form submit por onClick, adicionar loading state |

