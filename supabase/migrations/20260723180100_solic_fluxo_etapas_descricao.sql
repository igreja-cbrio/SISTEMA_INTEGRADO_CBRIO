-- Explicação por etapa (o "ⓘ" do visualizador de fluxo). Aditivo. Backfill dos
-- textos do fluxo de compras. getFluxoAtivo já faz select('*'), então flui sozinho.
ALTER TABLE public.solic_fluxo_etapas ADD COLUMN IF NOT EXISTS descricao text;

UPDATE public.solic_fluxo_etapas e SET descricao = v.txt
FROM (VALUES
  ('pedido',           'O solicitante abre o pedido descrevendo o que precisa e os itens.'),
  ('aprovacao_origem', 'O diretor da área de quem pediu aprova. É dispensada quando o próprio solicitante é diretor/diretoria, ou quando é uma compra planejada de até R$ 1.000.'),
  ('merito',           'Compras de valor mais alto passam pelo Pastor Presidente antes de seguir (planejada acima de R$ 5.000 ou não planejada acima de R$ 1.000).'),
  ('cotacao',          'O Amaury (compras) levanta o valor e o fornecedor e envia ao financeiro num clique.'),
  ('no_financeiro',    'O Alberto aprova (ou reprova) e escolhe a forma de pagamento — é ela que decide quem executa a compra.'),
  ('compra_cartao',    'Pagamento no cartão de crédito: o pedido volta para o Amaury comprar.'),
  ('pagamento',        'Boleto, Pix ou transferência: a Cristina executa o pagamento.'),
  ('entrega',          'Compra feita ou paga — aguardando o item chegar. Quem executou confirma o recebimento.'),
  ('concluido',        'Item recebido: o pedido é encerrado.')
) AS v(chave, txt)
WHERE e.chave = v.chave
  AND e.fluxo_id IN (SELECT id FROM public.solic_fluxos WHERE categoria='compras' AND versao=1 AND deleted_at IS NULL);
