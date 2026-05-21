# Setup Brother QL-820NWB no totem Kids

Guia passo-a-passo pra configurar a impressora de etiquetas Brother
QL-820NWB no Windows do totem da igreja · uma vez por totem.

## O que você vai precisar

- Computador Windows do totem (notebook ou PC fixo na recepção)
- Brother QL-820NWB
- Cabo de rede Ethernet conectando a Brother ao switch/roteador da igreja
- Cabo de força da Brother
- Rolo de etiquetas **DK-22251** (62mm × 100mm, branca, contínua) — preferida
  - Alternativa: **DK-22205** (62mm contínua, branca)
- Acesso admin no Windows
- ~30 minutos da primeira vez

## Passo 1 · Hardware

1. Coloca o rolo de etiqueta DK-22251 na Brother (abre a tampa, encaixa o
   suporte do rolo, passa o início pela guia, fecha a tampa)
2. Conecta o cabo de força · liga a impressora pelo botão
3. Conecta o cabo Ethernet · LED de rede acende verde após ~10s
4. Imprime uma etiqueta de status pra confirmar IP: segura o botão **Cut**
   por ~5s · sai uma etiqueta com o IP, MAC, modelo, firmware

Anota o IP que saiu (ex: `192.168.10.50`). Pede pra equipe de TI da igreja
**reservar esse IP no DHCP** pra Brother sempre pegar o mesmo (evita
problemas se o roteador resetar).

## Passo 2 · Driver no Windows

1. No computador do totem, vai pro site da Brother:
   https://www.brother.com.br/suporte/qlseries/ql-820nwb/downloads
2. Baixa o **Driver completo** (Full Driver Software) pra Windows
3. Executa o instalador como Administrator
4. Quando perguntar tipo de conexão · escolhe **Conexão de rede com fio**
5. O wizard procura impressoras na rede · seleciona a Brother que apareceu
   com o IP que você anotou
6. Confirma e termina a instalação

## Passo 3 · Definir como impressora padrão

1. No Windows: **Configurações → Bluetooth e dispositivos → Impressoras e
   scanners**
2. Localiza **Brother QL-820NWB** na lista
3. Clica nela → botão **Definir como padrão**
4. (Importante) Tira o ✓ de **"Permitir que o Windows gerencie minha
   impressora padrão"** logo abaixo · senão o Windows pode trocar pra outra
5. Abre o **menu da impressora** → **Preferências de impressão**:
   - **Formato do papel**: 62mm × 100mm (DK-22251)
   - **Orientação**: Retrato
   - **Margem**: 0mm em todos os lados
   - **Tipo de fita**: Contínua (não pré-cortada)
   - **Cortar após cada etiqueta**: ✓ ativado
   - Aplicar

## Passo 4 · Teste de impressão do Windows

Antes de testar no totem Kids, valida que a Brother funciona pelo Windows:

1. Em **Impressoras e scanners**, clica na Brother → **Imprimir página de
   teste**
2. Confere que saiu uma etiqueta legível

Se não saiu nada ou saiu cortado: revisa **Preferências de impressão**
(margens 0, papel certo).

## Passo 5 · Teste no Totem Kids

1. No browser do totem, abre o sistema CBRio
2. Vai em **Ministerial → Ferramentas → Totem Kids**
3. Clica no botão **"Testar etiqueta"** no topo direito
4. Preenche um nome de teste · clica em **"Imprimir teste"**
5. Confirma que sai **uma etiqueta da criança + uma do responsável** (62×100mm
   cada)

Se quiser ver o layout antes sem mandar pra impressora:
- Clica em **"Ver preview"** · abre 2 popups com as etiquetas em tamanho
  real. Use **Ctrl+P** em cada popup pra abrir o diálogo de impressão e
  visualizar o preview do Windows.

## Passo 6 · Sem diálogo de impressão (impressão silenciosa)

No domingo, queremos que cada check-in saia **direto pra Brother** sem
abrir caixa de diálogo. Configuração depende do browser:

### Edge (recomendado pro totem)

1. Vai em `edge://settings/printing` no Edge
2. Em **Impressão silenciosa**:
   - Marca **"Imprimir diretamente sem abrir uma caixa de diálogo"**
3. Define a Brother como impressora padrão (já fizemos no Passo 3)
4. Reinicia o Edge

### Chrome

1. Vai em `chrome://settings/?search=print` no Chrome
2. Não tem opção nativa de impressão silenciosa, MAS:
3. Inicia o Chrome com flag (atalho na área de trabalho):
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing
   ```
4. Salva esse atalho e usa ele pra abrir o sistema no totem
5. Aí `window.print()` vai direto pra impressora padrão

### Firefox

1. Em `about:config`, busca `print.always_print_silent`
2. Cria como **boolean** com valor **true**
3. Define a Brother como padrão
4. Em `print.print_printer` confirma que está apontando pra Brother

## Passo 7 · Modo kiosk (opcional · recomendado pro totem)

Se quiser que o totem fique **só na tela de check-in** sem mostrar barra
de endereço, abas, etc:

**Edge kiosk**:
```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  --kiosk https://app.cbrio.org/ministerial/totem-kids
  --edge-kiosk-type=fullscreen
  --no-first-run
  --kiosk-idle-timeout-minutes=0
```

**Chrome kiosk**:
```
"C:\Program Files\Google\Chrome\Application\chrome.exe"
  --kiosk https://app.cbrio.org/ministerial/totem-kids
  --kiosk-printing
  --no-first-run
```

Salva como atalho na área de trabalho do totem. Pra sair, **Alt+F4**.

## Troubleshooting

### Etiqueta sai em branco ou ilegível
- Confere que tem rolo carregado e que a tampa está fechada
- Tira e recoloca o rolo (encaixa direito no suporte)
- Imprime status (botão Cut 5s) pra ver se sai
- Atualiza o driver no site da Brother

### Etiqueta sai cortada ou margens erradas
- Preferências de impressão → margens **0mm** em tudo
- Formato do papel exato: 62mm × 100mm
- Não usar "Ajustar à página"

### Brother não aparece na rede
- Cabo Ethernet conectado nos 2 lados
- LED de rede verde
- IP no segmento certo da igreja (mesma sub-rede que o totem)
- Tenta dar ping no IP da Brother do CMD do Windows: `ping 192.168.10.50`

### Imprime mas sai a diálogo de impressão toda vez
- Confere que a Brother é a padrão (Passo 3)
- Edge: ativa "Impressão silenciosa" (Passo 6)
- Chrome: usa atalho com `--kiosk-printing`

### Sai uma etiqueta gigante ou minúscula
- Driver instalado errado · reinstala a versão Full do site da Brother
- Confirma DK-22251 selecionada nas preferências

### Etiqueta da criança e do responsável saem trocadas
- Não é problema · saem 2 etiquetas idênticas em tamanho, conteúdo diferente:
  - 1ª: **etiqueta da criança** (vai no peito)
  - 2ª: **recibo do responsável** (fica com quem trouxe)
- Voluntário separa visualmente

## Manutenção

- **Trocar rolo**: quando ver listra colorida no fim da etiqueta. Levanta a
  tampa, tira o suporte do rolo, encaixa o rolo novo, passa pela guia, fecha
- **Limpar cabeça**: 1× ao ano, pano seco + álcool isopropílico (com a
  Brother desligada)
- **Reset de fábrica**: segura Power + Cut por 10s

## Suporte

Brother BR: https://www.brother.com.br/suporte/contato
Manual completo: https://download.brother.com/welcome/docp100287/ql810w_ql820nwb_use_ug_06.pdf
