# Série "Construindo em Público" — LinkedIn · SISTEMA + APLICATIVO

> **Como usar:** publique **aos poucos**, **1 a 3 posts por semana**. Use o **calendário intercalado** abaixo pra alternar os assuntos (um dia o **sistema/ERP**, no outro o **aplicativo**) — fica mais variado e segura a audiência por mais tempo. Cada item traz o **texto do post** (pronto pra copiar/colar) e o **prompt de imagem** logo abaixo.
>
> Tom: **build in public** (não é tutorial). Estrutura: gancho na 1ª linha → corpo curto em linguagem de benefício → frase de fecho memorável → 3–5 hashtags.
>
> Conteúdo baseado no que **realmente existe** no código (ERP) e na superfície real do app visível neste repositório (endpoints `/api/app`, Edge Functions e a política de privacidade publicada). Ajuste nomes/links (seu @, nome do projeto) antes de publicar.

> ### 🎨 Imagens — leia antes de gerar
> - **Onde gerar:** ChatGPT/DALL·E, Midjourney, Ideogram ou Canva IA.
> - **Consistência:** gere **todas no mesmo modelo/sessão**, na ordem. No Midjourney, reuse `--sref` da 1ª imagem aprovada. O **mesmo bloco de estilo** vale pras duas séries (sistema e app) — assim o feed inteiro fica coeso.
> - **Proporção:** **4:5 (vertical)** rende mais no LinkedIn (1:1 também serve).
> - **Regras:** sem logos de marcas reais, sem texto/letras/números na imagem — só conceitos/abstrações. Prompts em **inglês** de propósito (rendem mais); traduza se usar Canva IA.
>
> **🎨 BLOCO DE ESTILO (já embutido em cada prompt):** premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D) and emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), plus white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## 📅 Calendário de publicação (intercalado · sugestão)

| Dia | Post | Assunto |
|----|------|---------|
| 1  | **S1** · Abertura (sistema) | Sistema |
| 2  | **A1** · Abertura (app) | App |
| 3  | **S2** · A fundação (a stack) | Sistema |
| 4  | **A2** · Um app, duas lojas (React Native + Expo) | App |
| 5  | **S3** · Segurança que mora no banco | Sistema |
| 6  | **A3** · Login sem dor de cabeça | App |
| 7  | **S4** · Serverless de verdade | Sistema |
| 8  | **A4** · Notificações que chegam na hora | App |
| 9  | **S5** · Permissões sem virar pesadelo | Sistema |
| 10 | **A5** · Doar pelo celular em 2 toques | App |
| 11 | **S6** · Indicadores que se preenchem sozinhos | Sistema |
| 12 | **A6** · Presença com geolocalização | App |
| 13 | **S7** · Bot de WhatsApp que coleta dados | Sistema |
| 14 | **A7** · Tudo num toque (inscrições e oração) | App |
| 15 | **S8** · IA conversando (e com bom português) | Sistema |
| 16 | **A8** · A carteirinha mora no celular | App |
| 17 | **S9** · Base de conhecimento que se alimenta sozinha | Sistema |
| 18 | **A9** · Privacidade não é checkbox | App |
| 19 | **S10** · Agente de IA que age (com humano no comando) | Sistema |
| 20 | **S11** · Banco na veia: PIX, boletos e conciliação | Sistema |
| 21 | **S12** · Doação sem fricção (e sem guardar cartão) | Sistema |
| 22 | **S13** · YouTube no piloto automático | Sistema |
| 23 | **S14** · Quando o software encosta no mundo físico | Sistema |
| 24 | **S15** · Reconhecimento facial e carteirinha digital | Sistema |
| 25 | **S16** · App no celular + tempo real | Sistema |
| 26 | **S17** · IA pra cuidar de gente | Sistema |
| 27 | **S18** · Encerramento + chamada | Sistema |

*(App tem menos posts que o sistema; por isso os primeiros ~18 dias alternam e a reta final fecha com os temas restantes do sistema. Ajuste a ordem como preferir.)*

---
---

# PARTE A — SISTEMA (web / ERP)

## S1. Abertura da série

Passei os últimos meses construindo um ERP inteiro — sozinho, do banco de dados ao app no celular — e decidi contar como foi, em público.

Não é um CRUDzinho. É um sistema de gestão completo para uma organização real (uma igreja com milhares de pessoas): finanças, voluntariado, eventos, membros, cuidado pastoral, comunicação, indicadores estratégicos. Tudo conversando entre si.

Nas próximas semanas vou abrir o capô: as decisões de arquitetura, as integrações que deram trabalho, onde a IA entrou de verdade (e onde NÃO entrou), e os erros que me ensinaram mais que os acertos.

Se você curte ver software nascendo de dentro — senta que lá vem história.

Construir em público é assumir que o processo vale tanto quanto o resultado.

#ConstruindoEmPublico #BuildInPublic #DesenvolvimentoDeSoftware #EngenhariaDeSoftware #Fullstack

**🖼️ Prompt de imagem:** An architect-builder abstract figure (faceless, geometric) assembling a glowing structure made of interconnected translucent modular blocks floating in space, like a system coming to life; subtle blueprint grid in the background. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D) and emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), plus white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S2. A fundação (a stack)

"Que stack você usou?" — a pergunta que mais recebo. Então vamos a ela.

Front em **React 18 + Vite + TypeScript** com Tailwind e componentes acessíveis. Back em **Node/Express**. Banco **PostgreSQL no Supabase** (com Auth e segurança no próprio banco). Tudo hospedado na **Vercel**, com **Sentry** vigiando erros em produção.

A graça não está em ser exótico — está em ser **boring tech** que escala: ferramentas maduras, previsíveis, que me deixam gastar energia no problema do cliente em vez de domar o framework.

Escolher tecnologia chata o suficiente pra ser confiável é uma decisão de engenharia, não de preguiça.

#React #NodeJS #Supabase #Postgres #ConstruindoEmPublico

**🖼️ Prompt de imagem:** Stacked translucent glass slabs forming a solid, stable foundation tower, each layer a different subsystem glowing softly, locking together like clean tech building blocks. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S3. Segurança que mora no banco

Regra que adotei cedo: se vazar a chave do front, o estrago tem que ser zero.

Por isso a segurança não vive só no backend — ela mora dentro do Postgres, via **Row Level Security**. Cada tabela com dado sensível (CPF, salário, dados de menores, finanças) tem políticas que decidem, linha a linha, quem pode ver e editar. Somei a isso **soft-delete** (nada some pra sempre — dá pra restaurar) e um **log de auditoria** que registra quem mudou o quê.

Para o cliente isso é abstrato. Até o dia em que não vaza nada — e aí vira a coisa mais importante do mundo.

Segurança boa é a que ninguém percebe que existe.

#Seguranca #Postgres #Supabase #LGPD #ConstruindoEmPublico

**🖼️ Prompt de imagem:** A glowing database cylinder protected inside a translucent layered shield with concentric rings and a subtle padlock motif made of light, conveying defense in depth; calm and secure. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S4. Serverless de verdade (e os tombos)

Coloquei um Express inteiro pra rodar como função serverless. Funcionou — depois de alguns tombos honestos.

O maior: conexão direta com o Postgres simplesmente **não sobe bem no serverless** (cada instância abre conexão e o pool estoura). A correção foi migrar as queries pesadas pro cliente REST do banco e encapsular o SQL complexo em funções no próprio Postgres. Resultado: a API escala horizontalmente sozinha nos picos, sem derrubar o banco.

A lição que ficou: serverless não é "seu servidor de sempre, na nuvem". É outro modelo mental — e ignorar isso custa caro em produção.

Todo atalho de arquitetura cobra juros. A questão é quando.

#Serverless #Vercel #Postgres #Backend #ConstruindoEmPublico

**🖼️ Prompt de imagem:** Floating modular cubes/functions multiplying and scaling out across a soft cloud layer, ephemeral and weightless, with delicate connection lines, conveying auto-scaling on demand. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S5. Permissões sem virar pesadelo

Todo sistema multiusuário morre afogado em "quem pode ver o quê". Quis resolver isso de um jeito que não exigisse um dev pra cada ajuste.

Montei uma matriz **cargo × módulo**: cada cargo tem um nível (de "sem acesso" a "admin") em cada área do sistema, editável numa tela — sem deploy, sem SQL. E um detalhe que adorei: a pessoa ganha acesso elevado automaticamente nas **áreas pelas quais é responsável** (um líder de área vira admin só da sua área).

Pro gestor, virou autonomia: ele promove, rebaixa e ajusta acesso na hora.

A melhor permissão é a que o próprio cliente configura sem te ligar no domingo.

#Arquitetura #ControleDeAcesso #SaaS #DesenvolvimentoDeSoftware #ConstruindoEmPublico

**🖼️ Prompt de imagem:** An elegant grid/matrix of translucent glowing cells, some lit and some dim, with small glass key icons unlocking access levels; a clean control-matrix concept, orderly and calm. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S6. Indicadores que se preenchem sozinhos

A maioria dos dashboards morre por um motivo bobo: ninguém atualiza os números na mão.

Então inverti a lógica. Em vez de pedir pro líder "preencher o KPI", o sistema coleta o **dado bruto** (frequência, batismos, doações…) e **calcula o indicador automaticamente**. Liguei isso a uma "estrela do norte" estratégica com uma matriz visual de valores × áreas. E o recálculo acontece **em tempo real**, por gatilho no banco, no instante em que o dado entra — sem cron, sem clicar em "atualizar".

Pro cliente, é a diferença entre um painel bonito e um painel vivo.

Indicador que depende de força de vontade pra existir já nasceu morto.

#Dados #KPI #Postgres #BusinessIntelligence #ConstruindoEmPublico

**🖼️ Prompt de imagem:** An abstract radial dashboard / mandala of circular gauges and dials filling themselves automatically, with streams of light flowing into them from below; a single bright "north star" point at the top. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S7. Um bot de WhatsApp que coleta dados

Pedi pro líder parar de me mandar planilha. A resposta foi um bot de WhatsApp.

Integrei a **API oficial do WhatsApp (Meta Cloud API)**: o líder manda os números da semana numa conversa normal, ou preenche um **formulário nativo dentro do WhatsApp** (Flows) — sem instalar nada, sem abrir o sistema. O dado cai numa fila de revisão e só entra no banco depois que o coordenador confirma.

WhatsApp é onde as pessoas já estão. Levar o sistema até elas (em vez do contrário) mudou a adesão por completo.

A melhor interface é a que o usuário já sabe usar.

#WhatsAppAPI #Integracao #Automacao #UX #ConstruindoEmPublico

**🖼️ Prompt de imagem:** A friendly rounded chat-bubble funnel: loose conversation bubbles entering at the top and turning into neat, organized data cards at the bottom; messaging transformed into structured information. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S8. IA conversando de verdade (e com bom português)

O bot de WhatsApp não entende só "número solto". Ele conversa.

Por trás dele há um modelo da **Claude (Anthropic)** que interpreta texto livre, lembra o que já foi dito na conversa, pergunta só o que falta, e responde dúvidas institucionais quando é alguém de fora. Detalhe que me deu orgulho: nas mensagens automáticas, a IA **infere o gênero da pessoa pelo nome** e flexiona o texto — "bem-vindo" / "bem-vinda" — em vez do robótico "bem-vindo(a)".

São esses 2% de capricho que separam "parece automático" de "parece que alguém se importou".

Detalhe não é o que sobra no fim — é o que fica na memória de quem recebe.

#IA #Claude #WhatsAppAPI #NLP #ConstruindoEmPublico

**🖼️ Prompt de imagem:** A softly glowing abstract AI orb/neural node gently composing a single natural speech bubble, with delicate light filaments suggesting understanding and care; warm and intelligent. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S9. Uma base de conhecimento que se alimenta sozinha

Toda empresa tem aquela pasta de documentos que ninguém acha nada. Resolvi automatizar o "alguém organiza isso".

Construí o que apelidamos de **Cérebro**: ele monitora as bibliotecas de documentos no **SharePoint (Microsoft Graph)**, extrai o texto de PDFs, planilhas, Word e até imagens, manda pra **Claude** classificar e resumir, e gera notas organizadas e interligadas — automaticamente, todo dia.

O conhecimento da organização para de morar na cabeça de uma pessoa e vira algo pesquisável.

Documento que ninguém encontra é o mesmo que documento que não existe.

#IA #Claude #MicrosoftGraph #GestaoDoConhecimento #ConstruindoEmPublico

**🖼️ Prompt de imagem:** Scattered documents and files flowing upward into a glowing translucent brain/library that auto-organizes them into a connected constellation of linked notes (knowledge graph nodes); order emerging from chaos. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S10. Um agente de IA que age (com humano no comando)

Esse aqui me tirou o sono — no bom sentido. Um agente de IA que não só relata: ele **age**.

É um executor financeiro feito com o **Claude Agent SDK**: ele lê a fila de classificação, contas a pagar e alertas, e **propõe** ações (categorizar lançamento, marcar pagamento, decidir reembolso) usando ferramentas que eu defini. Mas nada é aplicado sozinho: toda proposta cai numa **fila de aprovação humana**. Roda num worker dedicado, com regras absolutas — respeitar fechamento de mês, sempre justificar, nunca inventar.

Autonomia de IA sem freio é passivo. Com humano no loop, vira alavanca.

A pergunta certa não é "a IA consegue fazer?", é "quem assina embaixo?".

#IA #Agentes #Claude #Automacao #Fintech #ConstruindoEmPublico

**🖼️ Prompt de imagem:** A sleek abstract AI agent placing glowing proposal cards onto a tray, while a stylized human hand made of light approves one with a soft checkmark; a balance scale motif suggesting human-in-the-loop control. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S11. Banco na veia: PIX, boletos e conciliação

Integração financeira é onde "quase funciona" não basta. Tem que bater centavo.

Integrei a **API do Santander** direto no sistema: emissão e consulta de **PIX e boletos**, pagamentos, comprovantes. E, do outro lado, parsers de **extrato OFX e de PIX** que fazem a **conciliação automática** — cruzando o que entrou na conta com o que o sistema esperava receber.

O resultado pro cliente: menos planilha, menos digitação manual, menos erro humano no que é mais sensível de todos — o dinheiro.

Em finanças, automação não é luxo: é o que elimina o erro que ninguém quer assinar.

#Fintech #PIX #OpenFinance #Automacao #ConstruindoEmPublico

**🖼️ Prompt de imagem:** Two streams of abstract currency/payment arrows flowing toward each other and snapping into perfectly matched pairs (reconciliation), with subtle vault and gear motifs; precise and automated. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S12. Doação sem fricção (e sem guardar cartão)

Pedir doação online é fácil. Pedir sem assustar o doador — e sem virar um risco de segurança — é o desafio.

Implementei doações com **Stripe** e **Apple Pay**, processadas em **Edge Functions** (funções de borda, rápidas e isoladas). Decisão inegociável: **o sistema nunca guarda número de cartão, CVV ou validade** — isso fica 100% com o provedor certificado. A gente só recebe a confirmação.

Menos dados sensíveis sob sua responsabilidade = menos noites mal dormidas.

O dado mais seguro é o que você escolheu nunca armazenar.

#Pagamentos #Stripe #ApplePay #Seguranca #ConstruindoEmPublico

**🖼️ Prompt de imagem:** A contactless payment gesture: an abstract glass card tapping a soft glowing point, releasing a small heart/coin of light, with a translucent shield behind indicating no sensitive data is stored; generous and safe. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S13. YouTube no piloto automático

A organização transmite ao vivo toda semana. Ninguém merece copiar métricas do YouTube na mão.

Conectei a **API do YouTube (Data + Analytics) via OAuth**: o sistema sincroniza inscritos, views, melhores vídeos e desempenho por série de conteúdo — sozinho, todo dia. E tem um **monitor de live** rodando em **GitHub Actions** que detecta a transmissão no ar e captura o pico de audiência em tempo real.

Métrica que dá trabalho pra coletar nunca é olhada. Métrica automática vira decisão.

Se medir dói, ninguém mede. Então fiz parar de doer.

#YouTubeAPI #Automacao #Dados #Integracao #ConstruindoEmPublico

**🖼️ Prompt de imagem:** An abstract glowing play-triangle emitting rising analytics waves and a live-pulse ring, with charts auto-drawing themselves around it; a sense of continuous automatic measurement (no real platform logo). — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S14. Quando o software encosta no mundo físico

Meu post favorito da série: a hora em que o código sai da tela e mexe em hardware de verdade.

Construí um totem de check-in infantil que, no momento da retirada, **imprime etiquetas de segurança** numa impressora térmica Brother e faz **pagers físicos vibrarem** (aqueles de restaurante) pra chamar a família — falando com o transmissor por um pequeno **agente local** que roda na recepção, já que a nuvem não alcança o hardware da rede interna.

Integrar com o mundo físico é humilhante e divertido: o protocolo é velho, o cabo é de rede, e quando vibra... é mágico.

Software fica inesquecível quando para de ser pixel e vira coisa que acontece no mundo.

#IoT #Hardware #Integracao #Inovacao #ConstruindoEmPublico

**🖼️ Prompt de imagem:** Digital waves of light flowing from a screen and touching physical objects: a small label printer emitting a glowing tag and a round restaurant-style pager puck vibrating with light rings; the moment software meets hardware. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S15. Reconhecimento facial e carteirinha no celular

Fila de check-in de voluntário é chata. Resolvi com a câmera e com a carteira do celular.

Adicionei **reconhecimento facial no navegador** (o voluntário faz check-in só aparecendo na câmera) e gerei a **carteira digital de voluntário** tanto pra **Apple Wallet** quanto pra **Google Wallet** — o crachá vive no celular, com QR Code, sem papel.

Tecnologia de ponta só vale quando some na experiência: ninguém pensa "que IA legal", a pessoa só passa e entra.

A melhor tecnologia é invisível pra quem usa e óbvia pra quem construiu.

#ReconhecimentoFacial #IA #MobileWallet #UX #ConstruindoEmPublico

**🖼️ Prompt de imagem:** An abstract face-mesh scan made of soft glowing dots and lines (no real person), with a translucent digital ID card materializing onto a stylized smartphone, a small QR-like abstract pattern shimmering; seamless and modern. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S16. App no celular + tempo real

Sistema interno bom é o que avisa você antes de você precisar perguntar.

O backend conversa com um app no celular: **notificações push** (via Expo), **check-in com geolocalização** (só valida presença dentro do raio do local do evento) e um **sininho de avisos em tempo real** — quando algo chega, aparece na hora, sem recarregar a página, usando os canais realtime do Supabase.

Tempo real deixou de ser "luxo de produto grande". Hoje é expectativa básica de quem usa.

A diferença entre "atualiza a página" e "já apareceu" é a diferença entre tolerar e gostar.

#Realtime #MobileApp #Expo #Supabase #ConstruindoEmPublico

**🖼️ Prompt de imagem:** A stylized smartphone with a softly pulsing live notification bell, concentric ripple rings radiating outward (instant/real-time), and a subtle geofence radius circle on a minimal map motif; immediate and alive. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S17. IA pra cuidar de gente (não só de dados)

Nem toda IA é sobre eficiência. Essa aqui é sobre atenção.

No módulo de cuidado pastoral, os pedidos de oração que chegam pelo app passam por uma análise da **Claude** que identifica o **tema** de cada um (saúde, família, casamento, trabalho…). Com isso, a liderança vê **padrões**: "essa semana cresceram os pedidos sobre casamento". Deixa de ser uma pilha de mensagens e vira um mapa de onde as pessoas mais precisam de apoio.

IA não substitui o cuidado humano — ela aponta pra onde o cuidado precisa ir.

Dado vira insight quando ajuda alguém a tomar uma decisão melhor sobre uma pessoa real.

#IA #Claude #Dados #ProdutoComProposito #ConstruindoEmPublico

**🖼️ Prompt de imagem:** Many soft message bubbles being gently gathered by a warm AI light and sorted into a few caring themed clusters/petals; human-centered, tender, hopeful — care guided by intelligence. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## S18. Encerramento (com chamada)

Fechei a série de "construindo em público" sobre esse ecossistema — sistema + app — e bate aquela ficha: dá pra entregar, sozinho, o que muita gente acha que precisa de um time inteiro.

Passamos por arquitetura segura no banco, permissões granulares, indicadores que se calculam sozinhos, integrações com WhatsApp, Microsoft, YouTube, Stripe, Apple Pay, Santander, até hardware físico — e IA aplicada de verdade, do agente financeiro com aprovação humana à leitura de pedidos de oração. Mais um app mobile multiplataforma com pagamentos e tempo real.

Mais do que mostrar tecnologia, tentei mostrar **critério**: escolher a ferramenta certa, manter o humano no comando e resolver o problema de quem usa.

**É exatamente isso que eu faço.** Se a sua empresa tem um processo travado em planilha, uma integração que ninguém encara, ou uma ideia de produto/app parada por falta de quem construa — me chama. Bora conversar.

Quem constrói em público também está aberto pra construir junto.

#ConstruindoEmPublico #Freelancer #DesenvolvimentoDeSoftware #IA #DisponivelParaProjetos

**🖼️ Prompt de imagem:** A completed, elegant glowing structure of interconnected modules with a softly lit open doorway/portal in front of it, light spilling out like an invitation; a sense of accomplishment and openness to new opportunities. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---
---

# PARTE B — APLICATIVO (mobile)

## A1. Abertura (app)

Construir um ERP web é uma coisa. Colocar parte dele no bolso de cada pessoa, num app de verdade nas lojas — é outro campeonato.

Em paralelo ao sistema, desenvolvi o **aplicativo de membros**: login, doação, inscrições, check-in, avisos no celular. A meta era simples e difícil: tudo que a pessoa precisa, em poucos toques, sem manual.

Vou contar essa parte também em público — as escolhas de mobile, os pagamentos, as notificações e os perrengues de publicar numa loja de app.

App bom não é o que tem mais telas. É o que resolve a vida do usuário antes de ele desistir.

#ConstruindoEmPublico #BuildInPublic #MobileApp #DesenvolvimentoMobile #UX

**🖼️ Prompt de imagem:** A glowing smartphone being assembled from floating translucent modular blocks (login, payment, check-in, bell), coming to life in mid-air; a mobile-first companion to a larger system. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## A2. Um app, duas lojas (sem escrever duas vezes)

iOS e Android com **um único código-base**. Sem manter dois apps, sem dobrar o esforço.

O aplicativo é feito em **React Native com Expo** — a mesma base de conhecimento do front web (React), agora rodando nativo no celular, com acesso a câmera, localização, notificações e carteira do sistema. Publicar nas lojas vira um fluxo, não um segundo projeto.

Pro cliente, significa chegar no iPhone e no Android ao mesmo tempo, com metade do custo de manutenção.

Reaproveitar conhecimento é a forma mais honesta de ir mais rápido.

#ReactNative #Expo #MobileApp #CrossPlatform #ConstruindoEmPublico

**🖼️ Prompt de imagem:** A single glowing core module splitting cleanly into two identical smartphone silhouettes side by side (representing two platforms from one source), connected by a soft beam of light; unity and symmetry. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## A3. Login sem dor de cabeça

Senha esquecida é a porta onde mais gente desiste. Então tirei o atrito da porta.

No app, a pessoa entra por **e-mail, "Entrar com Google" ou "Entrar com a Apple"** — e quem usa a Apple pode até ocultar o e-mail real (o app recebe só um endereço de relay). A sessão fica salva: nada de logar toda vez que abre. Tudo apoiado no **Supabase Auth**.

Cada toque a menos pra entrar é um usuário a mais que fica.

A melhor tela de login é a que o usuário mal percebe que passou por ela.

#Autenticacao #Supabase #MobileApp #UX #ConstruindoEmPublico

**🖼️ Prompt de imagem:** A smartphone with a softly glowing welcoming gateway/portal on screen and a single frictionless key of light entering it; a sense of effortless, secure access. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## A4. Notificações que chegam na hora

Aviso que chega tarde é o mesmo que aviso que não chegou.

O app manda **notificações push nativas** (via **Expo / APNs**): escala confirmada, pedido aceito, lembrete de evento, resposta da equipe. Cada uma cai direto na tela de bloqueio do celular da pessoa certa — e fica registrada no histórico dentro do app.

Comunicação no tempo certo é o que faz um app virar hábito, não um ícone esquecido na tela.

O melhor canal não é o mais bonito — é o que a pessoa realmente olha.

#PushNotifications #Expo #MobileApp #Engajamento #ConstruindoEmPublico

**🖼️ Prompt de imagem:** A stylized smartphone emitting a soft glowing notification bell with concentric ripple rings spreading outward, a single message card gently surfacing; immediate and alive. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## A5. Doar pelo celular em 2 toques

Se doar dá trabalho, a doação não acontece. Então fiz caber em dois toques.

No app dá pra contribuir por **PIX, cartão de crédito ou Apple Pay** — o pagamento é processado por um provedor certificado (**Stripe**), e o app **nunca guarda dados do cartão**. Toque, confirma, pronto: a confirmação volta na hora.

Reduzir fricção em doação não é detalhe de UX — é o que transforma intenção em generosidade real.

Cada toque a menos entre a vontade e a ação é dinheiro que de fato chega.

#Pagamentos #Pix #ApplePay #Stripe #ConstruindoEmPublico

**🖼️ Prompt de imagem:** A smartphone receiving a contactless tap that releases a glowing heart-coin into it, with a translucent protective shield behind indicating no card data is stored; warm, generous, safe. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## A6. Presença com geolocalização

"Marcar presença" só vale se for de verdade no lugar certo. Resolvi isso com a localização do celular.

No check-in de eventos, o app usa **geofence**: só confirma a presença se a pessoa estiver **dentro do raio do local**, e só no dia do encontro. A localização é pedida apenas naquele momento — não fica gravando trajeto de ninguém.

É a tecnologia garantindo confiança no dado sem virar vigilância.

Confiar é bom; verificar com respeito à privacidade é melhor.

#Geolocalizacao #MobileApp #UX #Privacidade #ConstruindoEmPublico

**🖼️ Prompt de imagem:** A smartphone with a glowing location pin centered inside a soft radius ring over a minimal abstract map; a check-in confirmed only within the circle; clean and trustworthy. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## A7. Tudo num toque (inscrições e oração)

A pessoa não quer "navegar no sistema". Ela quer resolver uma coisa — agora.

Por isso concentrei no app o que mais importa pra quem está do outro lado: **inscrição em batismo, no NEXT, em voluntariado e em grupos**, e até **enviar um pedido de oração** — tudo em poucos toques, e tudo já conectado ao sistema lá atrás (a equipe recebe na hora). O membro não vê a complexidade; ele vê a facilidade.

Esconder a engenharia é o trabalho. A simplicidade na ponta é o resultado.

A melhor experiência é aquela em que o usuário só percebe que deu certo.

#MobileApp #UX #ProdutoDigital #Engajamento #ConstruindoEmPublico

**🖼️ Prompt de imagem:** A smartphone as a central hub with several small glowing action cards (a drop, a calendar, serving hands, a group circle, a prayer spark) flowing into it with a single tap ripple; effortless and unified. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## A8. A carteirinha mora no celular

Crachá de papel se perde, racha, fica em casa. O do celular, não.

No app, a identidade da pessoa vira um **cartão digital com QR Code** — e dá pra salvar na **carteira do celular (Apple/Google Wallet)**. No check-in, é só aproximar: a câmera lê o QR e reconhece quem é, sem fila, sem plástico.

Digitalizar o crachá parece bobo até você ver a fila andar sozinha.

Tirar o papel do caminho é, quase sempre, tirar o atrito do caminho.

#MobileWallet #QRCode #MobileApp #UX #ConstruindoEmPublico

**🖼️ Prompt de imagem:** A smartphone displaying a sleek glowing membership card with an abstract shimmering QR-like pattern, gently lifting into a digital wallet slot; modern and paperless. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.

---

## A9. Privacidade não é checkbox

Publicar na App Store me obrigou a encarar privacidade de frente — e ainda bem.

No app, segui o princípio do **dado mínimo**: pedir só o necessário, **nunca guardar cartão**, pedir localização **só na hora do check-in** (sem rastrear ninguém), e dar à pessoa o controle — incluindo **excluir a própria conta** direto no app. Tudo documentado numa política de privacidade clara, alinhada à LGPD.

Privacidade não é um obstáculo pra lançar — é parte do produto, e do respeito por quem usa.

Tratar dado dos outros com cuidado é a forma mais silenciosa de ganhar confiança.

#Privacidade #LGPD #MobileApp #Seguranca #ConstruindoEmPublico

**🖼️ Prompt de imagem:** A smartphone resting inside a translucent protective glass bubble with a soft glowing lock and a minimalist "less is more" motif (a few small dots instead of many), conveying minimal-data privacy and trust; calm and clean. — premium flat minimal vector illustration with subtle glassmorphism, soft 3D depth and gentle gradients; clean geometric shapes, generous negative space, soft studio lighting, modern tech-editorial aesthetic. Color palette: deep petroleum teal (#00839D), emerald teal (#00B39D), warm sand/cream (#EDE0D4), dark slate charcoal (#16242B), white and soft glass highlights. No text, no letters, no numbers, no real brand logos, no real human faces. Centered composition. Aspect ratio 4:5.
