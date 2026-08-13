-- ============================================================================
-- ⚠️⚠️ RPC CHAMADA PELO CLIENTE PRECISA DE `GRANT EXECUTE TO authenticated`
--
-- Reportado pelo Matheus em 10/08: o cartão de membro do app mostrava
-- **"QR indisponível"**. O token DELE existe em `mem_qrcodes` — o que falhava
-- era a chamada: `app_meu_qrcode()` estava com EXECUTE só para `service_role`,
-- e o app chama com o JWT da pessoa (papel `authenticated`).
--
-- Provado funcionalmente antes de escrever esta migration (não deduzido do
-- catálogo): `set local role authenticated; select public.app_meu_qrcode();`
-- → `permission denied for function app_meu_qrcode`. O app descarta o erro
-- (`const { data: tk } = await supabase.rpc(...)`, sem ler `error`), então o
-- token virava null e a tela dizia "indisponível" — falha silenciosa.
--
-- ⚠️ CAUSA: o sweep de segurança que revogou `anon`/`authenticated` de ~114
-- funções SECURITY DEFINER partiu de "o backend usa service_role, logo é
-- imune". A premissa vale pro backend e **não vale pro app mobile**, que fala
-- direto com o PostgREST usando a chave pública. 4 RPCs do app foram pegas.
--
-- ⚠️⚠️ O RAIO ERA MAIOR QUE O SINTOMA: além do QR, **o check-in de batismo
-- pelo app estava quebrado** (`app_batismo_checkin`) e ninguém havia reportado,
-- junto de marcar/desmarcar batismo em outra igreja. Medido: as 4 RPCs que o
-- app chama estavam sem o grant; das RPCs que o FRONT do ERP chama com a anon
-- key, a única (`app_marcar_senha_trocada`) manteve o grant e segue de pé.
--
-- Por que re-conceder é SEGURO nas 4 (auditado uma a uma, não em bloco):
-- todas resolvem o alvo pelo `auth.uid()` — o parâmetro nunca escolhe a
-- PESSOA, então id de terceiro no argumento não alcança dado de terceiro.
--   · app_meu_qrcode()                 sem parâmetro; profiles.id = auth.uid()
--   · app_batismo_checkin(uuid)        filtra `membro_id = v_membro` (o do auth)
--   · app_marcar_batizado_outra(text)  `update ... where id = v_membro`
--   · app_desmarcar_batizado_outra()   idem
-- ⚠️ `anon` NÃO recebe nada aqui: as quatro exigem pessoa autenticada.
--
-- ⚠️ A MARCA FICA NO CATÁLOGO (`COMMENT ON FUNCTION`), não só neste arquivo:
-- a varredura de segurança é feita à mão no SQL Editor, e quem varrer de novo
-- precisa ver o motivo no próprio objeto. Comentário que começa com
-- "[GRANT authenticated OBRIGATÓRIO]" = chamada direto pelo cliente.
--
-- ⚠️ Os arquivos `supabase/*.sql` do repo do APP declaram esses grants, mas são
-- **cópia de leitura** (o cabeçalho deles diz isso desde 08/08): quem cria e
-- altera é a migration do ERP. Rodar de lá pode reverter alteração feita aqui.
--
-- Aditiva e idempotente: só GRANT + COMMENT, nenhum corpo de função é tocado
-- (⚠️ de propósito — `CREATE OR REPLACE` a partir do arquivo do app reverteria
-- qualquer ajuste feito em produção depois, a lição do patch dinâmico do fanout).
-- ============================================================================

grant execute on function public.app_meu_qrcode() to authenticated;
grant execute on function public.app_batismo_checkin(uuid) to authenticated;
grant execute on function public.app_marcar_batizado_outra(text) to authenticated;
grant execute on function public.app_desmarcar_batizado_outra() to authenticated;

comment on function public.app_meu_qrcode() is
  '[GRANT authenticated OBRIGATÓRIO] Chamada direto pelo app de membros '
  '(app/(app)/cartoes.tsx) com a chave pública. Sem parâmetro: resolve o '
  'próprio membro por profiles.id = auth.uid() e devolve/cria o token do QR do '
  'cartão. NÃO revogar de authenticated — o cartão para de mostrar o QR e o '
  'app engole o erro em silêncio (incidente de 10/08/2026).';

comment on function public.app_batismo_checkin(uuid) is
  '[GRANT authenticated OBRIGATÓRIO] Chamada direto pelo app de membros. '
  'Recebe o id da inscrição mas filtra membro_id = membro do auth.uid(), então '
  'id de terceiro devolve "Inscrição não encontrada". NÃO revogar de '
  'authenticated — o check-in de batismo pelo app para de funcionar.';

comment on function public.app_marcar_batizado_outra(text) is
  '[GRANT authenticated OBRIGATÓRIO] Chamada direto pelo app de membros. '
  'Escreve só no PRÓPRIO cadastro (where id = membro do auth.uid()), em 2 '
  'colunas informativas. NÃO revogar de authenticated.';

comment on function public.app_desmarcar_batizado_outra() is
  '[GRANT authenticated OBRIGATÓRIO] Chamada direto pelo app de membros. '
  'Escreve só no PRÓPRIO cadastro (where id = membro do auth.uid()). '
  'NÃO revogar de authenticated.';

-- ============================================================================
-- CONFERÊNCIA no catálogo (o `success: true` não prova nada · lei nº 10).
-- Espera-se 4 linhas, todas com authenticated = true e anon = false.
--
--   select p.oid::regprocedure as assinatura,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') as anon,
--          left(obj_description(p.oid, 'pg_proc'), 34) as marca
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('app_meu_qrcode', 'app_batismo_checkin',
--                        'app_marcar_batizado_outra', 'app_desmarcar_batizado_outra')
--    order by 1;
--
-- E o teste funcional que reproduz o incidente (deve devolver 'nao autenticado',
-- que é a função RODANDO sem sessão — e não 'permission denied'):
--
--   do $$ begin
--     set local role authenticated;
--     begin
--       perform public.app_meu_qrcode();
--     exception
--       when insufficient_privilege then raise exception 'AINDA SEM GRANT: %', sqlerrm;
--       when others then raise notice 'grant OK (falhou depois, esperado): %', sqlerrm;
--     end;
--   end $$;
-- ============================================================================
