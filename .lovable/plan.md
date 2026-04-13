

## Ajustes no Módulo de Membresia

### Problema
As tabelas do módulo (`mem_membros`, `mem_familias`, `mem_trilha_valores`, `mem_historico`) não existem no banco de dados. O formulário de criação/edição (`showForm`) não está implementado. O select de filtro de status é nativo HTML.

### Plano

**1. Criar as tabelas no banco de dados (migration)**

```sql
-- mem_familias
CREATE TABLE mem_familias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mem_familias ENABLE ROW LEVEL SECURITY;
-- RLS: authenticated full access

-- mem_membros
CREATE TABLE mem_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text,
  data_nascimento date,
  estado_civil text,
  endereco text,
  bairro text,
  cidade text,
  cep text,
  profissao text,
  ministerio text,
  grupo text,
  status text NOT NULL DEFAULT 'visitante',
  familia_id uuid REFERENCES mem_familias(id),
  foto_url text,
  observacoes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mem_membros ENABLE ROW LEVEL SECURITY;

-- mem_trilha_valores
CREATE TABLE mem_trilha_valores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid NOT NULL REFERENCES mem_membros(id) ON DELETE CASCADE,
  etapa text NOT NULL,
  concluida boolean NOT NULL DEFAULT false,
  data_conclusao date,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mem_trilha_valores ENABLE ROW LEVEL SECURITY;

-- mem_historico
CREATE TABLE mem_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid NOT NULL REFERENCES mem_membros(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mem_historico ENABLE ROW LEVEL SECURITY;
```

Com RLS policies de acesso completo para `authenticated` em todas as tabelas.

**2. Seed de dados iniciais**

Inserir ~8 membros de exemplo, 2 famílias, e algumas etapas da trilha para que o módulo já tenha dados visíveis.

**3. Implementar formulário de criação/edição (modal)**

No `Membresia.jsx`, criar o modal que abre com `showForm`:
- Campos: nome, email, telefone, data de nascimento, estado civil, endereço, bairro, cidade, CEP, profissão, ministério, grupo, status, família (select das famílias cadastradas), observações
- Modo edição: preenche com dados do membro selecionado
- Usa componentes shadcn (`Select`, `Input`, `Button`, `Dialog`)
- Ao salvar, chama `membresia.membros.create()` ou `.update()`

**4. Migrar select nativo para shadcn**

Substituir o `<select>` de filtro de status (linha 144-151) pelo componente `Select` do shadcn com valor sentinela `__all__`.

### Arquivos modificados
- **Migration SQL** — criação das 4 tabelas + RLS
- **Insert SQL** — seed de dados de exemplo
- **`src/pages/ministerial/Membresia.jsx`** — formulário modal completo + select shadcn no filtro

