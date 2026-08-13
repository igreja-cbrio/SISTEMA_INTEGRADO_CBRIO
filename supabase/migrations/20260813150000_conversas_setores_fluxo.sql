-- Fluxo por opção do menu do bot (F3 · decisão do Marcos 13/08).
-- Antes, TODA opção fazia a mesma coisa (pede nome → grava área → notifica);
-- a única diferença entre "1" e "4" era a etiqueta. Agora cada opção carrega o
-- caminho completo: mensagem de confirmação própria, pedir (ou não) o nome, e
-- destino = ÁREA ou ATENDENTE específico.
-- Aditiva e idempotente. O código tolera a ausência (triagem lê select('*') e
-- cai no fluxo padrão; salvar campos novos sem a migration avisa e ignora).
ALTER TABLE public.conversas_setores ADD COLUMN IF NOT EXISTS mensagem_resposta text;
ALTER TABLE public.conversas_setores ADD COLUMN IF NOT EXISTS pedir_nome boolean NOT NULL DEFAULT true;
ALTER TABLE public.conversas_setores ADD COLUMN IF NOT EXISTS destino_tipo text NOT NULL DEFAULT 'area';
ALTER TABLE public.conversas_setores ADD COLUMN IF NOT EXISTS atendente_id uuid;

-- CHECK e FK em blocos PRÓPRIOS (lei nº 10: constraint dentro de ADD COLUMN
-- IF NOT EXISTS é engolida quando a coluna preexiste; auditar no catálogo).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversas_setores_destino_tipo_chk') THEN
    ALTER TABLE public.conversas_setores
      ADD CONSTRAINT conversas_setores_destino_tipo_chk CHECK (destino_tipo IN ('area', 'atendente'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversas_setores_atendente_fk') THEN
    ALTER TABLE public.conversas_setores
      ADD CONSTRAINT conversas_setores_atendente_fk
      FOREIGN KEY (atendente_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.conversas_setores.mensagem_resposta IS
  'Mensagem de confirmação PRÓPRIA da opção (o bot envia ao concluir a triagem) · NULL = texto padrão';
COMMENT ON COLUMN public.conversas_setores.pedir_nome IS
  'false = pula a pergunta do nome (ex.: oração — a pessoa já vai escrever o pedido)';
COMMENT ON COLUMN public.conversas_setores.destino_tipo IS
  'area = conversa vai pra fila da área · atendente = nasce atribuída ao atendente_id';
COMMENT ON COLUMN public.conversas_setores.atendente_id IS
  'profiles.id do atendente quando destino_tipo=atendente (aviso vai direto pra pessoa)';

-- Conferência (deve devolver 4 colunas + 2 constraints):
-- SELECT column_name FROM information_schema.columns WHERE table_name='conversas_setores'
--   AND column_name IN ('mensagem_resposta','pedir_nome','destino_tipo','atendente_id');
-- SELECT conname FROM pg_constraint WHERE conname LIKE 'conversas_setores_%';
