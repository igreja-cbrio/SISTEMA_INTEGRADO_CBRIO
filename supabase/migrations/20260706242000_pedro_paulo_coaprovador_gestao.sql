-- Pedro Paulo Menezes (diretor criativo) passa a co-aprovar o setor Gestão
-- (pedido do Matheus 06/07: "toda demanda pode ser aprovada por ele"). Assim ele
-- entra no 2º carimbo (Gestão) de qualquer demanda, junto com Eduardo/Juliana.
INSERT INTO public.setor_coaprovadores (setor, profile_id, nome)
SELECT 'Gestao', '381800fb-c6ed-443c-95fe-50799419bea3', 'Pedro Paulo Menezes'
WHERE NOT EXISTS (
  SELECT 1 FROM public.setor_coaprovadores
  WHERE setor = 'Gestao' AND profile_id = '381800fb-c6ed-443c-95fe-50799419bea3'
);
