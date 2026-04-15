

## Plan: Redesign do Organograma no estilo do wireframe de referencia

### Summary
Reescrever o componente `OrgChartTab` dentro de `RH.jsx` (linhas 1215-1366) com um layout visual inspirado no wireframe: cards arredondados com avatar circular + borda colorida, badge de area/setor, contagem de subordinados, conectores finos (linhas cinza), filtro por departamento no topo, painel lateral de perfil ao clicar, e controles de zoom flutuantes no canto inferior direito. Tudo adaptado a paleta CBRio (teal `#00B39D`, dark theme vars).

### O que muda

**1. Toolbar superior do organograma**
- Filtro por area/setor em pills horizontais (estilo `rounded-full`, pill ativa em `bg-primary text-white`)
- Busca por nome
- Botao "Expandir Tudo" / toggle arvore vs lista
- Controles de zoom movidos para canto inferior direito (floating pill vertical com +, -, reset)

**2. Cards dos nos (3 niveis visuais)**
- **Nivel raiz (CEO/Diretor)**: card 280px, `rounded-3xl`, avatar 80px com borda de cor do setor, nome grande, cargo, badge de contagem subordinados + subordinados diretos no footer
- **Nivel gerencial**: card 260px, layout horizontal (avatar esquerda + badge de area direita), nome, cargo, contagem reports
- **Nivel folha**: card compacto 180px, avatar 40px, nome, cargo truncado

**3. Conectores**
- Linhas finas `1px bg-border` verticais e horizontais entre niveis (em vez das barras grossas atuais)
- Calculados dinamicamente com base na quantidade de filhos

**4. Painel lateral de perfil (slide-in)**
- Ao clicar um card, abre painel lateral direito (reutilizando o pattern do `FuncionarioDetailPanel` existente) mostrando: foto, nome, cargo, email, telefone, gestor, area, e subordinados diretos
- Nao substitui o `onDetail` existente, apenas adiciona um preview rapido

**5. Adaptacao visual CBRio**
- Cards: `bg-card border-border rounded-3xl`
- Texto: `text-foreground`, `text-muted-foreground`
- Borda avatar: `border-primary` (teal)
- Badge area: `bg-primary/10 text-primary`
- Hover: `hover:border-primary/30 shadow-lg`
- Zoom controls: `bg-card border-border rounded-2xl shadow-lg`

### Arquivos modificados
- `src/pages/admin/rh/RH.jsx` — reescrever `OrgChartTab` (linhas 1215-1366) e adicionar `OrgProfilePanel`

### Sem dependencias novas
- Usa Tailwind + CSS vars ja existentes
- Sem mudancas de banco de dados

