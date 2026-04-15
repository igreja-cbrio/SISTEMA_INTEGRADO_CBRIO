

## Plan: Multistep form layout for membership forms

### Summary
Refactor both the internal (`MembroFormModal` in Membresia.jsx) and external (`CadastroMembresia.jsx`) membership forms to use a multistep layout with animated transitions, progress indicators, and step navigation -- adapted to CBRio's visual identity (`#00B39D` teal palette).

### Steps

1. **Create reusable `MultistepFormShell` component** (`src/components/ui/multistep-form.tsx`)
   - Progress dots/bar at top with step titles
   - Animated transitions between steps using `framer-motion` (`AnimatePresence`)
   - Back/Next navigation footer with CBRio primary color
   - Step indicator text at bottom
   - Fully adapted to CBRio dark theme and teal palette

2. **Refactor external form (`CadastroMembresia.jsx`)**
   - Split the current single-page form into 4 steps:
     - **Step 1 - Dados Pessoais**: foto, nome, sobrenome, CPF, telefone
     - **Step 2 - Informacoes**: data nascimento, email, estado civil, profissao, como conheceu
     - **Step 3 - Endereco**: endereco, bairro, cidade, CEP
     - **Step 4 - Termos**: consentimento LGPD, checkboxes, submit
   - Replace `SmokeyBackground` with the geometric shapes animation (already on login)
   - Keep all existing logic: validation, honeypot, family suggestion step, photo upload
   - Step validation gates the "Next" button per step

3. **Refactor internal form (`MembroFormModal` in Membresia.jsx)**
   - Split the Dialog content into 3 steps:
     - **Step 1 - Dados Pessoais**: foto, nome, sobrenome, CPF, data nascimento, email, telefone, estado civil
     - **Step 2 - Endereco e Profissao**: endereco, bairro, cidade, CEP, profissao, ministerio, grupo
     - **Step 3 - Vinculo e Status**: status, familia, parentesco, observacoes
   - Add progress indicator and animated transitions inside the Dialog
   - Keep all existing save/edit logic intact

4. **Fix pre-existing build errors** (unrelated but blocking):
   - `VolAdmin.tsx` line 44: change `.schedules` to `.newSchedules`
   - `FaceScanner.tsx` line 33: add type assertion for `.length`

### Technical details
- `framer-motion` already installed
- All shadcn components (Button, Card, Input, etc.) already present
- No database changes needed
- No new dependencies
- Files created: `src/components/ui/multistep-form.tsx`
- Files modified: `src/pages/public/CadastroMembresia.jsx`, `src/pages/ministerial/Membresia.jsx`, `src/pages/ministerial/voluntariado/VolAdmin.tsx`, `src/pages/ministerial/voluntariado/components/checkin/FaceScanner.tsx`

