# Totem Kids · Plano de Sistema

> **Status**: rascunho de arquitetura · nada implementado ainda
> **Solicitante**: Eduardo (gestor) · pedido vindo do Marcos
> **Referência**: Planning Center Check-Ins (módulo que a CBRio usa hoje)
> **Hardware existente**: Impressora de etiquetas Brother (rede via cabo)
> **Data**: 2026-05-21
> **Nome do módulo**: **Totem Kids**
> **Localização no menu**: Ministerial → Totem Kids (junto com o Totem do Voluntariado)

## 1. Objetivo e escopo

Substituir o uso do **Planning Center Check-Ins** para o ministério Kids por um módulo nativo no SISTEMA_INTEGRADO_CBRIO. O Kids opera diferente do voluntariado:

- **Criança não é escalada antes**. Chega na hora.
- **Mãe/responsável** se identifica no totem, encontra a criança, imprime duas etiquetas (criança + responsável).
- **No retorno**, etiqueta do responsável precisa bater com a etiqueta da criança (mesmo código de segurança) para liberar a saída.
- Objetivo principal é **segurança da criança**: garantir que ela só sai com quem deixou ela.
- Subprodutos: contagem real de presença (alimenta `KID-01`), histórico por família, observações médicas/alergias acessíveis pro voluntário da sala.

**Fora do MVP**: app pra mãe fazer pré-check em casa (Church Center do PCO), background check de voluntários, integração com folha de presença escolar.

## 2. Cópia funcional do Planning Center Check-Ins

Mapa do que vamos reproduzir (UI/UX é nossa, funções idênticas):

| Função PCO | Cópia nossa | Prioridade |
|---|---|---|
| Estação **manned** (voluntário opera o totem) | sim | MVP |
| Estação **self-service** (mãe sozinha no totem) | sim | MVP |
| Estação **roster** (voluntário marca chegada já dentro da sala) | sim | MVP |
| Impressão dupla por check-in (etiqueta criança + recibo responsável) | sim | MVP |
| **Código de segurança** alfanumérico de 4 chars (novo a cada check-in) | sim | MVP |
| **Barcode** na etiqueta pra scan no checkout | sim | MVP |
| Match obrigatório entre etiqueta criança e responsável no pickup | sim | MVP |
| Restrição de informação sensível na etiqueta do responsável | sim | MVP |
| Cadastro de visitante on-the-spot | sim | MVP |
| **Salas/locations** com faixa etária e capacidade | sim | MVP |
| **Observações médicas / alergia** visíveis na etiqueta da criança | sim | MVP |
| Foto da criança no perfil (não na etiqueta · só pra conferência interna) | opcional · v2 | v2 |
| Conceito de **household** / **família** pra check-in em lote | sim (já temos `mem_familias`) | MVP |
| **Lista de responsáveis autorizados** a buscar a criança | sim | MVP |
| Override por supervisor (situações de emergência · vizinha, etc) | sim | MVP |
| Relatório de **head count** ao vivo por sala | sim | MVP |
| Relatório histórico de frequência | sim | MVP |
| Promoção automática de faixa etária por idade | v2 | v2 |
| App do responsável (Church Center) | v2 (talvez nunca) | v2 |
| Background check (Checkr) | fora do escopo | — |

## 3. LGPD · regras especiais para menores

Decisão já registrada em [migration 20260518150000_decisoes_kids_e_cutoff.sql](../supabase/migrations/20260518150000_decisoes_kids_e_cutoff.sql) e na memória do projeto:

> **Marcos**: "vamos salvar pelos dados do responsável dela e apenas o nome
> da criança. Crianças dificilmente seguirão a jornada então não devem
> afetar o NSM. Dados de criança são mais complicados pela LGPD."

Princípios:

1. **Criança NÃO vira `mem_membros`** automaticamente · vive numa tabela própria (`kids_criancas`) com dados mínimos.
2. CPF da criança **nunca** é coletado.
3. Telefone/email/endereço são do **responsável** (`mem_membros`), nunca da criança.
4. Foto da criança opcional e somente para reconhecimento operacional · **não vai pra etiqueta**.
5. Observações médicas (alergia, medicação) ficam guardadas, mas só aparecem em **etiqueta da criança** (que fica no corpo dela e com o voluntário) · nunca na etiqueta do responsável (que pode cair em qualquer lugar).
6. Acesso aos dados da criança é restrito ao módulo `kids` (cargo coordenador-kids, voluntários Kids ativos no dia).

## 4. Schema do banco

### 4.1 Tabelas novas (prefixo `kids_`)

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- kids_criancas · cadastro mínimo da criança
-- Dado pessoal mínimo. Não tem CPF. Não vira mem_membros automaticamente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.kids_criancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,                           -- "Davi", "Maria Clara"
  data_nascimento date,                          -- LGPD: pode ficar null se mãe não informar exato; usar mês/ano só
  sexo text CHECK (sexo IN ('M','F','outro')),
  familia_id uuid REFERENCES public.mem_familias(id) ON DELETE SET NULL,
  observacoes_medicas text,                      -- "Alergia a amendoim" — vai na etiqueta da criança
  necessidades_especiais text,                   -- "Usa aparelho auditivo, fala devagar"
  foto_url text,                                  -- opcional, controle interno
  visitante boolean NOT NULL DEFAULT false,       -- primeira visita · só vira false após pastoral confirmar
  ativo boolean NOT NULL DEFAULT true,
  observacoes_internas text,                      -- só admin/coord-kids vê
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kids_criancas_familia ON public.kids_criancas(familia_id)
  WHERE familia_id IS NOT NULL;
CREATE INDEX idx_kids_criancas_nome_trgm ON public.kids_criancas USING gin (nome gin_trgm_ops);
-- (assume pg_trgm já habilitado · usado em outros lugares do sistema)


-- ─────────────────────────────────────────────────────────────────────────────
-- kids_responsaveis · M:N entre criança e mem_membros
-- Quem pode entregar/buscar essa criança. Múltiplos por criança.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.kids_responsaveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crianca_id uuid NOT NULL REFERENCES public.kids_criancas(id) ON DELETE CASCADE,
  membro_id uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE RESTRICT,
  parentesco text CHECK (parentesco IN
    ('mae','pai','padrasto','madrasta','avo_a','tio_a','irmao_a','tutor','outro')),
  autorizado_buscar boolean NOT NULL DEFAULT true,    -- false = só está ligado, não pode pegar
  contato_emergencia boolean NOT NULL DEFAULT false,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(crianca_id, membro_id)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- kids_salas · salas físicas com capacidade e faixa etária
-- Espelha o conceito de "Location" do PCO. Configurado uma vez por templo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.kids_salas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,                     -- "Berçário", "Infantil 1"
  faixa_etaria_min_meses int NOT NULL,           -- 0
  faixa_etaria_max_meses int NOT NULL,           -- 24 (= 2 anos completos)
  capacidade int NOT NULL DEFAULT 30,
  cor text DEFAULT '#EC4899',                    -- usado na etiqueta colorida
  igreja_id uuid REFERENCES public.fase1_igrejas(id),   -- pra multi-campus
  ativo boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (faixa_etaria_min_meses <= faixa_etaria_max_meses)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- kids_sessoes · uma sessão de Kids dentro de um culto
-- Um culto domingo 10h tem 1 sessão Kids (que pode usar várias salas).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.kids_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  culto_id uuid NOT NULL REFERENCES public.cultos(id) ON DELETE CASCADE,
  abrir_em timestamptz NOT NULL,                 -- normalmente 30min antes do culto
  fechar_em timestamptz,                          -- null = ainda aberta
  encerrada_at timestamptz,                       -- quando coord encerrou (fecha contagem)
  status text NOT NULL DEFAULT 'agendada'
    CHECK (status IN ('agendada','aberta','encerrada','cancelada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(culto_id)
);
CREATE INDEX idx_kids_sessoes_status ON public.kids_sessoes(status, abrir_em);


-- ─────────────────────────────────────────────────────────────────────────────
-- kids_estacoes · um ponto físico (totem ou roster) com sua impressora
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.kids_estacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,                     -- "Totem Recepção 1"
  tipo text NOT NULL CHECK (tipo IN ('manned','self','roster')),
  sala_id uuid REFERENCES public.kids_salas(id),  -- só roster (estação fica na sala)
  printer_target text,                            -- IP:9100 da Brother, ou nome no driver Windows
  printer_modelo text DEFAULT 'QL-820NWB',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- kids_checkins · registro de presença · 1 por criança/sessão
-- Carrega o snapshot do responsável pra UI continuar funcionando se o
-- mem_membros for desativado depois.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.kids_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id uuid NOT NULL REFERENCES public.kids_sessoes(id) ON DELETE CASCADE,
  crianca_id uuid NOT NULL REFERENCES public.kids_criancas(id) ON DELETE RESTRICT,
  sala_id uuid NOT NULL REFERENCES public.kids_salas(id),
  estacao_checkin_id uuid REFERENCES public.kids_estacoes(id),

  -- Quem entregou a criança
  responsavel_checkin_id uuid REFERENCES public.mem_membros(id),
  responsavel_checkin_nome text NOT NULL,                  -- snapshot
  responsavel_checkin_telefone text,                       -- snapshot
  responsavel_checkin_parentesco text,                     -- snapshot (mae/pai/etc)

  -- Código de segurança · gerado no check-in, único pra esse evento
  codigo_seguranca text NOT NULL,                          -- 4 chars [A-HJ-NP-Z2-9]
  codigo_barras text NOT NULL,                             -- mesmo código mas codificado pra Code128

  checkin_at timestamptz NOT NULL DEFAULT now(),

  -- Checkout
  checkout_at timestamptz,                                  -- null = ainda na sala
  responsavel_checkout_id uuid REFERENCES public.mem_membros(id),
  responsavel_checkout_nome text,                           -- snapshot
  checkout_metodo text CHECK (checkout_metodo IN
    ('codigo_digitado','barcode_escaneado','responsavel_autorizado','override_supervisor')),
  override_motivo text,                                     -- obrigatório se checkout_metodo='override_supervisor'
  override_aprovado_por uuid REFERENCES public.profiles(id),

  -- Eventos extras durante a sessão
  observacoes_no_dia text,                                  -- "Chorou ao chegar", "Acidente no banheiro"
  fez_decisao_jesus boolean NOT NULL DEFAULT false,         -- voluntário marca · vira cultos_decisoes_pessoas tipo='kids'

  labels_impressas int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(sessao_id, crianca_id)
);
CREATE INDEX idx_kids_checkins_sessao ON public.kids_checkins(sessao_id);
CREATE INDEX idx_kids_checkins_aberto ON public.kids_checkins(sessao_id, sala_id)
  WHERE checkout_at IS NULL;
CREATE INDEX idx_kids_checkins_codigo ON public.kids_checkins(codigo_seguranca)
  WHERE checkout_at IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- kids_etiquetas_log · auditoria de cada impressão
-- Para suportar reimpressão (etiqueta rasgou) e diagnosticar problemas
-- de impressora.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.kids_etiquetas_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id uuid NOT NULL REFERENCES public.kids_checkins(id) ON DELETE CASCADE,
  estacao_id uuid REFERENCES public.kids_estacoes(id),
  tipo text NOT NULL CHECK (tipo IN ('crianca','responsavel','extra_responsavel')),
  conteudo_json jsonb NOT NULL,                  -- snapshot completo do que foi impresso
  reimpressao boolean NOT NULL DEFAULT false,
  motivo_reimpressao text,
  impressa_por uuid REFERENCES public.profiles(id),
  impressa_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'enviada'
    CHECK (status IN ('enviada','sucesso','falha')),
  erro text
);
CREATE INDEX idx_kids_etiquetas_log_checkin ON public.kids_etiquetas_log(checkin_id);
```

### 4.2 Tabelas reaproveitadas

- **`mem_membros`** · responsáveis das crianças. Já existe, tem `cpf`, `telefone`, `data_nascimento`, `familia_id`.
- **`mem_familias`** · agrupamento família. Já existe, é apenas (id, nome). Suficiente.
- **`cultos`** · sessão Kids amarra em culto via `kids_sessoes.culto_id`. Não muda nada na tabela `cultos`.
- **`vol_service_types`** · já tem `has_kids` (bool). Sessão Kids só é criada quando o tipo tem `has_kids=true`.
- **`vol_check_ins`** · check-in de **voluntários** do Kids (quem cuida das crianças) continua usando o módulo Voluntariado existente. NÃO MISTURAR.
- **`profiles`** · usuários do staff (quem opera o totem manned, quem aprova override).
- **`cultos_decisoes_pessoas`** · quando criança aceita Cristo durante a sessão Kids, voluntário marca em `kids_checkins.fez_decisao_jesus=true` → trigger cria registro em `cultos_decisoes_pessoas` com `tipo='kids'` (schema já suporta · ver migration `20260518150000`).

### 4.3 Views e funções

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- vw_kids_sessao_ao_vivo · estado atual de uma sessão (pra painel da coord)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE VIEW public.vw_kids_sessao_ao_vivo AS
SELECT
  s.id AS sessao_id,
  s.culto_id,
  c.data AS data_culto,
  c.nome AS culto_nome,
  s.status,
  sala.id AS sala_id,
  sala.nome AS sala_nome,
  sala.capacidade,
  COUNT(ci.*) FILTER (WHERE ci.checkout_at IS NULL)  AS criancas_presentes,
  COUNT(ci.*)                                          AS total_checkins,
  COUNT(ci.*) FILTER (WHERE ci.fez_decisao_jesus)      AS decisoes_jesus,
  ROUND(100.0 *
    COUNT(ci.*) FILTER (WHERE ci.checkout_at IS NULL)
    / NULLIF(sala.capacidade, 0)
  , 1) AS ocupacao_pct
FROM public.kids_sessoes s
JOIN public.cultos c ON c.id = s.culto_id
LEFT JOIN public.kids_checkins ci ON ci.sessao_id = s.id
LEFT JOIN public.kids_salas sala ON sala.id = ci.sala_id
WHERE s.status IN ('aberta','encerrada')
GROUP BY s.id, s.culto_id, c.data, c.nome, s.status, sala.id, sala.nome, sala.capacidade;


-- ─────────────────────────────────────────────────────────────────────────────
-- Função: gerar código de segurança (4 chars, sem ambíguos)
-- Alfabeto: A-Z menos {I, O} e 2-9 menos {0, 1} · 32 chars · 32^4 = 1.048.576
-- Refaz se já houver código ativo (checkout_at IS NULL) com esse valor
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_kids_gerar_codigo_seguranca()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  codigo text;
  tentativas int := 0;
BEGIN
  LOOP
    codigo := '';
    FOR i IN 1..4 LOOP
      codigo := codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM public.kids_checkins
      WHERE codigo_seguranca = codigo AND checkout_at IS NULL
    ) THEN
      RETURN codigo;
    END IF;

    tentativas := tentativas + 1;
    IF tentativas > 50 THEN
      RAISE EXCEPTION 'kids: não conseguiu gerar código único após 50 tentativas';
    END IF;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: ao fechar sessão (status='encerrada'), atualiza cultos.presencial_kids
-- pra alimentar fonte_auto do KPI KID-01 automaticamente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_kids_sessao_consolida_culto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total int;
BEGIN
  IF NEW.status = 'encerrada' AND (OLD.status IS DISTINCT FROM 'encerrada') THEN
    SELECT COUNT(*) INTO v_total
      FROM public.kids_checkins
      WHERE sessao_id = NEW.id;

    UPDATE public.cultos
      SET presencial_kids = v_total,
          updated_at = now()
      WHERE id = NEW.culto_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_kids_sessao_consolida
  AFTER UPDATE OF status ON public.kids_sessoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_kids_sessao_consolida_culto();


-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: ao marcar fez_decisao_jesus=true, cria cultos_decisoes_pessoas
-- com tipo='kids' (já existente) usando dados do responsável do check-in.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_kids_decisao_para_culto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_culto_id uuid;
  v_crianca_nome text;
BEGIN
  IF NEW.fez_decisao_jesus = true
     AND (OLD.fez_decisao_jesus IS DISTINCT FROM NEW.fez_decisao_jesus) THEN

    SELECT culto_id INTO v_culto_id
      FROM public.kids_sessoes WHERE id = NEW.sessao_id;
    SELECT nome INTO v_crianca_nome
      FROM public.kids_criancas WHERE id = NEW.crianca_id;

    INSERT INTO public.cultos_decisoes_pessoas (
      culto_id, tipo_decisao, nome,
      responsavel_nome, responsavel_telefone, responsavel_cpf
    )
    SELECT
      v_culto_id, 'kids', v_crianca_nome,
      NEW.responsavel_checkin_nome,
      NEW.responsavel_checkin_telefone,
      mm.cpf
    FROM public.mem_membros mm
    WHERE mm.id = NEW.responsavel_checkin_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_kids_decisao_para_culto
  AFTER UPDATE OF fez_decisao_jesus ON public.kids_checkins
  FOR EACH ROW EXECUTE FUNCTION public.fn_kids_decisao_para_culto();
```

### 4.4 Diagrama (texto)

```
                    ┌──────────────────┐
                    │   mem_familias    │
                    │   (id, nome)      │
                    └────────┬──────────┘
                             │ 1:N
            ┌────────────────┴───────────────┐
            ▼                                ▼
   ┌──────────────────┐               ┌──────────────────┐
   │   mem_membros     │   N:M         │  kids_criancas   │
   │   (responsavel)   │◀──────────────│  (criança)        │
   └──────────┬────────┘  kids_         └────────┬─────────┘
              │           responsaveis           │
              │                                  │
              │                                  ▼
              │                        ┌──────────────────┐
              │                        │  kids_checkins   │
              ▼                        │  (1 por sessão)  │
   ┌──────────────────┐                └────────┬─────────┘
   │ responsavel_     │                          │
   │ checkin_id (snap)│                          │
   └──────────────────┘                          ▼
                                       ┌──────────────────┐
                                       │  kids_sessoes    │
                                       └────────┬─────────┘
                                                │
                                                ▼
                                       ┌──────────────────┐
                                       │     cultos       │  ← alimenta presencial_kids
                                       └──────────────────┘     no encerrar
```

## 5. Fluxos de uso

### 5.1 Fluxo principal · check-in com mãe + voluntário (estação manned)

```
1. Voluntário operador abre o totem em /kids/checkin?estacao=<id>
   (autenticado · só staff Kids ou admin)
2. Sessão atual aparece automaticamente (kids_sessoes.status='aberta')
3. Mãe chega, voluntário pergunta o nome
4. Voluntário digita "Maria" no campo busca
   → backend faz fuzzy match em kids_criancas.nome
   → mostra cards: foto (se houver), nome, idade aproximada, sala sugerida,
     família (se vinculada)
5. Voluntário seleciona a criança certa
6. Mãe confirma: "Maria Clara, 4 anos" → ok
7. Sistema mostra: sala sugerida = "Infantil 1" (4-6 anos), capacidade 24/30
   - Voluntário pode trocar se necessário
8. Se há observação médica/alergia, aparece em destaque amarelo · "ATENÇÃO:
   alergia a amendoim"
9. Voluntário pergunta: "Quem está trazendo ela hoje?" · valida no app o
   responsável (mostra os 3 cadastrados, voluntário escolhe ou marca "outro")
10. Click "Imprimir e confirmar"
11. Backend:
    - gera codigo_seguranca (fn_kids_gerar_codigo_seguranca)
    - INSERT kids_checkins (codigo, snapshots responsável, sala)
    - chama serviço de impressão → 2 etiquetas via Brother:
       (a) Etiqueta da criança (fica no peito)
       (b) Etiqueta do responsável (recibo, fica com a mãe)
    - INSERT kids_etiquetas_log × 2
12. UI mostra confirmação verde "Maria Clara → Infantil 1 · código F8K3"
```

### 5.2 Fluxo · checkout (pickup)

```
1. Voluntário operador (do checkout) abre /kids/checkout?estacao=<id>
2. Mãe entrega a etiqueta dela
3. Voluntário escaneia o barcode (Code128) OU digita o código de 4 chars
4. Backend: SELECT FROM kids_checkins WHERE codigo_seguranca=X AND checkout_at IS NULL
5. Match? UI mostra a criança · foto, sala, hora do check-in
6. Voluntário (da SALA) traz a criança até o ponto de checkout
7. Confirma identidade visual (rosto + etiqueta de peito)
8. Voluntário clica "Confirmar saída"
9. UPDATE kids_checkins SET checkout_at=now(), checkout_metodo='codigo_digitado',
   responsavel_checkout_id, responsavel_checkout_nome
10. UI mostra "Maria saiu com Cláudia (mãe) · 11:32"
```

### 5.3 Fluxo · primeira visita (criança nova)

```
1. Voluntário busca por nome, não encontra
2. Click "Nova criança"
3. Form mínimo:
   - Nome da criança *
   - Mês e ano de nascimento (não pede dia exato — LGPD)
   - Sexo (opcional)
   - Alergia/medicação (opcional)
   - Foto (opcional, mãe consente)
4. Form do responsável:
   - Nome do responsável *
   - Telefone *
   - CPF (opcional, recomendado)
   - Parentesco (mãe/pai/etc)
5. Backend:
   - Procura mem_membros por cpf ou telefone normalizado
     - Se existe → usa esse id
     - Se não → cria mem_membros novo (status='visitante')
   - Cria kids_criancas com visitante=true e familia_id=responsável.familia_id
     (cria família se responsável também não tem)
   - Cria kids_responsaveis com parentesco
6. Volta pro fluxo normal de check-in com a criança nova
```

### 5.4 Fluxo · override (situação de emergência)

```
1. Voluntário tenta checkout, mas quem chegou não é o que trouxe a criança
   e não está na lista de kids_responsaveis autorizados
2. Sistema bloqueia · "Pessoa não autorizada"
3. Voluntário clica "Solicitar override"
4. Coordenador Kids (Mariane) ou admin recebe push/notificação na tela dela
5. Coordenadora vê:
   - Quem é a criança
   - Quem está buscando (foto, telefone se na base)
   - Motivo (campo obrigatório do voluntário · ex: "Mãe pediu pelo WhatsApp,
     mostrou print, irmã da mãe vem buscar")
6. Coordenadora aprova com PIN/senha do staff
7. checkout_metodo='override_supervisor', override_aprovado_por preenchido
8. Caso fica auditável em kids_etiquetas_log + sai numa view de auditoria
```

### 5.5 Fluxo · self-service (estação self)

Igual ao 5.1, mas:
- A própria mãe opera o totem
- Sistema exige confirmação do telefone (digita os 4 últimos dígitos) antes
  de mostrar a foto da criança (pra evitar que alguém de fora pesquise
  crianças da igreja)
- Não permite cadastro de visitante via self (cai pra estação manned)
- Override desativado (precisa de voluntário)

### 5.6 Fluxo · roster (estação dentro da sala)

- Voluntário da sala vê uma lista de quem já checkou
- Pode marcar "presente fisicamente" (confirma chegada na sala, separado do
  check-in que aconteceu na recepção)
- Marca observações no_dia · "Chorou bastante", "Acidente de banheiro às 10:35"
- Marca fez_decisao_jesus = true se a criança aceitou Cristo no momento
- Não imprime nada novo (etiquetas já vieram com a criança)

## 6. Etiquetas · conteúdo e layout

### 6.1 Etiqueta da criança (vai no peito · DK-22205 ou DK-22251)

Conteúdo (com fonte grande, alto contraste):
```
┌─────────────────────────────────┐
│ MARIA CLARA                     │  ← nome grande (24pt)
│ Infantil 1 · 4 anos             │  ← sala + idade
│                                 │
│ ⚠️ ALERGIA: amendoim            │  ← se houver, em vermelho
│                                 │
│ Cód: F8K3                       │  ← código de segurança grande
│ Domingo 18/05 · 10:15           │  ← data + hora do check-in
└─────────────────────────────────┘
```

### 6.2 Etiqueta do responsável (recibo · mesma dimensão)

```
┌─────────────────────────────────┐
│ ⛪ CB Rio                       │
│ Recibo Kids                     │
│                                 │
│ Maria Clara → Infantil 1        │  ← só nome da criança e sala
│                                 │
│ ┌────────────┐                  │
│ │   F8K3     │                  │  ← código grande
│ └────────────┘                  │
│                                 │
│ ║║║║║║║║║║║║║║║                 │  ← barcode Code128 do código
│                                 │
│ 18/05/2026 · 10:15              │
│                                 │
│ Apresente este recibo para      │
│ buscar a criança.               │
└─────────────────────────────────┘
```

**O que NÃO vai na etiqueta do responsável**:
- Alergia / observação médica (segurança · não pode cair em qualquer lugar)
- Sala da criança (pra dificultar localização por terceiros)
- Idade da criança (LGPD)
- Telefone, endereço, foto

## 7. Hardware · Brother QL-820NWB

### 7.1 Configuração física

- Conexão por **cabo de rede** (Ethernet) no roteador da igreja, IP fixo.
- Configurada como **impressora padrão do Windows do totem** (instalação única
  com driver oficial Brother).
- Etiquetas físicas recomendadas:
  - **DK-22251** (62mm × 100mm contínua, branca · ideal pra nome de criança)
  - **DK-22205** (62mm contínua, branca · alternativa)

### 7.2 Arquitetura de impressão · MVP (navegador)

Como o backend roda no Vercel (cloud), ele não tem rota TCP até a rede local
da igreja. A solução do MVP é **renderizar a etiqueta no browser do totem e
chamar `window.print()`** com CSS `@page { size: 62mm 100mm }`. O Windows
manda direto pra Brother (printer default), sem caixa de diálogo.

```
Totem (browser Windows da igreja)
  │
  │  1. Voluntário confirma check-in no app
  │  2. POST /api/kids/checkin  ─────▶  Backend (Vercel) · só persistência
  │     ↳ retorna codigo_seguranca + snapshot do responsável
  │  3. Frontend renderiza 2 <iframe> escondidos:
  │       - Etiqueta da criança (HTML + barcode SVG via bwip-js)
  │       - Etiqueta do responsável (HTML + barcode SVG)
  │     CSS @page { size: 62mm 100mm; margin: 0 }
  │  4. window.print() em cada iframe
  │  5. POST /api/kids/etiquetas-log  ─▶  registra a impressão
  │
  ▼
Brother QL-820NWB (rede local · printer default no Windows)
```

**Vantagens**: zero infra nova, debug trivial pelo "preview de impressão" do
browser, funciona com qualquer printer (fallback laser/jato em caso de
emergência).

**Setup no totem (uma vez)**:
1. Instalar driver Brother no Windows
2. Adicionar a Brother como printer (configurar pelo IP Ethernet)
3. Marcar como padrão do sistema
4. No browser do totem · configurações de impressão · "Sempre usar esta
   impressora" + "Sem diálogo"

`kids_estacoes.printer_target` fica como **referência informativa** (ex:
`192.168.10.50`) pro admin saber qual Brother é qual, mas o app não usa esse
campo no MVP.

### 7.3 Roadmap v2 · agente local TCP

Pra v2, quando quisermos auto-cut programático e margens pixel-perfect,
implementar um pequeno helper Node.js rodando no Windows do totem que escuta
WebSocket local e envia ESC/P raster direto na porta 9100. Backend continua
só persistindo. Setup vira "instalar agente como serviço Windows".

## 8. Integração com o resto do sistema

### 8.1 Módulo `kids` (já existe) + novo Totem Kids

**Painel KPI** (`/kids`) continua como está · só leitura dos indicadores.

**Totem Kids** vira um item novo no menu **Ministerial**, vizinho ao Totem do
Voluntariado (já existe em `src/pages/ministerial/voluntariado/VolTotem.tsx`).
Estrutura proposta:

```
Menu lateral · seção Ministerial
├── ...
├── Voluntariado
│   └── Totem (VolTotem · já existe)
├── Totem Kids                    ← NOVO
│   ├── Check-in        /ministerial/totem-kids
│   ├── Checkout        /ministerial/totem-kids/checkout
│   ├── Roster (sala)   /ministerial/totem-kids/roster
│   └── Painel ao vivo  /ministerial/totem-kids/painel
└── Kids (painel KPI)             ← já existe em /kids
```

Admin (CRUD de crianças, salas, estações) vai pra `/admin/totem-kids/*`,
restrito a `coordenador-kids` + admin do sistema.

Botão **Encerrar sessão** no header do painel ao vivo · só coord-kids ou admin
· consolida `cultos.presencial_kids` automaticamente.

### 8.2 Permissões (matriz `cargo_modulo_permissao`)

Reaproveita o modulo `kids` já cadastrado. Levels:
- **nível 5 (admin total · coord-kids)**: Mariane Gaia · CRUD tudo, override, encerrar sessão
- **nível 3+ (voluntário Kids ativo no dia)**: operar totem (checkin/checkout), marcar decisão, observações
- **nível 1 (todo mundo)**: ver painel KPI

A liberação "voluntário Kids ativo no dia" precisa ser dinâmica · sugestão:
guard no backend verifica `vol_check_ins` do dia para `vol_service_types`
com `has_kids=true`. Se a pessoa tem check-in ativo nesse culto, ganha
permissão de operar a estação **só durante essa janela** (até `kids_sessoes.encerrada_at`).

### 8.3 KPIs

| KPI | Fonte hoje | Como passa a ser alimentado |
|---|---|---|
| **KID-01** Frequência crianças | `cultos.presencial_kids` (digitado) | Trigger `fn_kids_sessao_consolida_culto` atualiza no encerrar |
| **KID-02** Aceitações crianças 5+ | `batismos.kids` ou planilha | `kids_checkins.fez_decisao_jesus` agrega quando 5+ anos |
| **KID-03** Batismos crianças 7+ | manual | continua manual (batismo é outro módulo) |
| **KID-04** Famílias com devocional | `devocionais.familias` | inalterado |
| **KID-05** Saída voluntários | manual | inalterado |

### 8.4 Membresia / Pessoas

- Responsáveis (`kids_responsaveis.membro_id`) já estão em `mem_membros`.
- Quando responsável é cadastrado pela primeira vez via check-in, vira
  `mem_membros` com `status='visitante'` · entra naturalmente nos fluxos
  de acolhimento, devocional, contribuição.
- Família (`mem_familias`) é criada automaticamente se responsável e criança
  não tiverem · simplifica relacionamentos.

### 8.5 Cultos / Decisões

- `cultos_decisoes_pessoas` já aceita `tipo='kids'` (migration `20260518150000`).
- Trigger `fn_kids_decisao_para_culto` cria automaticamente quando
  `kids_checkins.fez_decisao_jesus=true` · zero retrabalho.
- View `vw_nsm_sem_dados` já mostra `kids_registrados` em coluna separada e
  não conta no NSM (decisão Marcos, mantida).

### 8.6 Voluntariado

- Voluntário do Kids continua se escalando e fazendo check-in pelo módulo
  `voluntariado` existente · NÃO MISTURAR.
- Mas usamos os check-ins do voluntariado pra **liberar acesso dinâmico** ao
  totem Kids (ver 8.2).

### 8.7 Escala (50k pessoas)

Padrão já estabelecido pelo Marcos (memória `project_escala_50k`):
- Índices em `kids_checkins(sessao_id, sala_id) WHERE checkout_at IS NULL`
  → query do painel ao vivo é O(log n).
- Materialized view `mvw_kids_checkins_diario` se relatórios ficarem pesados
  · refresh ao encerrar sessão (statement trigger).
- Cache do painel da coordenadora (15s TTL) · evita refresh agressivo em
  domingo cheio.
- O índice GIN trigram em `kids_criancas.nome` cobre a busca fuzzy do totem
  sem precisar de full-text.

## 9. Backend · rotas (esboço)

```
POST   /api/kids/sessoes                       cria sessão pra um culto
POST   /api/kids/sessoes/:id/abrir              status → aberta
POST   /api/kids/sessoes/:id/encerrar           status → encerrada (consolida culto)
GET    /api/kids/sessoes/atual                  retorna a aberta agora

GET    /api/kids/criancas/buscar?q=             fuzzy search (trigram)
POST   /api/kids/criancas                       cria criança (com responsável)
GET    /api/kids/criancas/:id                   detalhe completo (coord-kids)
PATCH  /api/kids/criancas/:id                   editar obs médica, foto

GET    /api/kids/familias/:id/criancas          lista crianças da família
GET    /api/kids/criancas/:id/responsaveis      lista responsáveis autorizados
POST   /api/kids/criancas/:id/responsaveis      adiciona

POST   /api/kids/checkin                        body: {sessao_id, crianca_id, sala_id, responsavel_id, estacao_id}
                                                 → cria checkin + imprime
POST   /api/kids/checkin/:id/imprimir           reimpressão (rasgou)
POST   /api/kids/checkout                       body: {codigo} ou {checkin_id, responsavel_id}
POST   /api/kids/checkout/override              precisa de PIN do supervisor

GET    /api/kids/painel/ao-vivo?sessao_id=      view sessao_ao_vivo
GET    /api/kids/painel/sala/:id                lista crianças presentes na sala

GET    /api/kids/salas                          CRUD salas (coord)
POST   /api/kids/salas
PATCH  /api/kids/salas/:id
DELETE /api/kids/salas/:id

GET    /api/kids/estacoes                       CRUD estações (coord)
POST   /api/kids/estacoes/:id/test-print        imprime etiqueta de teste
```

## 10. Frontend · telas (esboço)

Pasta nova: `src/pages/ministerial/totemKids/`

- `TotemKidsCheckin.tsx`   · estação de check-in (rota `/ministerial/totem-kids`)
- `TotemKidsCheckout.tsx`  · estação de checkout (`/ministerial/totem-kids/checkout`)
- `TotemKidsRoster.tsx`    · estação dentro da sala (`/ministerial/totem-kids/roster`)
- `TotemKidsPainel.tsx`    · painel ao vivo (`/ministerial/totem-kids/painel`)
- `components/...`         · cards de criança, modal de override, etc

Pasta admin: `src/pages/admin/totemKids/`

- `TotemKidsCriancas.tsx`  · CRUD crianças (`/admin/totem-kids/criancas`)
- `TotemKidsSalas.tsx`     · CRUD salas (`/admin/totem-kids/salas`)
- `TotemKidsEstacoes.tsx`  · CRUD estações + teste de impressão (`/admin/totem-kids/estacoes`)
- `TotemKidsAuditoria.tsx` · histórico + log de overrides (`/admin/totem-kids/auditoria`)

## 11. Decisões tomadas (confirmadas com Marcos em 2026-05-21)

| # | Decisão | Resposta |
|---|---|---|
| 1 | Idade máxima do Kids | **0 a 12 anos completos** · 13+ vai pra AMI |
| 2 | Tipos de estação no MVP | **Apenas Manned** · voluntário sempre opera o totem. Self e Roster ficam pra fases seguintes |
| 3 | Foto da criança | **Opcional, com consentimento explícito do responsável**. Foto NUNCA vai na etiqueta, só aparece na tela interna do staff Kids |
| 4 | Estrutura inicial de salas | **5 salas padrão**: Berçário (0-24m, cap 20) · Maternal (2-3a, cap 25) · Infantil 1 (4-6a, cap 30) · Infantil 2 (7-9a, cap 30) · Pré-AMI (10-12a, cap 25). Mariane ajusta depois se quiser |
| 5 | Multi-campus | **Campo `igreja_id` no schema**, alimentado como Sede por padrão. Já preparado pra Expansão 2025-2029 |
| 6 | Quem aprova override | **Coordenador Kids (Mariane) + Admin do sistema + Líder/supervisor Kids do dia** (3 papéis combinados) |
| 7 | Expiração do código de segurança | **Sem expiração ativa** · vale até o checkout. Cron noturno (23h) fecha pendentes como `checkout_forcado` + dispara alerta pra coord |
| 8 | App pro responsável (Church Center equivalente) | **Nunca** · Marcos descartou. Toda operação pelo totem físico |
| 9 | Histórico de check-ins visível pra mãe | **Não** · só staff/coord-kids vê. Acompanhamento pastoral vai pelo canal humano |
| 10 | Driver da Brother QL-820NWB | **ESC/P raster via TCP:9100** · backend renderiza bitmap (node-canvas) e envia raw na porta 9100. Sem driver no SO, multi-plataforma |

## 12. Cronograma sugerido (estimativas grosseiras)

| Sprint | Entrega | Esforço |
|---|---|---|
| **S1** | Schema completo + migrations + seeds das salas + matriz de permissões | 1-2 dias |
| **S2** | CRUD salas/estações/criancas + listagem de crianças (admin) | 2-3 dias |
| **S3** | Backend `/api/kids/checkin` + geração do código + serviço de impressão Brother (TCP socket) | 3-4 dias |
| **S4** | Frontend KidsTotem (manned) + KidsCheckout | 2-3 dias |
| **S5** | Painel ao vivo + view materializada + KPI consolidado | 2 dias |
| **S6** | Override flow + audit log + first-visit flow (cadastro on-the-spot) | 2 dias |
| **S7** | Self-service + roster + relatórios | 3 dias |
| **S8** | Teste de campo num domingo de menor movimento + ajustes | 1 domingo |

Total: ~3-4 semanas de codar + 1 domingo de teste antes de cortar o PCO.

## 13. Riscos e mitigações

- **Brother trava no meio do domingo**: plano B com PDF pra impressora
  AirPrint/IPP secundária. Estação roster (sem impressão) mantém a sessão
  funcionando mesmo sem etiquetas novas (já impressas estão na criança).
- **Mãe perde a etiqueta**: voluntário usa override do supervisor depois de
  conferir identidade visual (foto da criança + responsável conhecido).
- **Criança aparece em duas sessões diferentes (irmãos)**: schema permite ·
  cada `kids_checkins` é por `(sessao_id, crianca_id)`. Família com 3
  crianças = 3 checkins no fluxo da mãe.
- **LGPD**: dados sensíveis das crianças só visíveis pra cargo `coordenador-kids`
  e voluntários ativos do dia · auditoria de quem acessa via RLS + log.
- **Sessão esquecida aberta**: cron noturno marca sessões aberta por mais de
  8h como `encerrada` + checkout forçado das que sobraram, gerando alerta.

## 14. Próximo passo

Decisões fechadas. Pronto pra começar **Sprint 1**:

1. Criar branch `marcos-totem-kids` (segue padrão da memória `feedback_git_workflow_marcos`)
2. Migration 1 · schema completo das 7 tabelas + view + 2 funções/triggers
3. Migration 2 · seed das 5 salas + ajuste de matriz `cargo_modulo_permissao`
   pra o modulo `kids` (admin override pra coord-kids, admin sistema e líder
   Kids do dia)
4. Documentar no `CLAUDE.md` pra Matheus pegar contexto (memória
   `feedback_update_claudemd_every_commit`)
5. PR + merge rápido sem esperar preview deploy (memória `feedback_merge_fast`)
