

# Modo Manual no Totem do Voluntariado

Adicionar uma quarta aba **"Manual"** ao totem (`VolTotem.tsx`) onde o voluntário busca o próprio nome na lista de escalados do culto e faz o check-in com um toque.

## Onde entra

Tela `/voluntariado/totem` (`src/pages/ministerial/voluntariado/VolTotem.tsx`) — junto das opções **QR Code**, **Facial** e **QR Fixo**.

```
[ QR Code ] [ Facial ] [ QR Fixo ] [ Manual ]   ← nova
```

## Comportamento da nova aba

1. Ao selecionar "Manual", carrega `voluntariado.schedules.list({ service_id })` do culto já escolhido.
2. Mostra um **campo de busca grande** (autofocus, friendly para tela touch) + lista rolável de escalados:
   - Avatar/inicial + nome do voluntário
   - Equipe — Posição (subtexto)
   - Badge de status: **Presente** (verde, sem botão), **Pendente** (amarelo), **Recusou** (vermelho), **Escalado** (azul)
   - Botão grande **"Check-in"** à direita para quem ainda não fez.
3. Filtro local por nome/equipe (`includes` case-insensitive, sem acento).
4. Ao tocar **Check-in**:
   - Chama `voluntariado.checkIns.create({ schedule_id, volunteer_id, service_id, method: 'manual' })`
   - Dispara a tela de sucesso já existente (`state = 'success'`, mesmo overlay verde grande do totem) com nome/equipe/posição.
   - Após o auto-reset (4s) volta para a lista atualizada.
5. Tratamento de erro reaproveita `handleCheckinError` (duplicado vira tela "Já fez check-in").
6. Botão **"Trocar culto"** no rodapé, igual aos outros modos.

## Mudanças de código

**`src/pages/ministerial/voluntariado/VolTotem.tsx`** (único arquivo alterado):

1. Importar `Hand` (lucide) e tipo `VolSchedule`.
2. Adicionar `'manual'` ao tipo `CheckinMode`.
3. Adicionar à `MODE_OPTIONS`: `{ key: 'manual', label: 'Manual', icon: Hand, desc: 'Buscar na lista' }`.
4. Estados novos:
   ```ts
   const [schedules, setSchedules] = useState<VolSchedule[]>([]);
   const [manualSearch, setManualSearch] = useState('');
   const [manualLoading, setManualLoading] = useState(false);
   ```
5. Em `startMode('manual')`: chamar `loadSchedules()` que faz `voluntariado.schedules.list({ service_id: selectedServiceId })` e popula `schedules`.
6. Função `handleManualCheckin(sch: VolSchedule)`:
   ```ts
   processingRef.current = true;
   try {
     await voluntariado.checkIns.create({
       schedule_id: sch.id,
       volunteer_id: sch.volunteer_id,
       service_id: selectedServiceId,
       method: 'manual',
     });
     setResult({ name: sch.volunteer_name, team: sch.team_name, position: sch.position_name });
     setState('success');
     autoReset(() => loadSchedules());
   } catch (err) {
     handleCheckinError(err, () => loadSchedules());
   }
   ```
7. Bloco JSX novo (mesma condição visual dos outros modos):
   - Campo de busca em fundo escuro (`bg-white/5`, texto branco, altura 56px).
   - Lista `max-h-[60vh] overflow-y-auto` com cards de 64px de altura mínima (touch-friendly).
   - Cores seguindo o tema escuro do totem (`bg-white/5`, hover `bg-white/10`, border `white/10`, primária `#00B39D`).
   - Empty state se a busca não retornar nada.
   - Skeleton durante `manualLoading`.

## Sem mudanças

- Backend, banco de dados, API client (`voluntariado.schedules.list` e `voluntariado.checkIns.create` já existem).
- Demais modos do totem (QR/Facial/QR Fixo) ficam intactos.
- Tela `VolCheckin.tsx` (manual interno do gestor) também permanece.

## Risco

Mínimo — só adiciona uma aba opcional. Se o endpoint de schedules retornar vazio (culto sem escala), exibimos mensagem clara: *"Nenhum voluntário escalado para este culto"*.

