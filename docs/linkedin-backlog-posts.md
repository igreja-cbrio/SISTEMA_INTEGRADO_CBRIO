# Backlog de posts "Construindo em Público" — LinkedIn

> **Como usar este arquivo:** publique **aos poucos**, de **1 a 3 posts por semana** (não solte tudo de uma vez — a série rende mais engajamento espaçada e mostra consistência). Siga a **numeração**: o post 1 abre a série e o último fecha com a chamada pra atrair oportunidades. Cada post é independente e já está pronto pra copiar e colar.
>
> Tom: **build in public** (não é tutorial). Estrutura de cada post: gancho na 1ª linha → corpo curto em linguagem de benefício → frase de fecho memorável → hashtags.
>
> Tudo aqui é baseado no que **realmente existe** no código do sistema (um ERP completo de gestão para uma igreja). Ajuste nomes/links (ex.: seu @, o nome do projeto) à vontade antes de publicar.
>
> 🎨 **Imagens:** cada post tem um prompt de imagem correspondente (mesma numeração) em **`docs/linkedin-prompts-imagens.md`** — gere todas no mesmo modelo/sessão pra manter a série visualmente coesa.

---

## 1. Abertura da série

Passei os últimos meses construindo um ERP inteiro — sozinho, do banco de dados ao app no celular — e decidi contar como foi, em público.

Não é um CRUDzinho. É um sistema de gestão completo para uma organização real (uma igreja com milhares de pessoas): finanças, voluntariado, eventos, membros, cuidado pastoral, comunicação, indicadores estratégicos. Tudo conversando entre si.

Nas próximas semanas vou abrir o capô: as decisões de arquitetura, as integrações que deram trabalho, onde a IA entrou de verdade (e onde NÃO entrou), e os erros que me ensinaram mais que os acertos.

Se você curte ver software nascendo de dentro — senta que lá vem história.

Construir em público é assumir que o processo vale tanto quanto o resultado.

#ConstruindoEmPublico #BuildInPublic #DesenvolvimentoDeSoftware #EngenhariaDeSoftware #Fullstack

---

## 2. A fundação (a stack)

"Que stack você usou?" — a pergunta que mais recebo. Então vamos a ela.

Front em **React 18 + Vite + TypeScript** com Tailwind e componentes acessíveis. Back em **Node/Express**. Banco **PostgreSQL no Supabase** (com Auth e segurança no próprio banco). Tudo hospedado na **Vercel**, com **Sentry** vigiando erros em produção.

A graça não está em ser exótico — está em ser **boring tech** que escala: ferramentas maduras, previsíveis, que me deixam gastar energia no problema do cliente em vez de domar o framework.

Escolher tecnologia chata o suficiente pra ser confiável é uma decisão de engenharia, não de preguiça.

#React #NodeJS #Supabase #Postgres #ConstruindoEmPublico

---

## 3. Segurança que mora no banco

Regra que adotei cedo: se vazar a chave do front, o estrago tem que ser zero.

Por isso a segurança não vive só no backend — ela mora dentro do Postgres, via **Row Level Security**. Cada tabela com dado sensível (CPF, salário, dados de menores, finanças) tem políticas que decidem, linha a linha, quem pode ver e editar. Somei a isso **soft-delete** (nada some pra sempre — dá pra restaurar) e um **log de auditoria** que registra quem mudou o quê.

Para o cliente isso é abstrato. Até o dia em que não vaza nada — e aí vira a coisa mais importante do mundo.

Segurança boa é a que ninguém percebe que existe.

#Seguranca #Postgres #Supabase #LGPD #ConstruindoEmPublico

---

## 4. Serverless de verdade (e os tombos)

Coloquei um Express inteiro pra rodar como função serverless. Funcionou — depois de alguns tombos honestos.

O maior: conexão direta com o Postgres simplesmente **não sobe bem no serverless** (cada instância abre conexão e o pool estoura). A correção foi migrar as queries pesadas pro cliente REST do banco e encapsular o SQL complexo em funções no próprio Postgres. Resultado: a API escala horizontalmente sozinha nos picos, sem derrubar o banco.

A lição que ficou: serverless não é "seu servidor de sempre, na nuvem". É outro modelo mental — e ignorar isso custa caro em produção.

Todo atalho de arquitetura cobra juros. A questão é quando.

#Serverless #Vercel #Postgres #Backend #ConstruindoEmPublico

---

## 5. Permissões sem virar pesadelo

Todo sistema multiusuário morre afogado em "quem pode ver o quê". Quis resolver isso de um jeito que não exigisse um dev pra cada ajuste.

Montei uma matriz **cargo × módulo**: cada cargo tem um nível (de "sem acesso" a "admin") em cada área do sistema, editável numa tela — sem deploy, sem SQL. E um detalhe que adorei: a pessoa ganha acesso elevado automaticamente nas **áreas pelas quais é responsável** (um líder de área vira admin só da sua área).

Pro gestor, virou autonomia: ele promove, rebaixa e ajusta acesso na hora.

A melhor permissão é a que o próprio cliente configura sem te ligar no domingo.

#Arquitetura #ControleDeAcesso #SaaS #DesenvolvimentoDeSoftware #ConstruindoEmPublico

---

## 6. Indicadores que se preenchem sozinhos

A maioria dos dashboards morre por um motivo bobo: ninguém atualiza os números na mão.

Então inverti a lógica. Em vez de pedir pro líder "preencher o KPI", o sistema coleta o **dado bruto** (frequência, batismos, doações…) e **calcula o indicador automaticamente**. Liguei isso a uma "estrela do norte" estratégica com uma matriz visual de valores × áreas. E o recálculo acontece **em tempo real**, por gatilho no banco, no instante em que o dado entra — sem cron, sem clicar em "atualizar".

Pro cliente, é a diferença entre um painel bonito e um painel vivo.

Indicador que depende de força de vontade pra existir já nasceu morto.

#Dados #KPI #Postgres #BusinessIntelligence #ConstruindoEmPublico

---

## 7. Um bot de WhatsApp que coleta dados

Pedi pro líder parar de me mandar planilha. A resposta foi um bot de WhatsApp.

Integrei a **API oficial do WhatsApp (Meta Cloud API)**: o líder manda os números da semana numa conversa normal, ou preenche um **formulário nativo dentro do WhatsApp** (Flows) — sem instalar nada, sem abrir o sistema. O dado cai numa fila de revisão e só entra no banco depois que o coordenador confirma.

WhatsApp é onde as pessoas já estão. Levar o sistema até elas (em vez do contrário) mudou a adesão por completo.

A melhor interface é a que o usuário já sabe usar.

#WhatsAppAPI #Integracao #Automacao #UX #ConstruindoEmPublico

---

## 8. IA conversando de verdade (e com bom português)

O bot de WhatsApp não entende só "número solto". Ele conversa.

Por trás dele há um modelo da **Claude (Anthropic)** que interpreta texto livre, lembra o que já foi dito na conversa, pergunta só o que falta, e responde dúvidas institucionais quando é alguém de fora. Detalhe que me deu orgulho: nas mensagens automáticas, a IA **infere o gênero pela pessoa pelo nome** e flexiona o texto — "bem-vindo" / "bem-vinda" — em vez do robótico "bem-vindo(a)".

São esses 2% de capricho que separam "parece automático" de "parece que alguém se importou".

Detalhe não é o que sobra no fim — é o que fica na memória de quem recebe.

#IA #Claude #WhatsAppAPI #NLP #ConstruindoEmPublico

---

## 9. Uma base de conhecimento que se alimenta sozinha

Toda empresa tem aquela pasta de documentos que ninguém acha nada. Resolvi automatizar o "alguém organiza isso".

Construí o que apelidamos de **Cérebro**: ele monitora as bibliotecas de documentos no **SharePoint (Microsoft Graph)**, extrai o texto de PDFs, planilhas, Word e até imagens, manda pra **Claude** classificar e resumir, e gera notas organizadas e interligadas — automaticamente, todo dia.

O conhecimento da organização para de morar na cabeça de uma pessoa e vira algo pesquisável.

Documento que ninguém encontra é o mesmo que documento que não existe.

#IA #Claude #MicrosoftGraph #GestaoDoConhecimento #ConstruindoEmPublico

---

## 10. Um agente de IA que age (com humano no comando)

Esse aqui me tirou o sono — no bom sentido. Um agente de IA que não só relata: ele **age**.

É um executor financeiro feito com o **Claude Agent SDK**: ele lê a fila de classificação, contas a pagar e alertas, e **propõe** ações (categorizar lançamento, marcar pagamento, decidir reembolso) usando ferramentas que eu defini. Mas nada é aplicado sozinho: toda proposta cai numa **fila de aprovação humana**. Roda num worker dedicado, com regras absolutas — respeitar fechamento de mês, sempre justificar, nunca inventar.

Autonomia de IA sem freio é passivo. Com humano no loop, vira alavanca.

A pergunta certa não é "a IA consegue fazer?", é "quem assina embaixo?".

#IA #Agentes #Claude #Automacao #Fintech #ConstruindoEmPublico

---

## 11. Banco na veia: PIX, boletos e conciliação

Integração financeira é onde "quase funciona" não basta. Tem que bater centavo.

Integrei a **API do Santander** direto no sistema: emissão e consulta de **PIX e boletos**, pagamentos, comprovantes. E, do outro lado, parsers de **extrato OFX e de PIX** que fazem a **conciliação automática** — cruzando o que entrou na conta com o que o sistema esperava receber.

O resultado pro cliente: menos planilha, menos digitação manual, menos erro humano no que é mais sensível de todos — o dinheiro.

Em finanças, automação não é luxo: é o que elimina o erro que ninguém quer assinar.

#Fintech #PIX #OpenFinance #Automacao #ConstruindoEmPublico

---

## 12. Doação sem fricção (e sem guardar cartão)

Pedir doação online é fácil. Pedir sem assustar o doador — e sem virar um risco de segurança — é o desafio.

Implementei doações com **Stripe** e **Apple Pay**, processadas em **Edge Functions** (funções de borda, rápidas e isoladas). Decisão inegociável: **o sistema nunca guarda número de cartão, CVV ou validade** — isso fica 100% com o provedor certificado. A gente só recebe a confirmação.

Menos dados sensíveis sob sua responsabilidade = menos noites mal dormidas.

O dado mais seguro é o que você escolheu nunca armazenar.

#Pagamentos #Stripe #ApplePay #Seguranca #ConstruindoEmPublico

---

## 13. YouTube no piloto automático

A organização transmite ao vivo toda semana. Ninguém merece copiar métricas do YouTube na mão.

Conectei a **API do YouTube (Data + Analytics) via OAuth**: o sistema sincroniza inscritos, views, melhores vídeos e desempenho por série de conteúdo — sozinho, todo dia. E tem um **monitor de live** rodando em **GitHub Actions** que detecta a transmissão no ar e captura o pico de audiência em tempo real.

Métrica que dá trabalho pra coletar nunca é olhada. Métrica automática vira decisão.

Se medir dói, ninguém mede. Então fiz parar de doer.

#YouTubeAPI #Automacao #Dados #Integracao #ConstruindoEmPublico

---

## 14. Quando o software encosta no mundo físico

Meu post favorito da série: a hora em que o código sai da tela e mexe em hardware de verdade.

Construí um totem de check-in infantil que, no momento da retirada, **imprime etiquetas de segurança** numa impressora térmica Brother e faz **pagers físicos vibrarem** (aqueles de restaurante) pra chamar a família — falando com o transmissor por um pequeno **agente local** que roda na recepção, já que a nuvem não alcança o hardware da rede interna.

Integrar com o mundo físico é humilhante e divertido: o protocolo é velho, o cabo é de rede, e quando vibra... é mágico.

Software fica inesquecível quando para de ser pixel e vira coisa que acontece no mundo.

#IoT #Hardware #Integracao #Inovacao #ConstruindoEmPublico

---

## 15. Reconhecimento facial e carteirinha no celular

Fila de check-in de voluntário é chata. Resolvi com a câmera e com a carteira do celular.

Adicionei **reconhecimento facial no navegador** (o voluntário faz check-in só aparecendo na câmera) e gerei a **carteira digital de voluntário** tanto pra **Apple Wallet** quanto pra **Google Wallet** — o crachá vive no celular, com QR Code, sem papel.

Tecnologia de ponta só vale quando some na experiência: ninguém pensa "que IA legal", a pessoa só passa e entra.

A melhor tecnologia é invisível pra quem usa e óbvia pra quem construiu.

#ReconhecimentoFacial #IA #MobileWallet #UX #ConstruindoEmPublico

---

## 16. App no celular + tempo real

Sistema interno bom é o que avisa você antes de você precisar perguntar.

O backend conversa com um app no celular: **notificações push** (via Expo), **check-in com geolocalização** (só valida presença dentro do raio do local do evento) e um **sininho de avisos em tempo real** — quando algo chega, aparece na hora, sem recarregar a página, usando os canais realtime do Supabase.

Tempo real deixou de ser "luxo de produto grande". Hoje é expectativa básica de quem usa.

A diferença entre "atualiza a página" e "já apareceu" é a diferença entre tolerar e gostar.

#Realtime #MobileApp #Expo #Supabase #ConstruindoEmPublico

---

## 17. IA pra cuidar de gente (não só de dados)

Nem toda IA é sobre eficiência. Essa aqui é sobre atenção.

No módulo de cuidado pastoral, os pedidos de oração que chegam pelo app passam por uma análise da **Claude** que identifica o **tema** de cada um (saúde, família, casamento, trabalho…). Com isso, a liderança vê **padrões**: "essa semana cresceram os pedidos sobre casamento". Deixa de ser uma pilha de mensagens e vira um mapa de onde as pessoas mais precisam de apoio.

IA não substitui o cuidado humano — ela aponta pra onde o cuidado precisa ir.

Dado vira insight quando ajuda alguém a tomar uma decisão melhor sobre uma pessoa real.

#IA #Claude #Dados #ProdutoComProposito #ConstruindoEmPublico

---

## 18. Encerramento (com chamada)

Fechei a série de "construindo em público" sobre esse ERP — e bate aquela ficha: dá pra entregar, sozinho, o que muita gente acha que precisa de um time inteiro.

Ao longo desses posts passamos por arquitetura segura no banco, permissões granulares, indicadores que se calculam sozinhos, integrações com WhatsApp, Microsoft, YouTube, Stripe, Apple Pay, Santander, até hardware físico — e IA aplicada de verdade, do agente financeiro com aprovação humana à leitura de pedidos de oração.

Mais do que mostrar tecnologia, o que tentei mostrar foi **critério**: escolher a ferramenta certa, manter o humano no comando e resolver o problema de quem usa.

**É exatamente isso que eu faço.** Se a sua empresa tem um processo travado em planilha, uma integração que ninguém encara, ou uma ideia de produto parada por falta de quem construa — me chama. Bora conversar.

Quem constrói em público também está aberto pra construir junto.

#ConstruindoEmPublico #Freelancer #DesenvolvimentoDeSoftware #IA #DisponivelParaProjetos
