-- Migration: policies explícitas de negação para tabelas backend-only
-- Contexto: RLS já estava habilitado nessas 47 tabelas mas sem nenhuma policy,
-- o que já bloqueia anon/authenticated por padrão (fail-closed). Confirmado por
-- busca no código que TODAS são acessadas exclusivamente pelo backend via
-- SUPABASE_SERVICE_ROLE_KEY (que ignora RLS). Esta migration só documenta a
-- intenção no schema e silencia o advisor 'rls_enabled_no_policy' -- não muda
-- nenhum comportamento de acesso hoje.

create policy "deny_all_frontend_agent_memory" on public.agent_memory
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_agent_messages" on public.agent_messages
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_agent_queue" on public.agent_queue
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_agent_sessions" on public.agent_sessions
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_apresentacoes" on public.apresentacoes
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_apresentacoes_arquivos" on public.apresentacoes_arquivos
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_apresentacoes_uso" on public.apresentacoes_uso
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_area_responsaveis" on public.area_responsaveis
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_cargos" on public.cargos
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_cerebro_entidades_indice" on public.cerebro_entidades_indice
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_cerebro_sync_fila" on public.cerebro_sync_fila
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_cycle_phase_templates" on public.cycle_phase_templates
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_dashboard_indicadores_custom" on public.dashboard_indicadores_custom
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_dashboard_metas" on public.dashboard_metas
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_fin_centros_custo" on public.fin_centros_custo
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_fin_culto_slots" on public.fin_culto_slots
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_fin_fila_classificacao" on public.fin_fila_classificacao
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_fin_identificadores_centavo" on public.fin_identificadores_centavo
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_fin_lancamentos_brutos" on public.fin_lancamentos_brutos
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_fin_memoria_classificacao" on public.fin_memoria_classificacao
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_fin_metas" on public.fin_metas
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_fin_pix_detalhe" on public.fin_pix_detalhe
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_fin_plano_contas" on public.fin_plano_contas
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_fin_regras_classificacao" on public.fin_regras_classificacao
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_fin_uploads" on public.fin_uploads
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_insc_checkin_eventos" on public.insc_checkin_eventos
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_insc_qr_tokens" on public.insc_qr_tokens
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_log_pedido_itens" on public.log_pedido_itens
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_modulos" on public.modulos
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_pe_planos" on public.pe_planos
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_permissoes_escopo_extra" on public.permissoes_escopo_extra
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_permissoes_modulo" on public.permissoes_modulo
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_push_subscriptions" on public.push_subscriptions
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_revision_log" on public.revision_log
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_santander_bulk_orders" on public.santander_bulk_orders
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_santander_comprovantes" on public.santander_comprovantes
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_santander_extrato_cache" on public.santander_extrato_cache
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_santander_saldo_snapshot" on public.santander_saldo_snapshot
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_santander_sync_log" on public.santander_sync_log
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_system_cost_entries" on public.system_cost_entries
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_system_cost_events" on public.system_cost_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_system_cost_providers" on public.system_cost_providers
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_system_executive_reports" on public.system_executive_reports
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_system_governance_control_events" on public.system_governance_control_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_system_governance_controls" on public.system_governance_controls
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_system_mobile_push_tickets" on public.system_mobile_push_tickets
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_frontend_usuario_areas" on public.usuario_areas
  for all
  to anon, authenticated
  using (false)
  with check (false);

