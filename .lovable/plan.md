

# Busca por nome no modo Manual — incluindo voluntários sem escala

Estender a aba **Manual** do totem para que, quando o voluntário não estiver na lista de escalados do culto, o sistema **mostre o nome dele entre os voluntários cadastrados** (`vol_profiles`) e permita registrar **check-in sem escala** — exatamente como já acontece nos modos QR e Facial.

## Comportamento

1. Mantém o que já funciona: lista de escalados aparece de cara, com badge de status e botão **Check-in**.
2. Quando a pessoa **digita** algo no campo de busca:
   - Filtra a lista de escalados (como hoje).
   - **Em paralelo**, busca também em `voluntariado.profiles.list()` (todos os voluntários cadastrados) e mostra resultados que **não estão escalados** numa segunda seção:
     ```
     ─── Escalados ───
     [Maria Silva — Louvor / Vocal]            [Check-in]
     
     ─── Não escalado neste culto ───
     [João Pereira]                  [Check-in sem escala]
     ```
3. Cards de "não escalado" têm:
   - Badge amarela **"Sem escala"** no lugar de Equipe/Posição.
   - Botão **"Check-in sem escala"** (mesma cor primária `#00B39D`, ícone `UserPlus`).
4. Ao tocar no botão:
   - Chama `voluntariado.checkIns.create({ volunteer_id, service_id, method: 'manual', is_unscheduled: true })`.
   - Mostra a mesma tela de sucesso, com o badge amarelo **"Sem escala"** já existente (`result.unscheduled = true`).
5. Se a busca não retornar nem escalado nem voluntário cadastrado → empty state: *"Voluntário não encontrado. Procure um líder."*
6. Busca local apenas: carrega `profiles` uma vez ao entrar na aba e filtra no cliente (case + acento insensitive). Sem chamada a cada tecla.

## Mudanças de código

**`src/pages/ministerial/voluntariado/VolTotem.tsx`** (único arquivo alterado):

1. Importar ícone `UserPlus` do `lucide-react`.
2. Estado novo: `const [allProfiles, setAllProfiles] = useState<any[]>([])`.
3. `loadSchedules()` passa a também chamar `voluntariado.profiles.list()` em paralelo (`Promise.all`) e popular `allProfiles`. Loading único cobre os dois.
4. Derivar lista de não-escalados visíveis:
   ```ts
   const scheduledIds = new Set(schedules.map(s => s.volunteer_id).filter(Boolean));
   const unscheduledMatches = manualSearch.trim()
     ? allProfiles.filter(p =>
         !scheduledIds.has(p.id) &&
         normalize(p.full_name || '').includes(normalize(manualSearch))
       ).slice(0, 20)
     : [];
   ```
   (Só aparece quando há texto digitado, para não poluir a tela.)
5. Função `handleUnscheduledCheckin(profile)`:
   ```ts
   await voluntariado.checkIns.create({
     volunteer_id: profile.id,
     service_id: selectedServiceId,
     method: 'manual',
     is_unscheduled: true,
   });
   setResult({ name: profile.full_name, unscheduled: true });
   setState('success');
   autoReset(() => loadSchedules());
   ```
6. JSX: dentro do bloco do modo Manual, depois da lista de escalados filtrada, renderizar `unscheduledMatches.length > 0` com header *"Não escalado neste culto"* + cards no mesmo estilo (avatar, nome, badge amarela "Sem escala", botão "Check-in sem escala").
7. Empty state final: aparece só quando `filteredSchedules.length === 0 && unscheduledMatches.length === 0 && manualSearch.trim()` → *"Voluntário não encontrado. Procure um líder."*
8. Reaproveita `handleCheckinError` (já trata duplicado).

## Sem mudanças

- Backend, banco de dados — endpoints `voluntariado.profiles.list` e `voluntariado.checkIns.create` (com `is_unscheduled: true`) já existem e são usados pelos modos QR/Facial.
- Tela de sucesso — o badge amarelo "Sem escala" já está implementado no JSX (linhas 688-692).
- Relatório de check-ins sem escala — já consome `is_unscheduled = true` (`useUnscheduledCheckIns`), então a nova entrada vai aparecer lá automaticamente.
- Demais modos do totem.

## Risco

Mínimo. A consulta `vol_profiles` já é feita pela aba Lista de voluntários — não há novo custo de query. Limite de 20 resultados na busca evita cards demais na tela touch.

