# Watcher Projetos

Vigia carteira de projetos:
1. **Projetos atrasados** · `date_end < hoje` E status != 'concluido'
2. **Projetos sem lider** · leader_id IS NULL E responsible_id IS NULL
3. **Projetos sem update** · updated_at > 30d em status='em_andamento'

Max 8 propostas. Inclui nome do projeto + responsavel atual.
