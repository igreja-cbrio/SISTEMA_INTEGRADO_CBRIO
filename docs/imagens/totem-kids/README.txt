Fotos do manual do Totem Kids

Tira screenshots/fotos com esses nomes e o HTML carrega automatico
(troca os placeholders cinza por imagens reais).

Nomes esperados:
  01-tela-inicial.png      · tela do /ministerial/totem-kids com busca
  02-buscar.png            · busca com 3+ resultados aparecendo
  03-sala-sugerida.png     · crianca selecionada + sala sugerida + obs medica
  04-botao-nova-crianca.png· botao + Nova crianca destacado
  05-checkout-codigo.png   · tela de checkout com codigo digitado
  06-impressora-brother.jpg· foto da Brother QL-820NWB com etiqueta saindo

Como inserir no manual:
1. Salva a imagem nessa pasta com o nome certo
2. No index.html, troca o trecho:
     <div class="foto">
       <strong>📷 Foto aqui:</strong> ...
     </div>
   Por:
     <div class="foto">
       <img src="imagens/01-tela-inicial.png" alt="tela inicial" />
     </div>

Dica · resolucao 1280x720 ou menor pra carregar rapido.
Formato PNG pra screenshots de tela, JPG pra foto de hardware.
