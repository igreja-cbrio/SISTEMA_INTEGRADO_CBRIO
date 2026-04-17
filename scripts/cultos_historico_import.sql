-- Importação de cultos históricos gerada por scripts/importar_cultos.py
-- Total de cultos a importar: 925

BEGIN;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 01/01/2023',
  '2023-01-01',
  '08:30:00',
  0, 0,
  0, 0,
  0, 0,
  0, 0, 0,
  16
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 01/01/2023',
  '2023-01-01',
  '11:30:00',
  87, 0,
  0, 0,
  0, 0,
  1, 0, 0,
  16
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 01/01/2023',
  '2023-01-01',
  '19:00:00',
  331, 0,
  0, 0,
  0, 3,
  9, 0, 0,
  18
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 04/01/2023',
  '2023-01-04',
  '20:00:00',
  232, 0,
  9, 14,
  468, 6,
  4, 0, 0,
  16
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 07/01/2023',
  '2023-01-07',
  '20:00:00',
  0, 0,
  0, 0,
  0, 0,
  0, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 08/01/2023',
  '2023-01-08',
  '08:30:00',
  73, 0,
  0, 2,
  0, 0,
  0, 0, 0,
  40
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 08/01/2023',
  '2023-01-08',
  '11:30:00',
  482, 91,
  19, 19,
  0, 1,
  2, 0, 0,
  40
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 08/01/2023',
  '2023-01-08',
  '19:00:00',
  417, 71,
  8, 20,
  0, 0,
  4, 0, 0,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 11/01/2023',
  '2023-01-11',
  '20:00:00',
  228, 20,
  12, 8,
  597, 1,
  3, 0, 0,
  26
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 14/01/2023',
  '2023-01-14',
  '20:00:00',
  103, 0,
  0, 0,
  39, 0,
  0, 0, 0,
  16
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 15/01/2023',
  '2023-01-15',
  '08:30:00',
  116, 0,
  1, 2,
  0, 0,
  0, 0, 0,
  48
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 15/01/2023',
  '2023-01-15',
  '11:30:00',
  437, 87,
  10, 22,
  0, 3,
  1, 0, 0,
  48
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 15/01/2023',
  '2023-01-15',
  '19:00:00',
  421, 70,
  7, 16,
  0, 3,
  6, 0, 0,
  38
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 18/01/2023',
  '2023-01-18',
  '20:00:00',
  223, 24,
  1, 0,
  551, 0,
  0, 0, 0,
  26
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 21/01/2023',
  '2023-01-21',
  '20:00:00',
  124, 0,
  0, 0,
  31, 0,
  0, 0, 0,
  14
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 22/01/2023',
  '2023-01-22',
  '08:30:00',
  151, 0,
  0, 1,
  0, 0,
  0, 0, 0,
  36
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 22/01/2023',
  '2023-01-22',
  '11:30:00',
  378, 94,
  14, 24,
  496, 0,
  4, 0, 0,
  37
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 22/01/2023',
  '2023-01-22',
  '19:00:00',
  442, 58,
  9, 28,
  572, 7,
  7, 0, 0,
  36
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 25/01/2023',
  '2023-01-25',
  '20:00:00',
  235, 12,
  15, 5,
  576, 1,
  7, 0, 0,
  28
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 28/01/2023',
  '2023-01-28',
  '20:00:00',
  104, 0,
  0, 0,
  26, 0,
  0, 0, 0,
  11
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 29/01/2023',
  '2023-01-29',
  '08:30:00',
  211, 0,
  0, 0,
  0, 0,
  0, 0, 0,
  27
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 29/01/2023',
  '2023-01-29',
  '11:30:00',
  508, 190,
  37, 13,
  411, 3,
  7, 0, 0,
  27
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 29/01/2023',
  '2023-01-29',
  '19:00:00',
  424, 46,
  7, 13,
  394, 6,
  15, 0, 0,
  35
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-01-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 01/02/2023',
  '2023-02-01',
  '20:00:00',
  197, 23,
  16, 6,
  569, 1,
  7, 0, 0,
  23
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 04/02/2023',
  '2023-02-04',
  '20:00:00',
  118, 0,
  0, 0,
  31, 0,
  0, 0, 0,
  18
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 05/02/2023',
  '2023-02-05',
  '08:30:00',
  137, 0,
  2, 6,
  0, 0,
  0, 0, 0,
  40
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 05/02/2023',
  '2023-02-05',
  '11:30:00',
  386, 82,
  12, 12,
  514, 9,
  9, 0, 0,
  40
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 05/02/2023',
  '2023-02-05',
  '19:00:00',
  412, 108,
  5, 8,
  549, 0,
  13, 0, 0,
  33
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 08/02/2023',
  '2023-02-08',
  '20:00:00',
  196, 16,
  7, 5,
  600, 2,
  4, 0, 0,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 11/02/2023',
  '2023-02-11',
  '20:00:00',
  250, 0,
  0, 0,
  27, 0,
  0, 0, 0,
  10
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 12/02/2023',
  '2023-02-12',
  '08:30:00',
  143, 0,
  3, 5,
  0, 0,
  0, 0, 0,
  66
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 12/02/2023',
  '2023-02-12',
  '11:30:00',
  468, 149,
  10, 11,
  567, 3,
  0, 0, 0,
  66
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 12/02/2023',
  '2023-02-12',
  '19:00:00',
  402, 49,
  14, 26,
  582, 0,
  0, 0, 0,
  44
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 15/02/2023',
  '2023-02-15',
  '20:00:00',
  0, 0,
  11, 6,
  550, 3,
  7, 0, 0,
  27
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 18/02/2023',
  '2023-02-18',
  '20:00:00',
  225, 0,
  0, 0,
  0, 0,
  0, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 19/02/2023',
  '2023-02-19',
  '08:30:00',
  56, 0,
  0, 1,
  0, 0,
  0, 0, 0,
  46
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 19/02/2023',
  '2023-02-19',
  '11:30:00',
  170, 63,
  10, 17,
  321, 4,
  6, 0, 0,
  46
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 19/02/2023',
  '2023-02-19',
  '19:00:00',
  118, 26,
  4, 21,
  207, 4,
  0, 0, 0,
  29
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 22/02/2023',
  '2023-02-22',
  '20:00:00',
  124, 15,
  1, 3,
  558, 5,
  1, 0, 0,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 25/02/2023',
  '2023-02-25',
  '20:00:00',
  116, 0,
  0, 0,
  42, 0,
  0, 0, 0,
  15
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 26/02/2023',
  '2023-02-26',
  '08:30:00',
  135, 0,
  0, 0,
  0, 0,
  0, 0, 0,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 26/02/2023',
  '2023-02-26',
  '11:30:00',
  424, 122,
  5, 11,
  302, 5,
  1, 0, 0,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 26/02/2023',
  '2023-02-26',
  '19:00:00',
  411, 60,
  16, 5,
  433, 5,
  2, 0, 0,
  39
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-02-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 01/03/2023',
  '2023-03-01',
  '20:00:00',
  176, 2,
  3, 1,
  413, 3,
  2, 0, 0,
  32
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 04/03/2023',
  '2023-03-04',
  '20:00:00',
  157, 0,
  0, 0,
  25, 0,
  0, 0, 0,
  12
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 05/03/2023',
  '2023-03-05',
  '08:30:00',
  181, 48,
  2, 3,
  0, 0,
  0, 0, 0,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 05/03/2023',
  '2023-03-05',
  '11:30:00',
  471, 120,
  5, 8,
  0, 3,
  1, 0, 0,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 05/03/2023',
  '2023-03-05',
  '19:00:00',
  383, 80,
  4, 3,
  520, 4,
  11, 0, 0,
  52
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 08/03/2023',
  '2023-03-08',
  '20:00:00',
  208, 31,
  4, 3,
  502, 2,
  2, 0, 0,
  36
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 11/03/2023',
  '2023-03-11',
  '20:00:00',
  141, 0,
  0, 0,
  38, 0,
  0, 0, 0,
  15
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 12/03/2023',
  '2023-03-12',
  '08:30:00',
  146, 180,
  2, 2,
  0, 0,
  0, 0, 0,
  78
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 12/03/2023',
  '2023-03-12',
  '11:30:00',
  485, 121,
  8, 10,
  573, 0,
  9, 0, 0,
  78
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 12/03/2023',
  '2023-03-12',
  '19:00:00',
  464, 54,
  3, 14,
  619, 6,
  3, 0, 0,
  56
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 15/03/2023',
  '2023-03-15',
  '20:00:00',
  224, 27,
  6, 4,
  482, 0,
  3, 0, 0,
  38
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 18/03/2023',
  '2023-03-18',
  '20:00:00',
  134, 0,
  0, 0,
  49, 0,
  0, 0, 0,
  12
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 19/03/2023',
  '2023-03-19',
  '08:30:00',
  229, 44,
  12, 7,
  0, 0,
  0, 0, 0,
  72
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 19/03/2023',
  '2023-03-19',
  '11:30:00',
  547, 109,
  10, 16,
  569, 2,
  6, 0, 0,
  72
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 19/03/2023',
  '2023-03-19',
  '19:00:00',
  419, 44,
  6, 11,
  593, 4,
  10, 0, 0,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 22/03/2023',
  '2023-03-22',
  '20:00:00',
  219, 16,
  5, 3,
  577, 2,
  3, 0, 0,
  38
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 25/03/2023',
  '2023-03-25',
  '20:00:00',
  113, 0,
  0, 0,
  25, 0,
  0, 0, 0,
  16
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 26/03/2023',
  '2023-03-26',
  '08:30:00',
  151, 27,
  2, 9,
  0, 0,
  0, 0, 0,
  71
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 26/03/2023',
  '2023-03-26',
  '11:30:00',
  428, 119,
  14, 13,
  400, 1,
  3, 0, 0,
  71
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 26/03/2023',
  '2023-03-26',
  '19:00:00',
  398, 53,
  8, 16,
  370, 5,
  3, 0, 0,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 29/03/2023',
  '2023-03-29',
  '20:00:00',
  159, 16,
  4, 4,
  336, 12,
  1, 0, 0,
  32
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-03-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 01/04/2023',
  '2023-04-01',
  '20:00:00',
  103, 0,
  0, 0,
  26, 0,
  0, 0, 0,
  10
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 02/04/2023',
  '2023-04-02',
  '08:30:00',
  149, 27,
  0, 0,
  0, 0,
  0, 0, 0,
  77
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 02/04/2023',
  '2023-04-02',
  '11:30:00',
  576, 132,
  0, 0,
  370, 0,
  0, 0, 0,
  77
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 02/04/2023',
  '2023-04-02',
  '19:00:00',
  421, 47,
  13, 29,
  333, 0,
  2, 0, 0,
  67
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 05/04/2023',
  '2023-04-05',
  '20:00:00',
  141, 20,
  4, 2,
  514, 3,
  10, 0, 0,
  44
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 08/04/2023',
  '2023-04-08',
  '20:00:00',
  127, 0,
  0, 0,
  50, 0,
  0, 0, 0,
  12
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 09/04/2023',
  '2023-04-09',
  '08:30:00',
  248, 30,
  5, 1,
  0, 0,
  0, 0, 0,
  62
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 09/04/2023',
  '2023-04-09',
  '11:30:00',
  712, 62,
  17, 30,
  526, 5,
  2, 0, 0,
  62
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 09/04/2023',
  '2023-04-09',
  '19:00:00',
  466, 24,
  15, 22,
  420, 3,
  20, 0, 0,
  53
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 12/04/2023',
  '2023-04-12',
  '20:00:00',
  182, 21,
  8, 8,
  521, 9,
  6, 0, 0,
  45
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 15/04/2023',
  '2023-04-15',
  '20:00:00',
  131, 0,
  0, 0,
  69, 0,
  0, 0, 0,
  13
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 16/04/2023',
  '2023-04-16',
  '08:30:00',
  147, 22,
  1, 7,
  0, 0,
  0, 0, 0,
  83
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 16/04/2023',
  '2023-04-16',
  '11:30:00',
  658, 133,
  5, 19,
  567, 11,
  18, 0, 0,
  83
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 16/04/2023',
  '2023-04-16',
  '19:00:00',
  567, 52,
  6, 25,
  550, 5,
  22, 0, 0,
  70
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 19/04/2023',
  '2023-04-19',
  '20:00:00',
  146, 30,
  5, 8,
  442, 1,
  3, 0, 0,
  51
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 22/04/2023',
  '2023-04-22',
  '20:00:00',
  133, 0,
  0, 0,
  110, 0,
  0, 0, 0,
  12
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 23/04/2023',
  '2023-04-23',
  '08:30:00',
  163, 32,
  1, 1,
  0, 0,
  0, 0, 0,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 23/04/2023',
  '2023-04-23',
  '11:30:00',
  410, 89,
  8, 10,
  480, 0,
  5, 0, 0,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 23/04/2023',
  '2023-04-23',
  '19:00:00',
  403, 81,
  0, 0,
  556, 3,
  8, 0, 0,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 26/04/2023',
  '2023-04-26',
  '20:00:00',
  194, 16,
  4, 7,
  597, 3,
  11, 0, 0,
  50
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 29/04/2023',
  '2023-04-29',
  '20:00:00',
  122, 0,
  0, 0,
  67, 0,
  0, 0, 0,
  14
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 30/04/2023',
  '2023-04-30',
  '08:30:00',
  157, 21,
  2, 0,
  0, 0,
  0, 0, 0,
  79
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 30/04/2023',
  '2023-04-30',
  '11:30:00',
  589, 107,
  13, 33,
  392, 1,
  0, 0, 0,
  79
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 30/04/2023',
  '2023-04-30',
  '19:00:00',
  572, 56,
  4, 12,
  316, 2,
  0, 0, 0,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-04-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 03/05/2023',
  '2023-05-03',
  '20:00:00',
  207, 23,
  4, 3,
  524, 4,
  1, 0, 0,
  45
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 06/05/2023',
  '2023-05-06',
  '20:00:00',
  148, 0,
  0, 0,
  47, 0,
  0, 0, 0,
  12
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 07/05/2023',
  '2023-05-07',
  '08:30:00',
  201, 36,
  0, 7,
  0, 0,
  0, 0, 0,
  85
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 07/05/2023',
  '2023-05-07',
  '11:30:00',
  624, 129,
  12, 10,
  519, 6,
  1, 0, 0,
  85
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 07/05/2023',
  '2023-05-07',
  '19:00:00',
  536, 56,
  5, 15,
  466, 11,
  7, 0, 0,
  70
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 10/05/2023',
  '2023-05-10',
  '20:00:00',
  141, 17,
  2, 1,
  539, 10,
  6, 0, 0,
  53
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 13/05/2023',
  '2023-05-13',
  '20:00:00',
  149, 0,
  2, 0,
  56, 0,
  0, 0, 0,
  21
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 14/05/2023',
  '2023-05-14',
  '08:30:00',
  141, 23,
  1, 5,
  0, 0,
  0, 0, 0,
  74
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 14/05/2023',
  '2023-05-14',
  '11:30:00',
  318, 70,
  6, 6,
  250, 0,
  0, 0, 0,
  74
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 14/05/2023',
  '2023-05-14',
  '19:00:00',
  269, 48,
  0, 6,
  0, 7,
  2, 0, 0,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 17/05/2023',
  '2023-05-17',
  '20:00:00',
  191, 13,
  3, 4,
  546, 6,
  11, 0, 0,
  61
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 20/05/2023',
  '2023-05-20',
  '20:00:00',
  132, 0,
  0, 0,
  33, 0,
  0, 0, 0,
  13
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 21/05/2023',
  '2023-05-21',
  '08:30:00',
  163, 42,
  3, 2,
  0, 0,
  0, 0, 0,
  88
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 21/05/2023',
  '2023-05-21',
  '11:30:00',
  505, 138,
  17, 28,
  465, 0,
  2, 0, 0,
  88
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 21/05/2023',
  '2023-05-21',
  '19:00:00',
  439, 67,
  12, 23,
  409, 4,
  3, 0, 0,
  72
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 24/05/2023',
  '2023-05-24',
  '20:00:00',
  175, 19,
  5, 8,
  568, 8,
  5, 0, 0,
  53
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 27/05/2023',
  '2023-05-27',
  '20:00:00',
  183, 0,
  2, 0,
  38, 0,
  0, 0, 0,
  26
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 28/05/2023',
  '2023-05-28',
  '08:30:00',
  146, 21,
  3, 9,
  0, 0,
  0, 0, 0,
  82
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 28/05/2023',
  '2023-05-28',
  '11:30:00',
  649, 127,
  10, 27,
  545, 10,
  5, 0, 0,
  84
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 28/05/2023',
  '2023-05-28',
  '19:00:00',
  565, 71,
  4, 22,
  476, 12,
  14, 0, 0,
  69
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 31/05/2023',
  '2023-05-31',
  '20:00:00',
  176, 17,
  2, 3,
  578, 9,
  10, 0, 0,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-05-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 03/06/2023',
  '2023-06-03',
  '20:00:00',
  132, 0,
  0, 0,
  59, 1,
  0, 0, 0,
  18
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 04/06/2023',
  '2023-06-04',
  '08:30:00',
  167, 46,
  2, 6,
  0, 0,
  0, 0, 0,
  79
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 04/06/2023',
  '2023-06-04',
  '11:30:00',
  587, 144,
  1, 14,
  529, 14,
  9, 0, 0,
  79
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 04/06/2023',
  '2023-06-04',
  '19:00:00',
  415, 53,
  6, 19,
  460, 21,
  12, 0, 0,
  62
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 07/06/2023',
  '2023-06-07',
  '20:00:00',
  195, 22,
  3, 10,
  444, 3,
  14, 0, 0,
  54
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 10/06/2023',
  '2023-06-10',
  '20:00:00',
  111, 0,
  0, 0,
  46, 0,
  0, 0, 0,
  29
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 11/06/2023',
  '2023-06-11',
  '08:30:00',
  163, 20,
  1, 10,
  0, 0,
  0, 0, 0,
  78
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 11/06/2023',
  '2023-06-11',
  '11:30:00',
  524, 98,
  3, 19,
  524, 3,
  7, 0, 0,
  78
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 11/06/2023',
  '2023-06-11',
  '19:00:00',
  332, 20,
  2, 16,
  470, 2,
  8, 0, 0,
  68
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 14/06/2023',
  '2023-06-14',
  '20:00:00',
  201, 7,
  4, 9,
  584, 18,
  5, 0, 0,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 17/06/2023',
  '2023-06-17',
  '20:00:00',
  127, 0,
  2, 0,
  28, 1,
  0, 0, 0,
  24
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 18/06/2023',
  '2023-06-18',
  '08:30:00',
  157, 24,
  0, 0,
  0, 0,
  0, 0, 0,
  89
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 18/06/2023',
  '2023-06-18',
  '11:30:00',
  431, 111,
  4, 22,
  422, 6,
  3, 0, 0,
  89
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 18/06/2023',
  '2023-06-18',
  '19:00:00',
  373, 43,
  4, 13,
  100, 9,
  7, 0, 0,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 21/06/2023',
  '2023-06-21',
  '20:00:00',
  251, 22,
  2, 9,
  503, 1,
  7, 0, 0,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 24/06/2023',
  '2023-06-24',
  '20:00:00',
  98, 0,
  0, 0,
  105, 0,
  0, 0, 0,
  23
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 25/06/2023',
  '2023-06-25',
  '08:30:00',
  413, 37,
  1, 9,
  0, 0,
  0, 0, 0,
  84
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 25/06/2023',
  '2023-06-25',
  '11:30:00',
  579, 91,
  25, 9,
  589, 5,
  10, 0, 0,
  84
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 25/06/2023',
  '2023-06-25',
  '19:00:00',
  563, 48,
  4, 19,
  516, 11,
  3, 0, 0,
  67
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 28/06/2023',
  '2023-06-28',
  '20:00:00',
  179, 20,
  0, 12,
  544, 13,
  5, 0, 0,
  51
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-06-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 01/07/2023',
  '2023-07-01',
  '20:00:00',
  129, 0,
  2, 0,
  41, 0,
  0, 0, 0,
  26
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 02/07/2023',
  '2023-07-02',
  '08:30:00',
  209, 27,
  2, 7,
  0, 0,
  0, 0, 0,
  91
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 02/07/2023',
  '2023-07-02',
  '11:30:00',
  569, 117,
  5, 16,
  0, 5,
  7, 0, 0,
  91
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 02/07/2023',
  '2023-07-02',
  '19:00:00',
  357, 39,
  6, 15,
  482, 12,
  16, 0, 0,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 05/07/2023',
  '2023-07-05',
  '20:00:00',
  197, 13,
  0, 3,
  482, 0,
  4, 0, 0,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 08/07/2023',
  '2023-07-08',
  '20:00:00',
  86, 0,
  2, 0,
  46, 0,
  0, 0, 0,
  24
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 09/07/2023',
  '2023-07-09',
  '08:30:00',
  156, 24,
  1, 5,
  0, 0,
  0, 0, 0,
  86
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 09/07/2023',
  '2023-07-09',
  '11:30:00',
  581, 113,
  5, 24,
  565, 9,
  10, 0, 0,
  86
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 09/07/2023',
  '2023-07-09',
  '19:00:00',
  554, 40,
  5, 20,
  544, 3,
  13, 0, 0,
  80
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 12/07/2023',
  '2023-07-12',
  '20:00:00',
  216, 37,
  5, 17,
  623, 27,
  7, 0, 0,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 15/07/2023',
  '2023-07-15',
  '20:00:00',
  134, 0,
  0, 0,
  27, 0,
  0, 0, 0,
  22
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 16/07/2023',
  '2023-07-16',
  '08:30:00',
  159, 25,
  4, 15,
  0, 0,
  0, 0, 0,
  85
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 16/07/2023',
  '2023-07-16',
  '11:30:00',
  524, 113,
  3, 32,
  571, 8,
  4, 0, 0,
  85
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 16/07/2023',
  '2023-07-16',
  '19:00:00',
  353, 37,
  15, 42,
  456, 24,
  12, 0, 0,
  70
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 19/07/2023',
  '2023-07-19',
  '20:00:00',
  192, 25,
  5, 9,
  619, 57,
  17, 0, 0,
  62
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 22/07/2023',
  '2023-07-22',
  '20:00:00',
  79, 0,
  1, 0,
  39, 0,
  0, 0, 0,
  22
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 23/07/2023',
  '2023-07-23',
  '08:30:00',
  162, 15,
  3, 8,
  0, 0,
  0, 0, 0,
  86
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 23/07/2023',
  '2023-07-23',
  '11:30:00',
  559, 98,
  2, 19,
  523, 6,
  8, 0, 0,
  86
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 23/07/2023',
  '2023-07-23',
  '19:00:00',
  411, 57,
  2, 22,
  472, 18,
  9, 0, 0,
  69
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 26/07/2023',
  '2023-07-26',
  '20:00:00',
  221, 41,
  4, 19,
  381, 19,
  2, 0, 0,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 29/07/2023',
  '2023-07-29',
  '20:00:00',
  92, 0,
  1, 0,
  43, 0,
  0, 0, 0,
  21
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 30/07/2023',
  '2023-07-30',
  '08:30:00',
  157, 26,
  0, 6,
  0, 0,
  0, 0, 0,
  91
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 30/07/2023',
  '2023-07-30',
  '11:30:00',
  482, 105,
  0, 15,
  425, 3,
  0, 0, 0,
  91
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 30/07/2023',
  '2023-07-30',
  '19:00:00',
  351, 41,
  0, 9,
  389, 2,
  0, 0, 0,
  77
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-07-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 02/08/2023',
  '2023-08-02',
  '20:00:00',
  225, 28,
  0, 1,
  281, 1,
  0, 0, 0,
  44
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 05/08/2023',
  '2023-08-05',
  '20:00:00',
  76, 0,
  2, 2,
  79, 0,
  0, 0, 0,
  23
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 06/08/2023',
  '2023-08-06',
  '08:30:00',
  141, 20,
  0, 9,
  0, 0,
  0, 0, 0,
  79
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 06/08/2023',
  '2023-08-06',
  '11:30:00',
  639, 102,
  3, 24,
  331, 3,
  0, 0, 0,
  79
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 06/08/2023',
  '2023-08-06',
  '19:00:00',
  558, 52,
  2, 13,
  286, 3,
  4, 0, 0,
  65
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 09/08/2023',
  '2023-08-09',
  '20:00:00',
  194, 31,
  2, 12,
  277, 3,
  0, 0, 0,
  53
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 12/08/2023',
  '2023-08-12',
  '20:00:00',
  125, 0,
  3, 8,
  30, 0,
  0, 0, 0,
  22
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 13/08/2023',
  '2023-08-13',
  '08:30:00',
  283, 25,
  1, 4,
  0, 0,
  0, 0, 0,
  81
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 13/08/2023',
  '2023-08-13',
  '11:30:00',
  314, 66,
  3, 14,
  247, 3,
  0, 0, 0,
  81
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 13/08/2023',
  '2023-08-13',
  '19:00:00',
  208, 28,
  1, 4,
  234, 1,
  0, 0, 0,
  68
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 16/08/2023',
  '2023-08-16',
  '20:00:00',
  192, 8,
  0, 5,
  245, 1,
  0, 0, 0,
  49
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 19/08/2023',
  '2023-08-19',
  '20:00:00',
  104, 0,
  5, 6,
  32, 1,
  0, 0, 0,
  21
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 20/08/2023',
  '2023-08-20',
  '08:30:00',
  216, 21,
  1, 8,
  0, 0,
  0, 0, 0,
  89
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 20/08/2023',
  '2023-08-20',
  '11:30:00',
  613, 115,
  10, 18,
  519, 5,
  5, 0, 0,
  89
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 20/08/2023',
  '2023-08-20',
  '19:00:00',
  562, 55,
  3, 21,
  515, 5,
  8, 0, 0,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 23/08/2023',
  '2023-08-23',
  '20:00:00',
  267, 19,
  5, 12,
  597, 6,
  10, 0, 0,
  54
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 26/08/2023',
  '2023-08-26',
  '20:00:00',
  155, 0,
  1, 12,
  86, 1,
  0, 0, 0,
  21
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 27/08/2023',
  '2023-08-27',
  '08:30:00',
  179, 21,
  3, 7,
  0, 0,
  0, 0, 0,
  82
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 27/08/2023',
  '2023-08-27',
  '11:30:00',
  573, 135,
  3, 12,
  603, 3,
  10, 0, 0,
  82
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 27/08/2023',
  '2023-08-27',
  '19:00:00',
  362, 41,
  8, 21,
  612, 4,
  9, 0, 0,
  69
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 30/08/2023',
  '2023-08-30',
  '20:00:00',
  284, 41,
  2, 5,
  592, 2,
  11, 0, 0,
  50
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-08-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 02/09/2023',
  '2023-09-02',
  '20:00:00',
  121, 0,
  2, 10,
  0, 0,
  0, 0, 0,
  24
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 03/09/2023',
  '2023-09-03',
  '08:30:00',
  402, 16,
  0, 3,
  0, 0,
  0, 0, 0,
  82
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 03/09/2023',
  '2023-09-03',
  '11:30:00',
  689, 118,
  6, 20,
  470, 6,
  1, 0, 0,
  82
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 03/09/2023',
  '2023-09-03',
  '19:00:00',
  681, 45,
  7, 22,
  436, 7,
  12, 0, 0,
  66
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 06/09/2023',
  '2023-09-06',
  '20:00:00',
  187, 26,
  0, 12,
  474, 3,
  5, 0, 0,
  52
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 09/09/2023',
  '2023-09-09',
  '20:00:00',
  107, 0,
  4, 4,
  65, 0,
  0, 0, 0,
  22
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 10/09/2023',
  '2023-09-10',
  '08:30:00',
  185, 25,
  1, 5,
  0, 0,
  0, 0, 0,
  92
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 10/09/2023',
  '2023-09-10',
  '11:30:00',
  456, 93,
  8, 15,
  509, 4,
  3, 0, 0,
  92
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 10/09/2023',
  '2023-09-10',
  '19:00:00',
  421, 46,
  2, 19,
  483, 15,
  14, 0, 0,
  67
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 13/09/2023',
  '2023-09-13',
  '20:00:00',
  123, 29,
  1, 7,
  0, 0,
  0, 0, 0,
  61
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 16/09/2023',
  '2023-09-16',
  '20:00:00',
  149, 0,
  0, 13,
  39, 0,
  0, 0, 0,
  29
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 17/09/2023',
  '2023-09-17',
  '08:30:00',
  389, 42,
  5, 22,
  0, 0,
  0, 0, 0,
  98
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 17/09/2023',
  '2023-09-17',
  '11:30:00',
  695, 121,
  2, 24,
  459, 12,
  6, 0, 0,
  98
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 17/09/2023',
  '2023-09-17',
  '19:00:00',
  441, 64,
  1, 11,
  457, 10,
  8, 0, 0,
  76
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 20/09/2023',
  '2023-09-20',
  '20:00:00',
  266, 31,
  1, 7,
  514, 0,
  8, 0, 0,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 23/09/2023',
  '2023-09-23',
  '20:00:00',
  103, 0,
  0, 9,
  40, 0,
  0, 0, 0,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 24/09/2023',
  '2023-09-24',
  '08:30:00',
  305, 26,
  1, 10,
  0, 0,
  0, 0, 0,
  112
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 24/09/2023',
  '2023-09-24',
  '11:30:00',
  597, 106,
  5, 16,
  539, 2,
  5, 0, 0,
  112
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 24/09/2023',
  '2023-09-24',
  '19:00:00',
  403, 42,
  2, 16,
  521, 16,
  6, 0, 0,
  92
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 27/09/2023',
  '2023-09-27',
  '20:00:00',
  148, 24,
  1, 6,
  0, 0,
  3, 0, 0,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 30/09/2023',
  '2023-09-30',
  '20:00:00',
  137, 0,
  0, 5,
  0, 0,
  0, 0, 0,
  23
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-09-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 01/10/2023',
  '2023-10-01',
  '08:30:00',
  189, 22,
  1, 3,
  0, 0,
  0, 0, 0,
  69
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 01/10/2023',
  '2023-10-01',
  '11:30:00',
  562, 80,
  5, 17,
  491, 2,
  7, 0, 0,
  69
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 01/10/2023',
  '2023-10-01',
  '19:00:00',
  608, 53,
  5, 21,
  417, 9,
  9, 0, 0,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 04/10/2023',
  '2023-10-04',
  '20:00:00',
  212, 18,
  2, 10,
  554, 3,
  4, 0, 0,
  54
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 07/10/2023',
  '2023-10-07',
  '20:00:00',
  89, 0,
  1, 3,
  33, 0,
  0, 0, 0,
  22
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 08/10/2023',
  '2023-10-08',
  '08:30:00',
  231, 28,
  1, 5,
  0, 0,
  0, 0, 0,
  98
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 08/10/2023',
  '2023-10-08',
  '11:30:00',
  542, 125,
  2, 13,
  560, 3,
  9, 0, 0,
  98
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 08/10/2023',
  '2023-10-08',
  '19:00:00',
  508, 61,
  9, 19,
  468, 2,
  3, 0, 0,
  71
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 11/10/2023',
  '2023-10-11',
  '20:00:00',
  203, 28,
  2, 3,
  421, 3,
  6, 0, 0,
  53
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 14/10/2023',
  '2023-10-14',
  '20:00:00',
  87, 0,
  0, 2,
  60, 0,
  0, 0, 0,
  22
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 15/10/2023',
  '2023-10-15',
  '08:30:00',
  394, 30,
  9, 17,
  0, 0,
  0, 0, 0,
  116
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 15/10/2023',
  '2023-10-15',
  '11:30:00',
  712, 101,
  5, 39,
  535, 3,
  7, 0, 0,
  116
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 15/10/2023',
  '2023-10-15',
  '19:00:00',
  529, 51,
  3, 15,
  552, 15,
  11, 0, 0,
  70
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 18/10/2023',
  '2023-10-18',
  '20:00:00',
  249, 24,
  2, 10,
  533, 0,
  5, 0, 0,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 21/10/2023',
  '2023-10-21',
  '20:00:00',
  117, 0,
  0, 3,
  40, 0,
  0, 0, 0,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 22/10/2023',
  '2023-10-22',
  '08:30:00',
  217, 38,
  4, 7,
  0, 0,
  0, 0, 0,
  92
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 22/10/2023',
  '2023-10-22',
  '11:30:00',
  595, 100,
  4, 18,
  591, 1,
  5, 0, 324,
  92
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 22/10/2023',
  '2023-10-22',
  '19:00:00',
  421, 37,
  3, 8,
  471, 1,
  5, 0, 451,
  68
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 25/10/2023',
  '2023-10-25',
  '20:00:00',
  227, 17,
  2, 9,
  573, 0,
  9, 0, 0,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 28/10/2023',
  '2023-10-28',
  '20:00:00',
  214, 0,
  0, 4,
  0, 0,
  0, 0, 0,
  22
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 29/10/2023',
  '2023-10-29',
  '08:30:00',
  582, 18,
  0, 6,
  0, 0,
  0, 0, 0,
  93
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 29/10/2023',
  '2023-10-29',
  '11:30:00',
  718, 112,
  2, 16,
  532, 10,
  5, 0, 550,
  93
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 29/10/2023',
  '2023-10-29',
  '19:00:00',
  568, 71,
  3, 15,
  539, 4,
  9, 0, 818,
  61
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-10-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 01/11/2023',
  '2023-11-01',
  '20:00:00',
  178, 35,
  3, 6,
  470, 2,
  4, 0, 0,
  63
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 04/11/2023',
  '2023-11-04',
  '20:00:00',
  96, 0,
  0, 2,
  63, 0,
  0, 0, 0,
  27
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 05/11/2023',
  '2023-11-05',
  '08:30:00',
  283, 40,
  2, 10,
  0, 0,
  0, 0, 0,
  101
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 05/11/2023',
  '2023-11-05',
  '11:30:00',
  592, 104,
  2, 11,
  482, 7,
  10, 0, 345,
  101
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 05/11/2023',
  '2023-11-05',
  '19:00:00',
  431, 51,
  2, 11,
  530, 5,
  7, 0, 589,
  72
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 08/11/2023',
  '2023-11-08',
  '20:00:00',
  203, 21,
  2, 2,
  492, 6,
  4, 0, 0,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 11/11/2023',
  '2023-11-11',
  '20:00:00',
  142, 0,
  2, 9,
  62, 0,
  0, 0, 0,
  20
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 12/11/2023',
  '2023-11-12',
  '08:30:00',
  211, 19,
  2, 7,
  0, 0,
  0, 0, 0,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 12/11/2023',
  '2023-11-12',
  '11:30:00',
  394, 78,
  4, 10,
  389, 7,
  1, 0, 371,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 12/11/2023',
  '2023-11-12',
  '19:00:00',
  494, 102,
  3, 22,
  437, 6,
  4, 0, 565,
  72
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 15/11/2023',
  '2023-11-15',
  '20:00:00',
  173, 22,
  2, 9,
  487, 1,
  7, 0, 0,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 18/11/2023',
  '2023-11-18',
  '20:00:00',
  71, 0,
  0, 4,
  12, 0,
  0, 0, 0,
  22
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 19/11/2023',
  '2023-11-19',
  '08:30:00',
  213, 28,
  3, 10,
  0, 0,
  0, 0, 0,
  101
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 19/11/2023',
  '2023-11-19',
  '11:30:00',
  476, 79,
  9, 33,
  392, 0,
  1, 0, 219,
  101
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 19/11/2023',
  '2023-11-19',
  '19:00:00',
  523, 50,
  3, 16,
  287, 1,
  1, 0, 195,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 22/11/2023',
  '2023-11-22',
  '20:00:00',
  198, 24,
  0, 4,
  431, 2,
  9, 0, 0,
  61
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 25/11/2023',
  '2023-11-25',
  '20:00:00',
  289, 0,
  4, 22,
  58, 0,
  0, 0, 0,
  50
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 26/11/2023',
  '2023-11-26',
  '08:30:00',
  209, 24,
  1, 7,
  0, 0,
  0, 0, 0,
  83
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 26/11/2023',
  '2023-11-26',
  '11:30:00',
  464, 79,
  3, 14,
  304, 0,
  0, 0, 133,
  83
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 26/11/2023',
  '2023-11-26',
  '19:00:00',
  510, 46,
  5, 22,
  233, 1,
  3, 0, 315,
  70
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 29/11/2023',
  '2023-11-29',
  '20:00:00',
  0, 30,
  0, 5,
  455, 1,
  3, 0, 0,
  54
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-11-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 02/12/2023',
  '2023-12-02',
  '20:00:00',
  92, 0,
  0, 3,
  39, 0,
  0, 0, 0,
  22
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 03/12/2023',
  '2023-12-03',
  '08:30:00',
  272, 26,
  2, 14,
  0, 0,
  0, 0, 0,
  94
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 03/12/2023',
  '2023-12-03',
  '11:30:00',
  558, 92,
  6, 17,
  399, 6,
  4, 0, 280,
  94
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 03/12/2023',
  '2023-12-03',
  '19:00:00',
  484, 60,
  0, 6,
  333, 1,
  1, 0, 575,
  64
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 06/12/2023',
  '2023-12-06',
  '20:00:00',
  184, 31,
  5, 6,
  411, 0,
  1, 0, 0,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 09/12/2023',
  '2023-12-09',
  '20:00:00',
  57, 0,
  0, 0,
  41, 0,
  0, 0, 0,
  33
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 10/12/2023',
  '2023-12-10',
  '08:30:00',
  204, 15,
  1, 6,
  0, 0,
  0, 0, 0,
  85
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 10/12/2023',
  '2023-12-10',
  '11:30:00',
  604, 81,
  2, 10,
  443, 9,
  7, 0, 405,
  85
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 10/12/2023',
  '2023-12-10',
  '19:00:00',
  581, 43,
  2, 9,
  397, 9,
  8, 0, 367,
  67
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 13/12/2023',
  '2023-12-13',
  '20:00:00',
  191, 26,
  1, 4,
  486, 0,
  1, 0, 0,
  68
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 16/12/2023',
  '2023-12-16',
  '20:00:00',
  135, 0,
  1, 2,
  22, 0,
  0, 0, 0,
  24
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 17/12/2023',
  '2023-12-17',
  '08:30:00',
  282, 24,
  3, 10,
  0, 0,
  0, 0, 0,
  96
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 17/12/2023',
  '2023-12-17',
  '11:30:00',
  479, 82,
  3, 23,
  409, 2,
  1, 0, 178,
  96
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 17/12/2023',
  '2023-12-17',
  '19:00:00',
  408, 44,
  0, 10,
  392, 3,
  10, 0, 538,
  66
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 20/12/2023',
  '2023-12-20',
  '20:00:00',
  203, 16,
  2, 4,
  414, 1,
  2, 0, 0,
  53
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 23/12/2023',
  '2023-12-23',
  '20:00:00',
  0, 0,
  0, 0,
  0, 0,
  0, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 24/12/2023',
  '2023-12-24',
  '08:30:00',
  598, 0,
  9, 10,
  0, 0,
  0, 0, 0,
  78
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 24/12/2023',
  '2023-12-24',
  '11:30:00',
  648, 0,
  7, 29,
  187, 1,
  0, 0, 416,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 24/12/2023',
  '2023-12-24',
  '19:00:00',
  287, 0,
  0, 22,
  281, 9,
  4, 0, 126,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 27/12/2023',
  '2023-12-27',
  '20:00:00',
  153, 18,
  0, 0,
  478, 3,
  15, 0, 0,
  50
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 30/12/2023',
  '2023-12-30',
  '20:00:00',
  0, 0,
  0, 0,
  0, 0,
  0, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 31/12/2023',
  '2023-12-31',
  '08:30:00',
  0, 0,
  0, 0,
  0, 0,
  0, 0, 0,
  61
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 31/12/2023',
  '2023-12-31',
  '11:30:00',
  391, 41,
  8, 24,
  354, 6,
  5, 0, 136,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 31/12/2023',
  '2023-12-31',
  '19:00:00',
  0, 0,
  0, 41,
  254, 5,
  4, 0, 503,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2023-12-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 03/01/2024',
  '2024-01-03',
  '20:00:00',
  352, 36,
  2, 12,
  403, 11,
  1, 1184, 186,
  45
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 06/01/2024',
  '2024-01-06',
  '20:00:00',
  130, 0,
  1, 1,
  38, 0,
  0, 284, 45,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 07/01/2024',
  '2024-01-07',
  '08:30:00',
  352, 34,
  0, 20,
  0, 0,
  0, 0, 0,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 07/01/2024',
  '2024-01-07',
  '11:30:00',
  657, 106,
  5, 15,
  484, 5,
  4, 1449, 311,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 07/01/2024',
  '2024-01-07',
  '19:00:00',
  633, 56,
  1, 11,
  440, 7,
  8, 1218, 547,
  37
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 10/01/2024',
  '2024-01-10',
  '20:00:00',
  292, 37,
  2, 10,
  484, 1,
  1, 1348, 287,
  43
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 13/01/2024',
  '2024-01-13',
  '20:00:00',
  82, 0,
  0, 1,
  53, 1,
  0, 297, 42,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 14/01/2024',
  '2024-01-14',
  '08:30:00',
  203, 12,
  1, 9,
  0, 0,
  0, 0, 0,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 14/01/2024',
  '2024-01-14',
  '11:30:00',
  475, 103,
  5, 18,
  684, 1,
  2, 1448, 287,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 14/01/2024',
  '2024-01-14',
  '19:00:00',
  459, 49,
  1, 21,
  467, 7,
  18, 1227, 513,
  45
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 17/01/2024',
  '2024-01-17',
  '20:00:00',
  268, 45,
  1, 9,
  548, 2,
  13, 1491, 305,
  36
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 20/01/2024',
  '2024-01-20',
  '20:00:00',
  124, 0,
  0, 5,
  37, 0,
  0, 310, 53,
  22
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 21/01/2024',
  '2024-01-21',
  '08:30:00',
  362, 17,
  0, 2,
  0, 0,
  0, 0, 0,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 21/01/2024',
  '2024-01-21',
  '11:30:00',
  762, 59,
  3, 26,
  445, 5,
  2, 1219, 239,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 21/01/2024',
  '2024-01-21',
  '19:00:00',
  594, 46,
  2, 18,
  334, 5,
  3, 1089, 388,
  35
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 24/01/2024',
  '2024-01-24',
  '20:00:00',
  217, 29,
  1, 0,
  584, 2,
  3, 1755, 334,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 27/01/2024',
  '2024-01-27',
  '20:00:00',
  174, 0,
  0, 17,
  39, 0,
  0, 269, 56,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 28/01/2024',
  '2024-01-28',
  '08:30:00',
  287, 33,
  0, 7,
  0, 0,
  0, 0, 0,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 28/01/2024',
  '2024-01-28',
  '11:30:00',
  714, 153,
  4, 23,
  653, 5,
  14, 1886, 469,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 28/01/2024',
  '2024-01-28',
  '19:00:00',
  442, 34,
  3, 17,
  569, 1,
  9, 1444, 785,
  49
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 31/01/2024',
  '2024-01-31',
  '20:00:00',
  234, 24,
  1, 11,
  663, 9,
  4, 1582, 281,
  9
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-01-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 03/02/2024',
  '2024-02-03',
  '20:00:00',
  154, 0,
  0, 3,
  38, 0,
  0, 256, 47,
  33
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 04/02/2024',
  '2024-02-04',
  '08:30:00',
  476, 35,
  1, 6,
  0, 0,
  0, 0, 0,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 04/02/2024',
  '2024-02-04',
  '11:30:00',
  706, 111,
  4, 21,
  528, 2,
  9, 1545, 408,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 04/02/2024',
  '2024-02-04',
  '19:00:00',
  609, 45,
  0, 13,
  516, 8,
  2, 1027, 649,
  46
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 07/02/2024',
  '2024-02-07',
  '20:00:00',
  213, 37,
  1, 6,
  479, 0,
  3, 1605, 408,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 10/02/2024',
  '2024-02-10',
  '20:00:00',
  305, 0,
  43, 0,
  0, 0,
  0, 0, 0,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 11/02/2024',
  '2024-02-11',
  '08:30:00',
  305, 19,
  2, 8,
  0, 0,
  0, 0, 0,
  61
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 11/02/2024',
  '2024-02-11',
  '11:30:00',
  447, 60,
  3, 14,
  356, 0,
  1, 1229, 119,
  61
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 11/02/2024',
  '2024-02-11',
  '19:00:00',
  402, 28,
  2, 10,
  280, 12,
  2, 962, 211,
  41
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 14/02/2024',
  '2024-02-14',
  '20:00:00',
  178, 23,
  2, 10,
  649, 12,
  2, 1595, 410,
  46
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 17/02/2024',
  '2024-02-17',
  '20:00:00',
  318, 0,
  0, 0,
  73, 0,
  0, 558, 98,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 18/02/2024',
  '2024-02-18',
  '08:30:00',
  378, 41,
  0, 5,
  0, 0,
  0, 0, 0,
  54
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 18/02/2024',
  '2024-02-18',
  '11:30:00',
  661, 105,
  2, 16,
  677, 16,
  6, 1492, 359,
  54
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 18/02/2024',
  '2024-02-18',
  '19:00:00',
  648, 62,
  1, 21,
  575, 4,
  17, 1232, 644,
  45
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 21/02/2024',
  '2024-02-21',
  '20:00:00',
  328, 35,
  4, 11,
  382, 13,
  7, 1835, 320,
  35
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 24/02/2024',
  '2024-02-24',
  '20:00:00',
  172, 0,
  4, 8,
  36, 0,
  0, 262, 70,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 25/02/2024',
  '2024-02-25',
  '08:30:00',
  397, 31,
  3, 21,
  136, 0,
  0, 818, 192,
  80
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 25/02/2024',
  '2024-02-25',
  '11:30:00',
  699, 99,
  2, 38,
  370, 4,
  4, 1365, 193,
  80
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 25/02/2024',
  '2024-02-25',
  '19:00:00',
  653, 74,
  4, 17,
  472, 0,
  4, 1279, 304,
  36
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 28/02/2024',
  '2024-02-28',
  '20:00:00',
  398, 29,
  9, 12,
  708, 0,
  27, 1723, 303,
  53
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-02-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 02/03/2024',
  '2024-03-02',
  '20:00:00',
  215, 0,
  1, 13,
  53, 0,
  0, 299, 59,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 03/03/2024',
  '2024-03-03',
  '08:30:00',
  487, 39,
  10, 14,
  329, 8,
  4, 761, 290,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 03/03/2024',
  '2024-03-03',
  '11:30:00',
  712, 125,
  4, 18,
  424, 4,
  6, 1148, 215,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 03/03/2024',
  '2024-03-03',
  '19:00:00',
  677, 63,
  4, 8,
  472, 4,
  11, 1158, 345,
  54
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 06/03/2024',
  '2024-03-06',
  '20:00:00',
  401, 34,
  11, 11,
  717, 3,
  15, 1423, 616,
  43
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 09/03/2024',
  '2024-03-09',
  '20:00:00',
  220, 0,
  3, 10,
  33, 0,
  0, 252, 44,
  28
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 10/03/2024',
  '2024-03-10',
  '08:30:00',
  314, 33,
  8, 7,
  340, 4,
  0, 856, 224,
  54
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 10/03/2024',
  '2024-03-10',
  '11:30:00',
  805, 122,
  4, 45,
  465, 3,
  1, 1159, 136,
  54
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 10/03/2024',
  '2024-03-10',
  '19:00:00',
  527, 63,
  4, 18,
  429, 3,
  6, 1212, 380,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 13/03/2024',
  '2024-03-13',
  '20:00:00',
  369, 30,
  3, 13,
  621, 0,
  15, 1651, 328,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 16/03/2024',
  '2024-03-16',
  '20:00:00',
  212, 0,
  3, 7,
  22, 0,
  0, 256, 50,
  31
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 17/03/2024',
  '2024-03-17',
  '08:30:00',
  403, 50,
  6, 14,
  385, 4,
  1, 1051, 473,
  43
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 17/03/2024',
  '2024-03-17',
  '11:30:00',
  657, 111,
  9, 18,
  423, 5,
  3, 1130, 240,
  43
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 17/03/2024',
  '2024-03-17',
  '19:00:00',
  602, 61,
  3, 17,
  480, 2,
  18, 1184, 403,
  35
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 20/03/2024',
  '2024-03-20',
  '20:00:00',
  384, 20,
  2, 8,
  668, 6,
  5, 1712, 359,
  43
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 23/03/2024',
  '2024-03-23',
  '20:00:00',
  166, 0,
  8, 9,
  33, 0,
  0, 309, 37,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 24/03/2024',
  '2024-03-24',
  '08:30:00',
  348, 43,
  2, 10,
  458, 8,
  4, 1229, 233,
  74
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 24/03/2024',
  '2024-03-24',
  '11:30:00',
  678, 100,
  7, 22,
  611, 3,
  8, 1430, 242,
  74
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 24/03/2024',
  '2024-03-24',
  '19:00:00',
  373, 46,
  4, 14,
  574, 12,
  15, 1711, 454,
  50
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 27/03/2024',
  '2024-03-27',
  '20:00:00',
  381, 29,
  0, 6,
  649, 3,
  3, 1735, 341,
  47
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 30/03/2024',
  '2024-03-30',
  '20:00:00',
  458, 0,
  8, 26,
  313, 0,
  7, 1020, 72,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 31/03/2024',
  '2024-03-31',
  '08:30:00',
  543, 5,
  4, 21,
  354, 2,
  7, 936, 95,
  100
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 31/03/2024',
  '2024-03-31',
  '11:30:00',
  815, 14,
  7, 35,
  359, 2,
  2, 1070, 117,
  100
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 31/03/2024',
  '2024-03-31',
  '19:00:00',
  718, 9,
  9, 30,
  413, 6,
  5, 1144, 606,
  81
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-03-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 03/04/2024',
  '2024-04-03',
  '20:00:00',
  278, 20,
  0, 12,
  601, 4,
  4, 1770, 340,
  40
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 06/04/2024',
  '2024-04-06',
  '20:00:00',
  128, 0,
  0, 2,
  39, 1,
  0, 286, 55,
  33
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 07/04/2024',
  '2024-04-07',
  '08:30:00',
  385, 35,
  2, 15,
  380, 4,
  17, 943, 65,
  56
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 07/04/2024',
  '2024-04-07',
  '11:30:00',
  593, 109,
  4, 9,
  417, 3,
  7, 1087, 95,
  56
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 07/04/2024',
  '2024-04-07',
  '19:00:00',
  553, 56,
  3, 14,
  499, 2,
  2, 1077, 970,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 10/04/2024',
  '2024-04-10',
  '20:00:00',
  307, 22,
  3, 11,
  613, 1,
  3, 1787, 260,
  49
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 13/04/2024',
  '2024-04-13',
  '20:00:00',
  135, 0,
  1, 5,
  30, 0,
  0, 309, 87,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 14/04/2024',
  '2024-04-14',
  '08:30:00',
  366, 31,
  1, 6,
  0, 0,
  0, 0, 0,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 14/04/2024',
  '2024-04-14',
  '11:30:00',
  613, 115,
  4, 15,
  547, 2,
  19, 1462, 109,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 14/04/2024',
  '2024-04-14',
  '19:00:00',
  590, 53,
  2, 13,
  602, 9,
  7, 1373, 845,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 17/04/2024',
  '2024-04-17',
  '20:00:00',
  251, 18,
  1, 9,
  587, 2,
  5, 1669, 319,
  47
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 20/04/2024',
  '2024-04-20',
  '20:00:00',
  137, 0,
  0, 5,
  35, 0,
  0, 269, 21,
  26
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 21/04/2024',
  '2024-04-21',
  '08:30:00',
  228, 35,
  0, 3,
  243, 11,
  4, 646, 39,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 21/04/2024',
  '2024-04-21',
  '11:30:00',
  439, 87,
  0, 14,
  298, 2,
  5, 846, 289,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 21/04/2024',
  '2024-04-21',
  '19:00:00',
  447, 55,
  3, 10,
  310, 5,
  2, 817, 92,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 24/04/2024',
  '2024-04-24',
  '20:00:00',
  267, 20,
  5, 4,
  626, 1,
  14, 1660, 358,
  51
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 27/04/2024',
  '2024-04-27',
  '20:00:00',
  129, 0,
  0, 4,
  82, 0,
  0, 290, 79,
  29
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 28/04/2024',
  '2024-04-28',
  '08:30:00',
  361, 36,
  2, 13,
  420, 9,
  9, 1006, 70,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 28/04/2024',
  '2024-04-28',
  '11:30:00',
  679, 108,
  12, 37,
  397, 7,
  10, 1082, 429,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 28/04/2024',
  '2024-04-28',
  '19:00:00',
  528, 68,
  7, 17,
  440, 9,
  10, 1190, 220,
  52
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-04-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 01/05/2024',
  '2024-05-01',
  '20:00:00',
  204, 23,
  3, 12,
  596, 7,
  7, 1646, 326,
  50
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 04/05/2024',
  '2024-05-04',
  '20:00:00',
  162, 0,
  1, 7,
  50, 0,
  0, 304, 67,
  27
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 05/05/2024',
  '2024-05-05',
  '08:30:00',
  334, 37,
  0, 11,
  230, 6,
  0, 786, 30,
  69
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 05/05/2024',
  '2024-05-05',
  '11:30:00',
  693, 106,
  5, 28,
  287, 8,
  5, 997, 251,
  69
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 05/05/2024',
  '2024-05-05',
  '19:00:00',
  503, 65,
  0, 14,
  319, 7,
  1, 1057, 123,
  61
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 08/05/2024',
  '2024-05-08',
  '20:00:00',
  247, 28,
  2, 10,
  655, 1,
  8, 1728, 283,
  47
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 11/05/2024',
  '2024-05-11',
  '20:00:00',
  209, 0,
  0, 6,
  49, 0,
  0, 429, 48,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 12/05/2024',
  '2024-05-12',
  '08:30:00',
  289, 44,
  5, 8,
  311, 11,
  4, 814, 130,
  104
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 12/05/2024',
  '2024-05-12',
  '11:30:00',
  393, 64,
  0, 6,
  275, 3,
  2, 703, 296,
  104
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 12/05/2024',
  '2024-05-12',
  '19:00:00',
  295, 43,
  2, 17,
  474, 8,
  16, 988, 313,
  64
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 15/05/2024',
  '2024-05-15',
  '20:00:00',
  225, 21,
  2, 7,
  690, 11,
  9, 1676, 299,
  49
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 18/05/2024',
  '2024-05-18',
  '20:00:00',
  120, 0,
  0, 2,
  42, 0,
  0, 317, 46,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 19/05/2024',
  '2024-05-19',
  '08:30:00',
  263, 43,
  1, 3,
  339, 0,
  10, 927, 267,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 19/05/2024',
  '2024-05-19',
  '11:30:00',
  556, 94,
  0, 17,
  360, 10,
  2, 979, 216,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 19/05/2024',
  '2024-05-19',
  '19:00:00',
  525, 60,
  2, 17,
  358, 19,
  0, 1091, 254,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 22/05/2024',
  '2024-05-22',
  '20:00:00',
  292, 34,
  7, 18,
  587, 1,
  12, 1648, 337,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 25/05/2024',
  '2024-05-25',
  '20:00:00',
  166, 0,
  0, 8,
  33, 0,
  0, 287, 49,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 26/05/2024',
  '2024-05-26',
  '08:30:00',
  306, 16,
  0, 9,
  322, 2,
  3, 1030, 78,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 26/05/2024',
  '2024-05-26',
  '11:30:00',
  672, 89,
  5, 29,
  397, 0,
  2, 1102, 170,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 26/05/2024',
  '2024-05-26',
  '19:00:00',
  327, 50,
  1, 11,
  424, 10,
  4, 1033, 129,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 29/05/2024',
  '2024-05-29',
  '20:00:00',
  302, 29,
  0, 6,
  591, 4,
  9, 1561, 385,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-05-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 01/06/2024',
  '2024-06-01',
  '20:00:00',
  164, 0,
  0, 2,
  36, 0,
  0, 239, 99,
  32
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 02/06/2024',
  '2024-06-02',
  '08:30:00',
  314, 33,
  2, 9,
  326, 2,
  6, 713, 53,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 02/06/2024',
  '2024-06-02',
  '11:30:00',
  708, 113,
  5, 17,
  432, 2,
  7, 963, 585,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 02/06/2024',
  '2024-06-02',
  '19:00:00',
  503, 45,
  4, 0,
  500, 2,
  4, 1221, 168,
  66
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 05/06/2024',
  '2024-06-05',
  '20:00:00',
  318, 31,
  6, 17,
  710, 5,
  2, 1852, 369,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 08/06/2024',
  '2024-06-08',
  '20:00:00',
  246, 0,
  0, 12,
  51, 0,
  0, 296, 35,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 09/06/2024',
  '2024-06-09',
  '08:30:00',
  349, 40,
  3, 14,
  370, 0,
  2, 845, 287,
  80
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 09/06/2024',
  '2024-06-09',
  '11:30:00',
  681, 109,
  7, 15,
  444, 1,
  5, 1072, 226,
  80
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 09/06/2024',
  '2024-06-09',
  '19:00:00',
  413, 48,
  0, 4,
  508, 6,
  2, 1122, 340,
  62
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 12/06/2024',
  '2024-06-12',
  '20:00:00',
  172, 18,
  0, 4,
  493, 0,
  8, 1482, 332,
  50
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 15/06/2024',
  '2024-06-15',
  '20:00:00',
  172, 0,
  0, 10,
  42, 0,
  0, 290, 68,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 16/06/2024',
  '2024-06-16',
  '08:30:00',
  317, 45,
  3, 12,
  428, 12,
  1, 881, 240,
  91
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 16/06/2024',
  '2024-06-16',
  '11:30:00',
  574, 127,
  7, 20,
  436, 0,
  1, 1332, 439,
  91
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 16/06/2024',
  '2024-06-16',
  '19:00:00',
  439, 36,
  7, 26,
  477, 5,
  5, 1130, 451,
  71
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 19/06/2024',
  '2024-06-19',
  '20:00:00',
  246, 30,
  3, 13,
  580, 0,
  11, 1592, 325,
  54
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 22/06/2024',
  '2024-06-22',
  '20:00:00',
  120, 0,
  0, 3,
  40, 0,
  0, 297, 39,
  29
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 23/06/2024',
  '2024-06-23',
  '08:30:00',
  327, 32,
  0, 7,
  417, 1,
  0, 924, 170,
  96
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 23/06/2024',
  '2024-06-23',
  '11:30:00',
  621, 115,
  3, 18,
  406, 16,
  1, 1170, 235,
  96
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 23/06/2024',
  '2024-06-23',
  '19:00:00',
  407, 51,
  8, 22,
  373, 7,
  11, 1213, 492,
  50
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 26/06/2024',
  '2024-06-26',
  '20:00:00',
  291, 35,
  5, 12,
  584, 0,
  10, 2104, 362,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 29/06/2024',
  '2024-06-29',
  '20:00:00',
  135, 0,
  0, 4,
  27, 0,
  0, 280, 44,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 30/06/2024',
  '2024-06-30',
  '08:30:00',
  239, 36,
  2, 15,
  317, 1,
  6, 876, 47,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 30/06/2024',
  '2024-06-30',
  '11:30:00',
  594, 71,
  3, 23,
  339, 3,
  2, 1048, 170,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 30/06/2024',
  '2024-06-30',
  '19:00:00',
  316, 32,
  4, 11,
  310, 13,
  6, 978, 272,
  46
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-06-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 03/07/2024',
  '2024-07-03',
  '20:00:00',
  292, 29,
  7, 12,
  582, 2,
  10, 1452, 349,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 06/07/2024',
  '2024-07-06',
  '20:00:00',
  113, 0,
  1, 4,
  35, 0,
  0, 246, 8,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 07/07/2024',
  '2024-07-07',
  '08:30:00',
  307, 25,
  3, 9,
  386, 1,
  8, 969, 133,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 07/07/2024',
  '2024-07-07',
  '11:30:00',
  679, 101,
  6, 8,
  362, 2,
  7, 1080, 301,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 07/07/2024',
  '2024-07-07',
  '19:00:00',
  423, 40,
  1, 22,
  401, 18,
  6, 1046, 190,
  70
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 10/07/2024',
  '2024-07-10',
  '20:00:00',
  266, 24,
  2, 13,
  538, 0,
  4, 1612, 372,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 13/07/2024',
  '2024-07-13',
  '20:00:00',
  120, 0,
  0, 3,
  35, 0,
  0, 428, 76,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 14/07/2024',
  '2024-07-14',
  '08:30:00',
  224, 25,
  6, 14,
  347, 3,
  8, 969, 22,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 14/07/2024',
  '2024-07-14',
  '11:30:00',
  554, 79,
  6, 15,
  397, 9,
  0, 1240, 329,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 14/07/2024',
  '2024-07-14',
  '19:00:00',
  569, 45,
  5, 26,
  416, 27,
  7, 1238, 44,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 17/07/2024',
  '2024-07-17',
  '20:00:00',
  250, 24,
  2, 15,
  415, 1,
  18, 1900, 352,
  68
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 20/07/2024',
  '2024-07-20',
  '20:00:00',
  70, 0,
  2, 0,
  35, 0,
  0, 250, 28,
  33
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 21/07/2024',
  '2024-07-21',
  '08:30:00',
  311, 35,
  2, 17,
  226, 8,
  8, 965, 17,
  91
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 21/07/2024',
  '2024-07-21',
  '11:30:00',
  584, 88,
  3, 14,
  272, 3,
  6, 1220, 267,
  91
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 21/07/2024',
  '2024-07-21',
  '19:00:00',
  412, 45,
  1, 12,
  302, 0,
  7, 1100, 16,
  49
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 24/07/2024',
  '2024-07-24',
  '20:00:00',
  278, 16,
  3, 11,
  384, 3,
  8, 1800, 351,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 27/07/2024',
  '2024-07-27',
  '20:00:00',
  60, 0,
  0, 0,
  118, 0,
  0, 200, 22,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 28/07/2024',
  '2024-07-28',
  '08:30:00',
  303, 34,
  2, 25,
  191, 3,
  5, 1000, 39,
  104
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 28/07/2024',
  '2024-07-28',
  '11:30:00',
  689, 104,
  1, 36,
  192, 11,
  2, 1000, 226,
  104
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 28/07/2024',
  '2024-07-28',
  '19:00:00',
  497, 42,
  7, 24,
  294, 8,
  13, 1200, 94,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 31/07/2024',
  '2024-07-31',
  '20:00:00',
  203, 21,
  0, 7,
  528, 5,
  8, 1551, 259,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-07-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 03/08/2024',
  '2024-08-03',
  '20:00:00',
  106, 0,
  0, 4,
  31, 0,
  0, 229, 32,
  28
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 04/08/2024',
  '2024-08-04',
  '08:30:00',
  324, 46,
  2, 10,
  387, 15,
  9, 912, 30,
  88
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 04/08/2024',
  '2024-08-04',
  '11:30:00',
  651, 106,
  9, 29,
  353, 6,
  5, 964, 461,
  88
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 04/08/2024',
  '2024-08-04',
  '19:00:00',
  559, 69,
  6, 17,
  511, 10,
  21, 1196, 141,
  47
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 07/08/2024',
  '2024-08-07',
  '20:00:00',
  276, 20,
  0, 6,
  469, 1,
  4, 1434, 230,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 10/08/2024',
  '2024-08-10',
  '20:00:00',
  174, 0,
  0, 8,
  152, 0,
  0, 346, 48,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 11/08/2024',
  '2024-08-11',
  '08:30:00',
  242, 28,
  0, 0,
  218, 1,
  4, 747, 113,
  84
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 11/08/2024',
  '2024-08-11',
  '11:30:00',
  451, 68,
  2, 10,
  198, 0,
  0, 764, 247,
  84
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 11/08/2024',
  '2024-08-11',
  '19:00:00',
  256, 36,
  1, 9,
  478, 0,
  1, 814, 194,
  63
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 14/08/2024',
  '2024-08-14',
  '20:00:00',
  298, 29,
  1, 4,
  450, 1,
  11, 1530, 223,
  69
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 17/08/2024',
  '2024-08-17',
  '20:00:00',
  115, 0,
  0, 4,
  124, 0,
  0, 286, 61,
  20
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 18/08/2024',
  '2024-08-18',
  '08:30:00',
  355, 48,
  0, 4,
  176, 5,
  3, 799, 41,
  109
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 18/08/2024',
  '2024-08-18',
  '11:30:00',
  707, 108,
  3, 30,
  512, 2,
  1, 1018, 310,
  109
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 18/08/2024',
  '2024-08-18',
  '19:00:00',
  326, 37,
  2, 7,
  171, 4,
  2, 854, 204,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 21/08/2024',
  '2024-08-21',
  '20:00:00',
  200, 23,
  1, 2,
  395, 9,
  6, 1441, 191,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 24/08/2024',
  '2024-08-24',
  '20:00:00',
  121, 0,
  0, 3,
  29, 0,
  0, 268, 34,
  45
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 25/08/2024',
  '2024-08-25',
  '08:30:00',
  286, 36,
  1, 21,
  299, 6,
  1, 954, 68,
  117
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 25/08/2024',
  '2024-08-25',
  '11:30:00',
  505, 118,
  11, 34,
  325, 6,
  9, 1142, 288,
  117
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 25/08/2024',
  '2024-08-25',
  '19:00:00',
  324, 35,
  3, 16,
  291, 11,
  7, 1054, 192,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 28/08/2024',
  '2024-08-28',
  '20:00:00',
  243, 23,
  1, 0,
  480, 4,
  5, 1636, 164,
  48
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 31/08/2024',
  '2024-08-31',
  '20:00:00',
  125, 0,
  0, 0,
  179, 0,
  0, 217, 33,
  28
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-08-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 01/09/2024',
  '2024-09-01',
  '08:30:00',
  325, 55,
  6, 0,
  353, 3,
  4, 1035, 64,
  103
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 01/09/2024',
  '2024-09-01',
  '11:30:00',
  615, 125,
  4, 0,
  376, 10,
  22, 1032, 459,
  103
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 01/09/2024',
  '2024-09-01',
  '19:00:00',
  531, 47,
  0, 0,
  431, 3,
  9, 1105, 123,
  63
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 04/09/2024',
  '2024-09-04',
  '20:00:00',
  281, 40,
  0, 0,
  554, 4,
  4, 1515, 268,
  66
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 07/09/2024',
  '2024-09-07',
  '20:00:00',
  115, 0,
  0, 0,
  96, 0,
  0, 252, 0,
  29
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 08/09/2024',
  '2024-09-08',
  '08:30:00',
  305, 40,
  3, 0,
  400, 1,
  9, 1079, 0,
  99
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 08/09/2024',
  '2024-09-08',
  '11:30:00',
  817, 136,
  5, 0,
  378, 1,
  3, 967, 0,
  99
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 08/09/2024',
  '2024-09-08',
  '19:00:00',
  277, 69,
  9, 0,
  422, 4,
  6, 1075, 0,
  70
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 11/09/2024',
  '2024-09-11',
  '20:00:00',
  223, 21,
  4, 9,
  533, 4,
  6, 1663, 268,
  63
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 14/09/2024',
  '2024-09-14',
  '20:00:00',
  116, 0,
  0, 4,
  163, 0,
  0, 230, 39,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 15/09/2024',
  '2024-09-15',
  '08:30:00',
  301, 41,
  2, 7,
  418, 0,
  8, 1138, 147,
  99
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 15/09/2024',
  '2024-09-15',
  '11:30:00',
  576, 123,
  2, 17,
  380, 2,
  7, 1206, 338,
  99
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 15/09/2024',
  '2024-09-15',
  '19:00:00',
  267, 33,
  4, 12,
  358, 13,
  3, 1759, 287,
  64
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 18/09/2024',
  '2024-09-18',
  '20:00:00',
  269, 18,
  1, 4,
  430, 9,
  12, 1663, 285,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 21/09/2024',
  '2024-09-21',
  '20:00:00',
  110, 0,
  0, 2,
  184, 1,
  0, 248, 24,
  28
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 22/09/2024',
  '2024-09-22',
  '08:30:00',
  329, 38,
  2, 8,
  429, 7,
  11, 1126, 96,
  105
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 22/09/2024',
  '2024-09-22',
  '11:30:00',
  739, 115,
  7, 16,
  386, 2,
  12, 1122, 215,
  105
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 22/09/2024',
  '2024-09-22',
  '19:00:00',
  284, 44,
  1, 7,
  403, 2,
  3, 1185, 247,
  64
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 25/09/2024',
  '2024-09-25',
  '20:00:00',
  223, 28,
  0, 8,
  553, 0,
  8, 1586, 272,
  61
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 28/09/2024',
  '2024-09-28',
  '20:00:00',
  482, 0,
  6, 30,
  607, 6,
  6, 985, 19,
  38
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 29/09/2024',
  '2024-09-29',
  '08:30:00',
  239, 32,
  0, 9,
  276, 7,
  1, 764, 99,
  93
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 29/09/2024',
  '2024-09-29',
  '11:30:00',
  583, 112,
  6, 28,
  259, 0,
  1, 935, 156,
  93
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 29/09/2024',
  '2024-09-29',
  '19:00:00',
  464, 42,
  4, 10,
  709, 2,
  3, 904, 152,
  51
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-09-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 02/10/2024',
  '2024-10-02',
  '20:00:00',
  252, 43,
  3, 13,
  507, 0,
  3, 1681, 267,
  61
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 05/10/2024',
  '2024-10-05',
  '20:00:00',
  122, 0,
  0, 8,
  200, 0,
  0, 214, 218,
  27
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 06/10/2024',
  '2024-10-06',
  '08:30:00',
  227, 50,
  0, 3,
  258, 2,
  7, 835, 48,
  101
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 06/10/2024',
  '2024-10-06',
  '11:30:00',
  463, 113,
  3, 9,
  293, 3,
  4, 771, 86,
  101
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 06/10/2024',
  '2024-10-06',
  '19:00:00',
  393, 53,
  3, 17,
  312, 1,
  5, 981, 141,
  56
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 09/10/2024',
  '2024-10-09',
  '20:00:00',
  241, 36,
  2, 11,
  539, 2,
  8, 1541, 142,
  50
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 12/10/2024',
  '2024-10-12',
  '20:00:00',
  140, 0,
  3, 4,
  142, 0,
  0, 207, 21,
  20
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 13/10/2024',
  '2024-10-13',
  '08:30:00',
  242, 42,
  4, 14,
  374, 3,
  3, 970, 94,
  88
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 13/10/2024',
  '2024-10-13',
  '11:30:00',
  513, 112,
  6, 38,
  368, 5,
  9, 986, 236,
  88
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 13/10/2024',
  '2024-10-13',
  '19:00:00',
  424, 57,
  2, 15,
  473, 24,
  6, 1170, 317,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 16/10/2024',
  '2024-10-16',
  '20:00:00',
  205, 52,
  2, 3,
  567, 0,
  13, 1719, 315,
  52
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 19/10/2024',
  '2024-10-19',
  '20:00:00',
  111, 0,
  2, 6,
  154, 3,
  0, 235, 29,
  23
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 20/10/2024',
  '2024-10-20',
  '08:30:00',
  212, 45,
  0, 11,
  472, 4,
  9, 1197, 172,
  84
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 20/10/2024',
  '2024-10-20',
  '11:30:00',
  563, 82,
  4, 11,
  443, 6,
  4, 1213, 175,
  84
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 20/10/2024',
  '2024-10-20',
  '19:00:00',
  238, 48,
  1, 17,
  502, 16,
  7, 1402, 267,
  48
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 23/10/2024',
  '2024-10-23',
  '20:00:00',
  253, 29,
  2, 11,
  576, 0,
  0, 1840, 156,
  48
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 26/10/2024',
  '2024-10-26',
  '20:00:00',
  113, 0,
  0, 2,
  187, 4,
  6, 247, 20,
  22
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 27/10/2024',
  '2024-10-27',
  '08:30:00',
  382, 36,
  0, 8,
  423, 0,
  7, 1085, 50,
  95
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 27/10/2024',
  '2024-10-27',
  '11:30:00',
  924, 140,
  21, 64,
  353, 0,
  7, 1136, 87,
  95
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 27/10/2024',
  '2024-10-27',
  '19:00:00',
  427, 68,
  1, 19,
  453, 0,
  4, 1178, 165,
  51
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 30/10/2024',
  '2024-10-30',
  '20:00:00',
  248, 44,
  0, 5,
  544, 4,
  6, 1627, 326,
  53
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-10-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 02/11/2024',
  '2024-11-02',
  '20:00:00',
  102, 0,
  0, 2,
  208, 0,
  0, 233, 29,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 03/11/2024',
  '2024-11-03',
  '08:30:00',
  386, 49,
  4, 6,
  386, 0,
  7, 1311, 132,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 03/11/2024',
  '2024-11-03',
  '11:30:00',
  581, 131,
  2, 13,
  310, 2,
  1, 1083, 194,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 03/11/2024',
  '2024-11-03',
  '19:00:00',
  433, 30,
  0, 8,
  441, 3,
  4, 1367, 260,
  44
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 06/11/2024',
  '2024-11-06',
  '20:00:00',
  256, 30,
  2, 5,
  520, 0,
  9, 1783, 346,
  51
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 09/11/2024',
  '2024-11-09',
  '20:00:00',
  111, 0,
  0, 1,
  38, 4,
  0, 225, 27,
  21
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 10/11/2024',
  '2024-11-10',
  '08:30:00',
  360, 35,
  4, 13,
  502, 1,
  1, 1380, 71,
  101
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 10/11/2024',
  '2024-11-10',
  '11:30:00',
  698, 125,
  4, 30,
  258, 2,
  3, 1379, 278,
  101
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 10/11/2024',
  '2024-11-10',
  '19:00:00',
  317, 50,
  1, 12,
  290, 3,
  0, 1518, 98,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 13/11/2024',
  '2024-11-13',
  '20:00:00',
  190, 26,
  3, 2,
  571, 0,
  8, 1506, 346,
  56
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 16/11/2024',
  '2024-11-16',
  '20:00:00',
  152, 0,
  5, 15,
  111, 0,
  0, 252, 35,
  26
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 17/11/2024',
  '2024-11-17',
  '08:30:00',
  235, 103,
  1, 7,
  387, 12,
  6, 1112, 20,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 17/11/2024',
  '2024-11-17',
  '11:30:00',
  595, 145,
  8, 26,
  393, 2,
  1, 1012, 180,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 17/11/2024',
  '2024-11-17',
  '19:00:00',
  402, 66,
  1, 11,
  414, 14,
  6, 1259, 25,
  54
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 20/11/2024',
  '2024-11-20',
  '20:00:00',
  220, 30,
  0, 3,
  465, 5,
  10, 1364, 250,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 23/11/2024',
  '2024-11-23',
  '20:00:00',
  178, 0,
  3, 6,
  51, 0,
  0, 250, 48,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 24/11/2024',
  '2024-11-24',
  '08:30:00',
  291, 60,
  6, 25,
  415, 5,
  14, 1216, 104,
  105
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 24/11/2024',
  '2024-11-24',
  '11:30:00',
  806, 119,
  3, 35,
  399, 2,
  11, 1269, 683,
  105
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 24/11/2024',
  '2024-11-24',
  '19:00:00',
  503, 64,
  7, 34,
  433, 2,
  2, 1492, 403,
  64
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 27/11/2024',
  '2024-11-27',
  '20:00:00',
  618, 54,
  2, 33,
  523, 0,
  8, 1877, 298,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 30/11/2024',
  '2024-11-30',
  '20:00:00',
  90, 0,
  7, 6,
  29, 0,
  1, 164, 0,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-11-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 01/12/2024',
  '2024-12-01',
  '08:30:00',
  282, 43,
  7, 6,
  368, 6,
  7, 1007, 16,
  105
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 01/12/2024',
  '2024-12-01',
  '11:30:00',
  625, 129,
  3, 13,
  375, 1,
  6, 938, 181,
  105
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 01/12/2024',
  '2024-12-01',
  '19:00:00',
  449, 57,
  2, 5,
  406, 4,
  3, 1227, 47,
  64
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 04/12/2024',
  '2024-12-04',
  '20:00:00',
  207, 34,
  2, 13,
  513, 5,
  0, 1863, 236,
  46
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 07/12/2024',
  '2024-12-07',
  '20:00:00',
  101, 0,
  1, 6,
  29, 0,
  4, 189, 27,
  23
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 08/12/2024',
  '2024-12-08',
  '08:30:00',
  297, 33,
  4, 10,
  338, 0,
  1, 995, 22,
  86
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 08/12/2024',
  '2024-12-08',
  '11:30:00',
  533, 62,
  4, 10,
  306, 1,
  2, 830, 27,
  86
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 08/12/2024',
  '2024-12-08',
  '19:00:00',
  382, 24,
  4, 16,
  382, 0,
  9, 1020, 565,
  51
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 11/12/2024',
  '2024-12-11',
  '20:00:00',
  0, 21,
  0, 0,
  0, 0,
  0, 0, 0,
  51
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 14/12/2024',
  '2024-12-14',
  '20:00:00',
  0, 0,
  0, 0,
  0, 0,
  0, 0, 0,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 15/12/2024',
  '2024-12-15',
  '08:30:00',
  424, 78,
  2, 21,
  0, 0,
  0, 0, 0,
  97
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 15/12/2024',
  '2024-12-15',
  '11:30:00',
  640, 94,
  4, 20,
  0, 0,
  0, 0, 0,
  97
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 15/12/2024',
  '2024-12-15',
  '19:00:00',
  612, 157,
  0, 0,
  0, 0,
  0, 0, 0,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 18/12/2024',
  '2024-12-18',
  '20:00:00',
  0, 0,
  0, 0,
  0, 0,
  0, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 21/12/2024',
  '2024-12-21',
  '20:00:00',
  0, 0,
  0, 0,
  0, 0,
  0, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 22/12/2024',
  '2024-12-22',
  '08:30:00',
  414, 0,
  7, 0,
  0, 0,
  0, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 22/12/2024',
  '2024-12-22',
  '10:00:00',
  626, 45,
  1, 34,
  0, 0,
  0, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 22/12/2024',
  '2024-12-22',
  '11:30:00',
  848, 111,
  2, 0,
  0, 0,
  0, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 25/12/2024',
  '2024-12-25',
  '20:00:00',
  404, 30,
  3, 0,
  379, 0,
  4, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 28/12/2024',
  '2024-12-28',
  '20:00:00',
  130, 0,
  2, 12,
  287, 1,
  0, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 29/12/2024',
  '2024-12-29',
  '08:30:00',
  170, 25,
  1, 9,
  365, 0,
  6, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 29/12/2024',
  '2024-12-29',
  '10:00:00',
  319, 55,
  3, 6,
  283, 1,
  9, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 29/12/2024',
  '2024-12-29',
  '11:30:00',
  487, 101,
  4, 29,
  295, 1,
  2, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 29/12/2024',
  '2024-12-29',
  '19:00:00',
  460, 69,
  1, 37,
  782, 8,
  14, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2024-12-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 01/01/2025',
  '2025-01-01',
  '20:00:00',
  214, 19,
  2, 22,
  607, 2,
  1, 1572, 395,
  46
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 04/01/2025',
  '2025-01-04',
  '20:00:00',
  136, 0,
  0, 3,
  148, 0,
  0, 297, 24,
  16
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 05/01/2025',
  '2025-01-05',
  '08:30:00',
  160, 17,
  0, 4,
  306, 0,
  9, 1004, 161,
  97
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 05/01/2025',
  '2025-01-05',
  '10:00:00',
  399, 52,
  1, 19,
  348, 6,
  8, 935, 176,
  97
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 05/01/2025',
  '2025-01-05',
  '11:30:00',
  606, 115,
  6, 23,
  297, 9,
  3, 875, 164,
  97
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 05/01/2025',
  '2025-01-05',
  '19:00:00',
  776, 74,
  10, 25,
  437, 4,
  15, 1289, 324,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 08/01/2025',
  '2025-01-08',
  '20:00:00',
  334, 33,
  3, 24,
  0, 12,
  8, 2010, 395,
  41
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 11/01/2025',
  '2025-01-11',
  '20:00:00',
  141, 0,
  0, 6,
  33, 0,
  0, 294, 34,
  22
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 12/01/2025',
  '2025-01-12',
  '08:30:00',
  211, 22,
  0, 11,
  255, 0,
  0, 1088, 45,
  76
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 12/01/2025',
  '2025-01-12',
  '10:00:00',
  327, 59,
  1, 8,
  291, 1,
  4, 790, 113,
  76
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 12/01/2025',
  '2025-01-12',
  '11:30:00',
  674, 105,
  12, 38,
  281, 0,
  1, 221, 54,
  76
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 12/01/2025',
  '2025-01-12',
  '19:00:00',
  586, 73,
  5, 20,
  468, 16,
  6, 377, 643,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 15/01/2025',
  '2025-01-15',
  '20:00:00',
  352, 32,
  3, 13,
  664, 6,
  1, 1954, 375,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 18/01/2025',
  '2025-01-18',
  '20:00:00',
  121, 0,
  0, 4,
  44, 0,
  0, 273, 47,
  17
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 19/01/2025',
  '2025-01-19',
  '08:30:00',
  138, 19,
  0, 4,
  215, 1,
  1, 777, 23,
  91
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 19/01/2025',
  '2025-01-19',
  '10:00:00',
  338, 73,
  0, 17,
  206, 6,
  1, 643, 28,
  91
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 19/01/2025',
  '2025-01-19',
  '11:30:00',
  409, 95,
  3, 16,
  417, 2,
  2, 673, 21,
  91
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 19/01/2025',
  '2025-01-19',
  '19:00:00',
  401, 42,
  0, 12,
  451, 5,
  7, 1066, 162,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 22/01/2025',
  '2025-01-22',
  '20:00:00',
  361, 30,
  3, 7,
  554, 0,
  3, 1953, 309,
  53
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 25/01/2025',
  '2025-01-25',
  '20:00:00',
  106, 0,
  1, 8,
  30, 0,
  0, 232, 47,
  19
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 26/01/2025',
  '2025-01-26',
  '08:30:00',
  351, 20,
  3, 24,
  283, 1,
  3, 890, 26,
  111
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 26/01/2025',
  '2025-01-26',
  '10:00:00',
  412, 48,
  2, 63,
  463, 0,
  0, 1049, 536,
  111
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 26/01/2025',
  '2025-01-26',
  '11:30:00',
  469, 100,
  2, 18,
  494, 1,
  0, 798, 32,
  111
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 26/01/2025',
  '2025-01-26',
  '19:00:00',
  491, 30,
  3, 28,
  531, 0,
  1, 1211, 133,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 29/01/2025',
  '2025-01-29',
  '20:00:00',
  272, 23,
  5, 10,
  570, 0,
  3, 1839, 353,
  44
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-01-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 01/02/2025',
  '2025-02-01',
  '20:00:00',
  152, 0,
  1, 9,
  30, 0,
  0, 257, 31,
  20
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 02/02/2025',
  '2025-02-02',
  '08:30:00',
  213, 28,
  1, 4,
  260, 0,
  2, 724, 14,
  93
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 02/02/2025',
  '2025-02-02',
  '10:00:00',
  300, 92,
  2, 14,
  346, 3,
  8, 833, 19,
  93
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 02/02/2025',
  '2025-02-02',
  '11:30:00',
  650, 97,
  3, 12,
  251, 0,
  2, 1176, 16,
  93
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 02/02/2025',
  '2025-02-02',
  '19:00:00',
  442, 36,
  8, 9,
  374, 8,
  3, 1437, 357,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 05/02/2025',
  '2025-02-05',
  '20:00:00',
  364, 42,
  2, 8,
  496, 1,
  0, 1684, 171,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 08/02/2025',
  '2025-02-08',
  '20:00:00',
  153, 0,
  0, 8,
  36, 0,
  0, 213, 39,
  12
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 09/02/2025',
  '2025-02-09',
  '08:30:00',
  212, 20,
  0, 4,
  285, 3,
  0, 967, 28,
  106
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 09/02/2025',
  '2025-02-09',
  '10:00:00',
  390, 67,
  5, 28,
  434, 3,
  0, 960, 34,
  106
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 09/02/2025',
  '2025-02-09',
  '11:30:00',
  573, 79,
  2, 10,
  599, 3,
  0, 671, 33,
  106
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 09/02/2025',
  '2025-02-09',
  '19:00:00',
  466, 46,
  1, 13,
  510, 12,
  0, 1193, 547,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 12/02/2025',
  '2025-02-12',
  '20:00:00',
  352, 22,
  3, 10,
  539, 0,
  8, 1658, 358,
  49
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 15/02/2025',
  '2025-02-15',
  '20:00:00',
  128, 0,
  0, 5,
  32, 0,
  0, 265, 28,
  12
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 16/02/2025',
  '2025-02-16',
  '08:30:00',
  247, 43,
  0, 0,
  195, 0,
  0, 712, 9,
  123
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 16/02/2025',
  '2025-02-16',
  '10:00:00',
  432, 84,
  0, 0,
  169, 0,
  0, 960, 750,
  123
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 16/02/2025',
  '2025-02-16',
  '11:30:00',
  470, 86,
  0, 3,
  164, 1,
  1, 671, 593,
  123
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 16/02/2025',
  '2025-02-16',
  '19:00:00',
  479, 55,
  1, 29,
  280, 0,
  0, 1193, 589,
  61
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 19/02/2025',
  '2025-02-19',
  '20:00:00',
  457, 33,
  11, 25,
  583, 1,
  3, 1816, 226,
  65
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 22/02/2025',
  '2025-02-22',
  '20:00:00',
  226, 0,
  0, 7,
  26, 0,
  0, 221, 21,
  20
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 23/02/2025',
  '2025-02-23',
  '08:30:00',
  315, 14,
  1, 30,
  352, 1,
  3, 1360, 89,
  128
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 23/02/2025',
  '2025-02-23',
  '10:00:00',
  530, 56,
  20, 83,
  269, 2,
  0, 1216, 59,
  128
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 23/02/2025',
  '2025-02-23',
  '11:30:00',
  446, 62,
  2, 10,
  213, 1,
  0, 844, 41,
  128
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 23/02/2025',
  '2025-02-23',
  '19:00:00',
  444, 41,
  2, 9,
  407, 1,
  6, 1436, 466,
  74
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 26/02/2025',
  '2025-02-26',
  '20:00:00',
  343, 26,
  5, 17,
  576, 1,
  2, 1965, 271,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-02-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 01/03/2025',
  '2025-03-01',
  '20:00:00',
  272, 0,
  15, 31,
  0, 0,
  0, 221, 21,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 02/03/2025',
  '2025-03-02',
  '08:30:00',
  180, 19,
  1, 3,
  145, 1,
  1, 463, 32,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 02/03/2025',
  '2025-03-02',
  '10:00:00',
  268, 35,
  2, 11,
  182, 4,
  2, 450, 26,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 02/03/2025',
  '2025-03-02',
  '11:30:00',
  217, 57,
  1, 2,
  125, 5,
  2, 426, 30,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 02/03/2025',
  '2025-03-02',
  '19:00:00',
  0, 0,
  0, 0,
  209, 1,
  2, 679, 85,
  40
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 05/03/2025',
  '2025-03-05',
  '20:00:00',
  265, 34,
  2, 5,
  588, 1,
  8, 1778, 271,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 08/03/2025',
  '2025-03-08',
  '20:00:00',
  302, 0,
  0, 10,
  22, 0,
  0, 272, 51,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 09/03/2025',
  '2025-03-09',
  '08:30:00',
  207, 16,
  0, 5,
  332, 8,
  1, 870, 25,
  96
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 09/03/2025',
  '2025-03-09',
  '10:00:00',
  441, 83,
  7, 35,
  324, 8,
  5, 1004, 724,
  96
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 09/03/2025',
  '2025-03-09',
  '11:30:00',
  581, 99,
  3, 8,
  293, 6,
  5, 866, 25,
  96
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 09/03/2025',
  '2025-03-09',
  '19:00:00',
  441, 56,
  0, 12,
  454, 5,
  17, 1244, 157,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 12/03/2025',
  '2025-03-12',
  '20:00:00',
  263, 34,
  0, 6,
  650, 2,
  25, 1778, 456,
  56
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 15/03/2025',
  '2025-03-15',
  '20:00:00',
  175, 0,
  0, 3,
  34, 0,
  0, 241, 38,
  23
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 16/03/2025',
  '2025-03-16',
  '08:30:00',
  218, 35,
  1, 12,
  347, 4,
  6, 952, 374,
  109
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 16/03/2025',
  '2025-03-16',
  '10:00:00',
  435, 64,
  6, 20,
  340, 2,
  3, 904, 32,
  109
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 16/03/2025',
  '2025-03-16',
  '11:30:00',
  556, 98,
  4, 16,
  250, 6,
  2, 725, 11,
  109
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 16/03/2025',
  '2025-03-16',
  '19:00:00',
  436, 34,
  3, 23,
  477, 10,
  7, 1436, 473,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 19/03/2025',
  '2025-03-19',
  '20:00:00',
  320, 22,
  0, 13,
  711, 3,
  8, 2034, 319,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 22/03/2025',
  '2025-03-22',
  '20:00:00',
  201, 0,
  0, 11,
  20, 0,
  0, 242, 19,
  21
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 23/03/2025',
  '2025-03-23',
  '08:30:00',
  211, 15,
  3, 11,
  390, 2,
  2, 966, 150,
  109
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 23/03/2025',
  '2025-03-23',
  '10:00:00',
  517, 84,
  6, 40,
  371, 3,
  7, 1139, 120,
  109
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 23/03/2025',
  '2025-03-23',
  '11:30:00',
  586, 106,
  4, 8,
  274, 0,
  3, 771, 229,
  109
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 23/03/2025',
  '2025-03-23',
  '19:00:00',
  495, 57,
  5, 23,
  483, 1,
  14, 1451, 490,
  70
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 26/03/2025',
  '2025-03-26',
  '20:00:00',
  364, 26,
  4, 14,
  715, 2,
  13, 2314, 345,
  49
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 29/03/2025',
  '2025-03-29',
  '20:00:00',
  161, 0,
  2, 6,
  25, 0,
  0, 396, 57,
  23
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 30/03/2025',
  '2025-03-30',
  '08:30:00',
  180, 28,
  0, 0,
  413, 5,
  3, 1021, 145,
  84
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 30/03/2025',
  '2025-03-30',
  '10:00:00',
  353, 114,
  5, 0,
  360, 9,
  5, 948, 180,
  84
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 30/03/2025',
  '2025-03-30',
  '11:30:00',
  488, 117,
  3, 0,
  295, 3,
  2, 790, 19,
  84
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 30/03/2025',
  '2025-03-30',
  '19:00:00',
  338, 45,
  5, 0,
  549, 1,
  6, 1668, 449,
  78
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-03-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 02/04/2025',
  '2025-04-02',
  '20:00:00',
  304, 29,
  0, 0,
  643, 4,
  1, 1834, 339,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 05/04/2025',
  '2025-04-05',
  '20:00:00',
  139, 0,
  0, 10,
  25, 0,
  0, 258, 42,
  17
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 06/04/2025',
  '2025-04-06',
  '08:30:00',
  224, 36,
  0, 0,
  408, 1,
  1, 1112, 32,
  89
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 06/04/2025',
  '2025-04-06',
  '10:00:00',
  602, 102,
  0, 0,
  421, 1,
  4, 1258, 507,
  89
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 06/04/2025',
  '2025-04-06',
  '11:30:00',
  1218, 142,
  9, 0,
  291, 4,
  8, 784, 20,
  89
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 06/04/2025',
  '2025-04-06',
  '19:00:00',
  418, 58,
  1, 0,
  489, 1,
  6, 1254, 93,
  68
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 09/04/2025',
  '2025-04-09',
  '20:00:00',
  263, 16,
  0, 0,
  668, 5,
  4, 1846, 300,
  46
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 12/04/2025',
  '2025-04-12',
  '20:00:00',
  211, 0,
  1, 5,
  27, 0,
  0, 212, 47,
  13
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 13/04/2025',
  '2025-04-13',
  '08:30:00',
  228, 31,
  2, 15,
  402, 7,
  1, 1100, 25,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 13/04/2025',
  '2025-04-13',
  '10:00:00',
  531, 98,
  1, 20,
  355, 4,
  6, 987, 23,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 13/04/2025',
  '2025-04-13',
  '11:30:00',
  586, 121,
  4, 17,
  273, 2,
  2, 805, 43,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 13/04/2025',
  '2025-04-13',
  '19:00:00',
  420, 72,
  1, 14,
  484, 27,
  6, 1326, 771,
  72
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 16/04/2025',
  '2025-04-16',
  '20:00:00',
  274, 41,
  4, 15,
  565, 2,
  16, 1817, 353,
  66
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 19/04/2025',
  '2025-04-19',
  '20:00:00',
  344, 41,
  1, 0,
  0, 0,
  0, 1089, 46,
  27
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 20/04/2025',
  '2025-04-20',
  '08:30:00',
  333, 27,
  7, 0,
  404, 5,
  0, 1131, 204,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 20/04/2025',
  '2025-04-20',
  '10:00:00',
  492, 79,
  6, 0,
  275, 0,
  0, 966, 14,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 20/04/2025',
  '2025-04-20',
  '11:30:00',
  525, 88,
  7, 0,
  258, 0,
  4, 977, 56,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 20/04/2025',
  '2025-04-20',
  '19:00:00',
  491, 49,
  6, 0,
  415, 8,
  9, 978, 881,
  43
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 23/04/2025',
  '2025-04-23',
  '20:00:00',
  238, 24,
  1, 10,
  604, 13,
  5, 2057, 279,
  66
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 26/04/2025',
  '2025-04-26',
  '20:00:00',
  160, 0,
  0, 7,
  23, 0,
  0, 260, 44,
  27
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 27/04/2025',
  '2025-04-27',
  '08:30:00',
  203, 40,
  2, 8,
  254, 5,
  1, 813, 101,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 27/04/2025',
  '2025-04-27',
  '10:00:00',
  514, 112,
  4, 38,
  257, 2,
  2, 725, 110,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 27/04/2025',
  '2025-04-27',
  '11:30:00',
  538, 111,
  1, 13,
  173, 1,
  1, 480, 54,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 27/04/2025',
  '2025-04-27',
  '19:00:00',
  419, 48,
  2, 19,
  324, 7,
  2, 935, 225,
  43
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 30/04/2025',
  '2025-04-30',
  '20:00:00',
  240, 36,
  3, 7,
  501, 2,
  3, 1449, 338,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-04-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 03/05/2025',
  '2025-05-03',
  '20:00:00',
  188, 0,
  2, 7,
  19, 0,
  0, 235, 25,
  29
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 04/05/2025',
  '2025-05-04',
  '08:30:00',
  223, 28,
  0, 0,
  341, 2,
  13, 1220, 17,
  82
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 04/05/2025',
  '2025-05-04',
  '10:00:00',
  457, 119,
  7, 25,
  557, 1,
  5, 1026, 282,
  82
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 04/05/2025',
  '2025-05-04',
  '11:30:00',
  843, 118,
  1, 0,
  936, 3,
  2, 927, 42,
  82
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 04/05/2025',
  '2025-05-04',
  '19:00:00',
  489, 71,
  0, 2,
  590, 3,
  6, 1579, 509,
  64
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 07/05/2025',
  '2025-05-07',
  '20:00:00',
  278, 26,
  3, 6,
  631, 4,
  16, 2091, 174,
  51
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 10/05/2025',
  '2025-05-10',
  '20:00:00',
  142, 0,
  0, 1,
  23, 0,
  0, 230, 48,
  32
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 11/05/2025',
  '2025-05-11',
  '08:30:00',
  228, 25,
  3, 9,
  375, 0,
  3, 1199, 519,
  68
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 11/05/2025',
  '2025-05-11',
  '10:00:00',
  331, 75,
  5, 14,
  326, 2,
  1, 767, 25,
  68
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 11/05/2025',
  '2025-05-11',
  '11:30:00',
  303, 72,
  3, 17,
  140, 1,
  0, 686, 46,
  68
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 11/05/2025',
  '2025-05-11',
  '19:00:00',
  242, 33,
  5, 13,
  450, 1,
  4, 1397, 497,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 14/05/2025',
  '2025-05-14',
  '20:00:00',
  363, 37,
  2, 7,
  556, 2,
  2, 1808, 440,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 17/05/2025',
  '2025-05-17',
  '20:00:00',
  148, 0,
  1, 5,
  24, 0,
  0, 241, 35,
  29
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 18/05/2025',
  '2025-05-18',
  '08:30:00',
  238, 32,
  0, 0,
  338, 5,
  1, 1077, 74,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 18/05/2025',
  '2025-05-18',
  '10:00:00',
  395, 114,
  4, 0,
  205, 1,
  5, 739, 11,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 18/05/2025',
  '2025-05-18',
  '11:30:00',
  631, 139,
  2, 0,
  177, 0,
  1, 578, 5,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 18/05/2025',
  '2025-05-18',
  '19:00:00',
  381, 49,
  1, 0,
  293, 7,
  2, 1202, 223,
  62
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 21/05/2025',
  '2025-05-21',
  '20:00:00',
  335, 31,
  5, 0,
  624, 0,
  13, 1947, 345,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 24/05/2025',
  '2025-05-24',
  '20:00:00',
  161, 0,
  0, 3,
  22, 0,
  0, 191, 31,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 25/05/2025',
  '2025-05-25',
  '08:30:00',
  221, 37,
  0, 18,
  395, 0,
  0, 2084, 451,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 25/05/2025',
  '2025-05-25',
  '10:00:00',
  467, 103,
  9, 16,
  303, 0,
  1, 739, 11,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 25/05/2025',
  '2025-05-25',
  '11:30:00',
  548, 113,
  5, 7,
  154, 0,
  0, 559, 23,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 25/05/2025',
  '2025-05-25',
  '19:00:00',
  425, 62,
  6, 47,
  498, 0,
  2, 1301, 652,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 28/05/2025',
  '2025-05-28',
  '20:00:00',
  310, 31,
  6, 14,
  548, 0,
  2, 3197, 563,
  61
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 31/05/2025',
  '2025-05-31',
  '20:00:00',
  192, 0,
  0, 13,
  22, 0,
  0, 31, 58,
  26
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-05-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 01/06/2025',
  '2025-06-01',
  '08:30:00',
  206, 32,
  2, 3,
  414, 0,
  0, 1466, 22,
  85
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 01/06/2025',
  '2025-06-01',
  '10:00:00',
  382, 94,
  4, 11,
  324, 3,
  5, 1160, 267,
  85
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 01/06/2025',
  '2025-06-01',
  '11:30:00',
  571, 149,
  3, 9,
  279, 1,
  2, 1179, 490,
  85
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 01/06/2025',
  '2025-06-01',
  '19:00:00',
  454, 65,
  4, 9,
  0, 0,
  16, 1514, 75,
  69
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 04/06/2025',
  '2025-06-04',
  '20:00:00',
  448, 42,
  5, 8,
  549, 2,
  1, 1870, 380,
  51
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 07/06/2025',
  '2025-06-07',
  '20:00:00',
  193, 0,
  1, 6,
  23, 0,
  0, 318, 44,
  35
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 08/06/2025',
  '2025-06-08',
  '08:30:00',
  218, 35,
  5, 19,
  422, 0,
  0, 1450, 27,
  62
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 08/06/2025',
  '2025-06-08',
  '10:00:00',
  458, 126,
  10, 20,
  330, 0,
  4, 983, 292,
  62
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 08/06/2025',
  '2025-06-08',
  '11:30:00',
  532, 134,
  7, 1,
  273, 2,
  3, 781, 21,
  62
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 08/06/2025',
  '2025-06-08',
  '19:00:00',
  476, 58,
  1, 15,
  535, 1,
  10, 1809, 414,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 11/06/2025',
  '2025-06-11',
  '20:00:00',
  299, 35,
  2, 4,
  656, 0,
  1, 2350, 208,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 14/06/2025',
  '2025-06-14',
  '20:00:00',
  183, 0,
  3, 6,
  31, 0,
  0, 244, 32,
  35
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 15/06/2025',
  '2025-06-15',
  '08:30:00',
  145, 29,
  0, 1,
  230, 0,
  6, 784, 10,
  106
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 15/06/2025',
  '2025-06-15',
  '10:00:00',
  390, 88,
  3, 6,
  326, 2,
  8, 780, 69,
  106
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 15/06/2025',
  '2025-06-15',
  '11:30:00',
  490, 135,
  0, 7,
  234, 1,
  2, 723, 29,
  106
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 15/06/2025',
  '2025-06-15',
  '19:00:00',
  375, 47,
  1, 19,
  344, 2,
  5, 1034, 205,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 18/06/2025',
  '2025-06-18',
  '20:00:00',
  288, 35,
  3, 1,
  502, 2,
  6, 2085, 347,
  56
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 21/06/2025',
  '2025-06-21',
  '20:00:00',
  148, 0,
  3, 2,
  27, 0,
  0, 253, 44,
  37
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 22/06/2025',
  '2025-06-22',
  '08:30:00',
  232, 27,
  3, 9,
  387, 0,
  1, 1229, 194,
  106
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 22/06/2025',
  '2025-06-22',
  '10:00:00',
  514, 97,
  3, 49,
  340, 0,
  3, 1037, 23,
  106
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 22/06/2025',
  '2025-06-22',
  '11:30:00',
  564, 96,
  6, 6,
  294, 1,
  6, 773, 23,
  106
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 22/06/2025',
  '2025-06-22',
  '19:00:00',
  435, 60,
  5, 14,
  522, 1,
  6, 1701, 327,
  64
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 25/06/2025',
  '2025-06-25',
  '20:00:00',
  284, 37,
  4, 5,
  700, 1,
  6, 2370, 479,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 28/06/2025',
  '2025-06-28',
  '20:00:00',
  129, 0,
  0, 0,
  23, 0,
  0, 281, 43,
  33
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 29/06/2025',
  '2025-06-29',
  '08:30:00',
  207, 31,
  2, 7,
  85, 2,
  3, 1367, 347,
  110
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 29/06/2025',
  '2025-06-29',
  '10:00:00',
  454, 101,
  2, 24,
  384, 2,
  6, 948, 49,
  110
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 29/06/2025',
  '2025-06-29',
  '11:30:00',
  537, 135,
  4, 7,
  282, 2,
  6, 738, 50,
  110
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 29/06/2025',
  '2025-06-29',
  '19:00:00',
  284, 45,
  3, 4,
  457, 8,
  5, 1408, 698,
  64
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-06-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 02/07/2025',
  '2025-07-02',
  '20:00:00',
  279, 29,
  2, 3,
  733, 0,
  3, 2280, 523,
  56
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 05/07/2025',
  '2025-07-05',
  '20:00:00',
  143, 0,
  0, 9,
  22, 0,
  0, 316, 25,
  28
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 06/07/2025',
  '2025-07-06',
  '08:30:00',
  151, 30,
  2, 3,
  262, 1,
  3, 796, 11,
  108
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 06/07/2025',
  '2025-07-06',
  '10:00:00',
  322, 88,
  3, 0,
  254, 1,
  5, 761, 70,
  108
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 06/07/2025',
  '2025-07-06',
  '11:30:00',
  554, 118,
  5, 12,
  186, 3,
  1, 514, 8,
  108
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 06/07/2025',
  '2025-07-06',
  '19:00:00',
  434, 61,
  2, 12,
  320, 3,
  3, 1217, 187,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 09/07/2025',
  '2025-07-09',
  '20:00:00',
  369, 44,
  0, 4,
  558, 0,
  7, 1959, 394,
  44
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 12/07/2025',
  '2025-07-12',
  '20:00:00',
  142, 0,
  0, 4,
  22, 0,
  0, 282, 52,
  31
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 13/07/2025',
  '2025-07-13',
  '08:30:00',
  145, 29,
  2, 1,
  380, 0,
  4, 1393, 55,
  101
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 13/07/2025',
  '2025-07-13',
  '10:00:00',
  425, 94,
  6, 7,
  377, 1,
  3, 962, 35,
  101
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 13/07/2025',
  '2025-07-13',
  '11:30:00',
  566, 106,
  0, 3,
  226, 0,
  3, 767, 69,
  101
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 13/07/2025',
  '2025-07-13',
  '19:00:00',
  374, 57,
  7, 12,
  500, 2,
  7, 1471, 1009,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 16/07/2025',
  '2025-07-16',
  '20:00:00',
  286, 39,
  5, 7,
  606, 1,
  6, 1788, 370,
  61
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 19/07/2025',
  '2025-07-19',
  '20:00:00',
  133, 0,
  0, 10,
  25, 0,
  0, 220, 0,
  28
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 20/07/2025',
  '2025-07-20',
  '08:30:00',
  161, 23,
  0, 4,
  423, 0,
  7, 1116, 0,
  103
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 20/07/2025',
  '2025-07-20',
  '10:00:00',
  376, 93,
  1, 4,
  327, 0,
  6, 994, 0,
  103
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 20/07/2025',
  '2025-07-20',
  '11:30:00',
  452, 94,
  0, 2,
  728, 0,
  1, 904, 0,
  103
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 20/07/2025',
  '2025-07-20',
  '19:00:00',
  375, 45,
  3, 5,
  457, 11,
  3, 1308, 0,
  63
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 23/07/2025',
  '2025-07-23',
  '20:00:00',
  320, 24,
  6, 2,
  553, 2,
  4, 0, 1181,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 26/07/2025',
  '2025-07-26',
  '20:00:00',
  127, 0,
  0, 0,
  25, 0,
  0, 0, 66,
  32
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 27/07/2025',
  '2025-07-27',
  '08:30:00',
  237, 13,
  8, 8,
  443, 2,
  11, 0, 1149,
  100
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 27/07/2025',
  '2025-07-27',
  '10:00:00',
  411, 49,
  3, 11,
  365, 1,
  2, 0, 56,
  100
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 27/07/2025',
  '2025-07-27',
  '11:30:00',
  422, 71,
  1, 4,
  260, 1,
  3, 0, 63,
  100
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 27/07/2025',
  '2025-07-27',
  '19:00:00',
  361, 26,
  3, 9,
  321, 0,
  6, 0, 1164,
  63
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 30/07/2025',
  '2025-07-30',
  '20:00:00',
  309, 35,
  0, 2,
  585, 2,
  1, 757, 0,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-07-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 02/08/2025',
  '2025-08-02',
  '20:00:00',
  212, 0,
  0, 21,
  23, 0,
  0, 29, 0,
  29
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 03/08/2025',
  '2025-08-03',
  '08:30:00',
  151, 26,
  0, 1,
  425, 4,
  7, 754, 0,
  92
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 03/08/2025',
  '2025-08-03',
  '10:00:00',
  436, 78,
  6, 10,
  354, 8,
  11, 54, 0,
  92
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 03/08/2025',
  '2025-08-03',
  '11:30:00',
  545, 111,
  1, 1,
  257, 0,
  3, 59, 0,
  92
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 03/08/2025',
  '2025-08-03',
  '19:00:00',
  489, 56,
  2, 3,
  449, 0,
  2, 737, 0,
  51
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 06/08/2025',
  '2025-08-06',
  '20:00:00',
  390, 28,
  3, 12,
  557, 2,
  5, 1853, 0,
  54
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 09/08/2025',
  '2025-08-09',
  '20:00:00',
  139, 0,
  0, 6,
  36, 0,
  0, 221, 0,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 10/08/2025',
  '2025-08-10',
  '08:30:00',
  179, 30,
  3, 2,
  463, 0,
  5, 1686, 0,
  89
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 10/08/2025',
  '2025-08-10',
  '10:00:00',
  446, 105,
  8, 40,
  385, 3,
  4, 974, 0,
  89
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 10/08/2025',
  '2025-08-10',
  '11:30:00',
  399, 83,
  4, 3,
  233, 0,
  5, 741, 0,
  89
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 10/08/2025',
  '2025-08-10',
  '19:00:00',
  285, 36,
  7, 11,
  0, 0,
  0, 1729, 0,
  52
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 13/08/2025',
  '2025-08-13',
  '20:00:00',
  390, 31,
  5, 12,
  626, 1,
  4, 1987, 405,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 16/08/2025',
  '2025-08-16',
  '20:00:00',
  152, 0,
  1, 6,
  21, 0,
  0, 235, 35,
  29
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 17/08/2025',
  '2025-08-17',
  '08:30:00',
  182, 23,
  3, 1,
  494, 0,
  4, 1707, 269,
  103
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 17/08/2025',
  '2025-08-17',
  '10:00:00',
  438, 88,
  6, 4,
  347, 1,
  2, 1031, 7,
  103
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 17/08/2025',
  '2025-08-17',
  '11:30:00',
  742, 144,
  2, 2,
  272, 0,
  3, 985, 17,
  103
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 17/08/2025',
  '2025-08-17',
  '19:00:00',
  339, 46,
  1, 0,
  454, 7,
  3, 1522, 738,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 20/08/2025',
  '2025-08-20',
  '20:00:00',
  287, 37,
  2, 0,
  441, 0,
  0, 3248, 19,
  49
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 23/08/2025',
  '2025-08-23',
  '20:00:00',
  180, 0,
  0, 12,
  22, 0,
  0, 246, 67,
  33
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 24/08/2025',
  '2025-08-24',
  '08:30:00',
  219, 33,
  0, 18,
  317, 0,
  1, 929, 2,
  92
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 24/08/2025',
  '2025-08-24',
  '10:00:00',
  516, 92,
  5, 15,
  244, 0,
  1, 780, 10,
  92
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 24/08/2025',
  '2025-08-24',
  '11:30:00',
  536, 92,
  3, 5,
  199, 0,
  2, 685, 54,
  92
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 24/08/2025',
  '2025-08-24',
  '19:00:00',
  418, 46,
  4, 3,
  326, 1,
  5, 1224, 79,
  54
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 27/08/2025',
  '2025-08-27',
  '20:00:00',
  289, 33,
  0, 7,
  524, 2,
  2, 3248, 412,
  61
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 30/08/2025',
  '2025-08-30',
  '20:00:00',
  192, 0,
  0, 6,
  24, 0,
  0, 246, 42,
  27
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 31/08/2025',
  '2025-08-31',
  '08:30:00',
  194, 43,
  0, 0,
  319, 2,
  4, 929, 31,
  111
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 31/08/2025',
  '2025-08-31',
  '10:00:00',
  418, 117,
  3, 2,
  253, 0,
  2, 780, 26,
  111
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 31/08/2025',
  '2025-08-31',
  '11:30:00',
  483, 112,
  2, 2,
  183, 0,
  2, 685, 23,
  111
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 31/08/2025',
  '2025-08-31',
  '19:00:00',
  327, 40,
  2, 7,
  550, 5,
  4, 1224, 171,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-08-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 03/09/2025',
  '2025-09-03',
  '20:00:00',
  231, 31,
  2, 5,
  613, 2,
  5, 1946, 321,
  56
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 06/09/2025',
  '2025-09-06',
  '20:00:00',
  156, 0,
  0, 6,
  22, 0,
  0, 258, 49,
  21
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 07/09/2025',
  '2025-09-07',
  '08:30:00',
  164, 25,
  2, 0,
  394, 1,
  0, 1500, 241,
  107
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 07/09/2025',
  '2025-09-07',
  '10:00:00',
  532, 99,
  2, 3,
  609, 15,
  4, 876, 35,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 07/09/2025',
  '2025-09-07',
  '11:30:00',
  630, 141,
  2, 3,
  682, 2,
  1, 692, 18,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 07/09/2025',
  '2025-09-07',
  '19:00:00',
  379, 61,
  3, 8,
  484, 1,
  7, 1425, 365,
  63
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 10/09/2025',
  '2025-09-10',
  '20:00:00',
  301, 33,
  2, 1,
  494, 2,
  3, 796, 1364,
  65
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 13/09/2025',
  '2025-09-13',
  '20:00:00',
  73, 0,
  0, 5,
  13, 0,
  0, 231, 33,
  21
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 14/09/2025',
  '2025-09-14',
  '08:30:00',
  193, 32,
  1, 3,
  382, 4,
  0, 1395, 11,
  111
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 14/09/2025',
  '2025-09-14',
  '10:00:00',
  532, 118,
  2, 28,
  337, 0,
  3, 1079, 9,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 14/09/2025',
  '2025-09-14',
  '11:30:00',
  570, 108,
  3, 2,
  212, 1,
  1, 768, 8,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 14/09/2025',
  '2025-09-14',
  '19:00:00',
  342, 43,
  3, 10,
  422, 2,
  3, 1745, 182,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 17/09/2025',
  '2025-09-17',
  '20:00:00',
  265, 39,
  1, 3,
  497, 0,
  3, 1719, 293,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 20/09/2025',
  '2025-09-20',
  '20:00:00',
  118, 0,
  0, 0,
  65, 0,
  0, 238, 30,
  20
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 21/09/2025',
  '2025-09-21',
  '08:30:00',
  220, 37,
  1, 12,
  442, 0,
  3, 1716, 65,
  97
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 21/09/2025',
  '2025-09-21',
  '10:00:00',
  344, 102,
  0, 5,
  332, 0,
  1, 1034, 59,
  97
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 21/09/2025',
  '2025-09-21',
  '11:30:00',
  442, 98,
  7, 0,
  241, 5,
  4, 820, 62,
  97
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 21/09/2025',
  '2025-09-21',
  '19:00:00',
  354, 48,
  1, 5,
  486, 12,
  9, 1787, 191,
  52
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 24/09/2025',
  '2025-09-24',
  '20:00:00',
  262, 37,
  1, 4,
  556, 1,
  5, 1979, 80,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 27/09/2025',
  '2025-09-27',
  '20:00:00',
  377, 0,
  6, 97,
  60, 0,
  0, 588, 180,
  23
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 28/09/2025',
  '2025-09-28',
  '08:30:00',
  386, 29,
  3, 31,
  232, 0,
  0, 1267, 30,
  119
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 28/09/2025',
  '2025-09-28',
  '10:00:00',
  495, 110,
  3, 14,
  210, 0,
  0, 685, 68,
  119
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 28/09/2025',
  '2025-09-28',
  '11:30:00',
  541, 105,
  3, 14,
  180, 0,
  3, 505, 44,
  119
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 28/09/2025',
  '2025-09-28',
  '19:00:00',
  482, 61,
  2, 21,
  270, 15,
  4, 950, 135,
  62
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-09-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 01/10/2025',
  '2025-10-01',
  '20:00:00',
  252, 42,
  1, 1,
  548, 0,
  3, 1985, 143,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 04/10/2025',
  '2025-10-04',
  '20:00:00',
  165, 0,
  1, 8,
  71, 0,
  0, 261, 48,
  9
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 05/10/2025',
  '2025-10-05',
  '08:30:00',
  228, 40,
  4, 7,
  363, 3,
  2, 1464, 32,
  101
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 05/10/2025',
  '2025-10-05',
  '10:00:00',
  454, 110,
  6, 5,
  225, 1,
  0, 787, 34,
  101
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 05/10/2025',
  '2025-10-05',
  '11:30:00',
  484, 114,
  5, 0,
  175, 1,
  5, 488, 38,
  101
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 05/10/2025',
  '2025-10-05',
  '19:00:00',
  450, 72,
  3, 6,
  347, 1,
  7, 1250, 664,
  58
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 08/10/2025',
  '2025-10-08',
  '20:00:00',
  243, 32,
  5, 2,
  615, 0,
  3, 2291, 284,
  63
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 11/10/2025',
  '2025-10-11',
  '20:00:00',
  178, 0,
  0, 7,
  22, 0,
  0, 353, 70,
  11
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 12/10/2025',
  '2025-10-12',
  '08:30:00',
  212, 31,
  2, 4,
  368, 0,
  1, 958, 27,
  92
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 12/10/2025',
  '2025-10-12',
  '10:00:00',
  459, 128,
  3, 6,
  349, 5,
  5, 1364, 667,
  92
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 12/10/2025',
  '2025-10-12',
  '11:30:00',
  489, 108,
  2, 3,
  221, 6,
  4, 732, 33,
  92
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 12/10/2025',
  '2025-10-12',
  '19:00:00',
  360, 62,
  1, 4,
  426, 0,
  8, 1319, 69,
  63
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 15/10/2025',
  '2025-10-15',
  '20:00:00',
  263, 0,
  2, 1,
  480, 2,
  3, 1672, 444,
  44
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 18/10/2025',
  '2025-10-18',
  '20:00:00',
  127, 0,
  0, 3,
  24, 0,
  0, 185, 12,
  28
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 19/10/2025',
  '2025-10-19',
  '08:30:00',
  144, 19,
  1, 2,
  364, 1,
  4, 1153, 156,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 19/10/2025',
  '2025-10-19',
  '10:00:00',
  374, 80,
  0, 4,
  273, 3,
  0, 805, 5,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 19/10/2025',
  '2025-10-19',
  '11:30:00',
  480, 99,
  2, 3,
  200, 2,
  2, 644, 20,
  87
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 19/10/2025',
  '2025-10-19',
  '19:00:00',
  287, 37,
  2, 3,
  325, 1,
  3, 885, 12,
  52
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 22/10/2025',
  '2025-10-22',
  '20:00:00',
  403, 33,
  3, 4,
  709, 0,
  3, 2341, 495,
  56
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 25/10/2025',
  '2025-10-25',
  '20:00:00',
  107, 0,
  0, 3,
  24, 0,
  0, 180, 0,
  20
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 26/10/2025',
  '2025-10-26',
  '08:30:00',
  275, 38,
  0, 22,
  430, 0,
  3, 1564, 0,
  120
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 26/10/2025',
  '2025-10-26',
  '10:00:00',
  487, 118,
  1, 26,
  300, 0,
  6, 962, 0,
  120
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 26/10/2025',
  '2025-10-26',
  '11:30:00',
  632, 106,
  1, 0,
  206, 0,
  2, 707, 0,
  120
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 26/10/2025',
  '2025-10-26',
  '19:00:00',
  361, 56,
  3, 9,
  439, 5,
  6, 800, 0,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 29/10/2025',
  '2025-10-29',
  '20:00:00',
  266, 38,
  2, 2,
  616, 7,
  4, 2083, 398,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-10-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 01/11/2025',
  '2025-11-01',
  '20:00:00',
  122, 0,
  0, 3,
  0, 0,
  0, 0, 28,
  19
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 02/11/2025',
  '2025-11-02',
  '08:30:00',
  241, 35,
  1, 8,
  0, 0,
  3, 0, 93,
  108
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 02/11/2025',
  '2025-11-02',
  '10:00:00',
  430, 101,
  2, 5,
  0, 2,
  4, 0, 359,
  108
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 02/11/2025',
  '2025-11-02',
  '11:30:00',
  746, 149,
  3, 2,
  0, 2,
  6, 0, 182,
  108
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 02/11/2025',
  '2025-11-02',
  '19:00:00',
  439, 58,
  0, 2,
  0, 1,
  1, 0, 703,
  71
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-02'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 05/11/2025',
  '2025-11-05',
  '20:00:00',
  158, 24,
  0, 1,
  470, 1,
  3, 1858, 153,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 08/11/2025',
  '2025-11-08',
  '20:00:00',
  132, 0,
  2, 4,
  25, 0,
  0, 174, 35,
  11
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 09/11/2025',
  '2025-11-09',
  '08:30:00',
  161, 24,
  0, 3,
  298, 1,
  2, 1361, 53,
  103
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 09/11/2025',
  '2025-11-09',
  '10:00:00',
  428, 107,
  3, 27,
  270, 3,
  1, 931, 22,
  103
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 09/11/2025',
  '2025-11-09',
  '11:30:00',
  398, 117,
  3, 8,
  192, 1,
  1, 694, 330,
  103
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 09/11/2025',
  '2025-11-09',
  '19:00:00',
  331, 69,
  2, 3,
  261, 0,
  6, 787, 95,
  66
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-09'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 12/11/2025',
  '2025-11-12',
  '20:00:00',
  129, 23,
  3, 3,
  430, 0,
  0, 1595, 377,
  66
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 15/11/2025',
  '2025-11-15',
  '20:00:00',
  134, 0,
  0, 0,
  23, 0,
  0, 149, 27,
  23
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 16/11/2025',
  '2025-11-16',
  '08:30:00',
  118, 22,
  2, 3,
  293, 0,
  0, 862, 553,
  108
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 16/11/2025',
  '2025-11-16',
  '10:00:00',
  329, 95,
  0, 0,
  357, 3,
  0, 637, 318,
  108
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 16/11/2025',
  '2025-11-16',
  '11:30:00',
  476, 117,
  0, 2,
  502, 2,
  4, 501, 558,
  108
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 16/11/2025',
  '2025-11-16',
  '19:00:00',
  331, 56,
  2, 3,
  285, 0,
  0, 803, 84,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-16'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 19/11/2025',
  '2025-11-19',
  '20:00:00',
  201, 36,
  0, 0,
  426, 2,
  1, 1668, 422,
  63
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-19'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 22/11/2025',
  '2025-11-22',
  '20:00:00',
  162, 0,
  0, 3,
  22, 0,
  0, 248, 40,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 23/11/2025',
  '2025-11-23',
  '08:30:00',
  241, 29,
  0, 13,
  401, 4,
  0, 1072, 764,
  112
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 23/11/2025',
  '2025-11-23',
  '10:00:00',
  398, 88,
  2, 34,
  340, 0,
  2, 839, 351,
  112
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 23/11/2025',
  '2025-11-23',
  '11:30:00',
  499, 95,
  5, 1,
  205, 0,
  2, 668, 134,
  112
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 23/11/2025',
  '2025-11-23',
  '19:00:00',
  383, 53,
  2, 4,
  556, 0,
  4, 1177, 613,
  53
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-23'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 26/11/2025',
  '2025-11-26',
  '20:00:00',
  244, 42,
  1, 2,
  515, 1,
  0, 1693, 402,
  63
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-26'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 29/11/2025',
  '2025-11-29',
  '20:00:00',
  68, 0,
  0, 1,
  15, 0,
  0, 158, 23,
  18
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 30/11/2025',
  '2025-11-30',
  '08:30:00',
  192, 29,
  1, 3,
  413, 4,
  2, 1354, 95,
  94
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 30/11/2025',
  '2025-11-30',
  '10:00:00',
  286, 84,
  1, 2,
  276, 0,
  7, 819, 39,
  94
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 30/11/2025',
  '2025-11-30',
  '11:30:00',
  436, 91,
  0, 0,
  192, 1,
  2, 597, 53,
  94
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 30/11/2025',
  '2025-11-30',
  '19:00:00',
  383, 70,
  0, 3,
  435, 0,
  2, 1287, 541,
  62
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-11-30'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 03/12/2025',
  '2025-12-03',
  '20:00:00',
  0, 0,
  0, 0,
  414, 0,
  4, 1679, 311,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 06/12/2025',
  '2025-12-06',
  '20:00:00',
  0, 0,
  0, 0,
  0, 0,
  0, 0, 0,
  0
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-06'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 07/12/2025',
  '2025-12-07',
  '08:30:00',
  215, 23,
  4, 2,
  411, 1,
  3, 1566, 162,
  109
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 07/12/2025',
  '2025-12-07',
  '10:00:00',
  336, 94,
  2, 0,
  273, 3,
  0, 732, 75,
  109
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 07/12/2025',
  '2025-12-07',
  '11:30:00',
  457, 98,
  3, 0,
  180, 2,
  1, 558, 214,
  109
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 07/12/2025',
  '2025-12-07',
  '19:00:00',
  448, 57,
  1, 0,
  386, 1,
  3, 1055, 445,
  69
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 10/12/2025',
  '2025-12-10',
  '20:00:00',
  191, 39,
  0, 0,
  453, 0,
  3, 1593, 396,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 13/12/2025',
  '2025-12-13',
  '20:00:00',
  120, 0,
  0, 4,
  0, 0,
  0, 0, 0,
  14
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-13'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 14/12/2025',
  '2025-12-14',
  '08:30:00',
  199, 27,
  0, 1,
  305, 1,
  2, 1169, 31,
  116
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 14/12/2025',
  '2025-12-14',
  '10:00:00',
  482, 94,
  5, 5,
  219, 1,
  2, 753, 59,
  116
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 14/12/2025',
  '2025-12-14',
  '11:30:00',
  574, 98,
  6, 4,
  161, 1,
  1, 618, 3,
  116
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 14/12/2025',
  '2025-12-14',
  '19:00:00',
  371, 57,
  1, 4,
  239, 2,
  1, 957, 15,
  79
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 17/12/2025',
  '2025-12-17',
  '20:00:00',
  165, 25,
  1, 0,
  478, 4,
  1, 1863, 105,
  57
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 20/12/2025',
  '2025-12-20',
  '20:00:00',
  67, 0,
  0, 1,
  17, 0,
  0, 159, 10,
  14
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-20'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 21/12/2025',
  '2025-12-21',
  '08:30:00',
  305, 21,
  2, 0,
  381, 0,
  7, 1527, 202,
  116
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 21/12/2025',
  '2025-12-21',
  '10:00:00',
  554, 88,
  7, 0,
  263, 0,
  7, 1250, 233,
  116
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 21/12/2025',
  '2025-12-21',
  '11:30:00',
  806, 110,
  8, 0,
  197, 1,
  1, 703, 119,
  116
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 21/12/2025',
  '2025-12-21',
  '19:00:00',
  384, 44,
  3, 0,
  251, 1,
  3, 1016, 434,
  79
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 24/12/2025',
  '2025-12-24',
  '20:00:00',
  366, 39,
  2, 2,
  400, 0,
  3, 1607, 272,
  53
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 27/12/2025',
  '2025-12-27',
  '20:00:00',
  86, 0,
  0, 8,
  20, 0,
  0, 206, 8,
  23
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-27'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 28/12/2025',
  '2025-12-28',
  '08:30:00',
  232, 23,
  1, 4,
  227, 5,
  2, 836, 40,
  108
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 28/12/2025',
  '2025-12-28',
  '10:00:00',
  334, 77,
  0, 10,
  204, 2,
  1, 688, 16,
  108
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 28/12/2025',
  '2025-12-28',
  '11:30:00',
  491, 89,
  6, 3,
  121, 2,
  3, 499, 35,
  108
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 28/12/2025',
  '2025-12-28',
  '19:00:00',
  285, 43,
  2, 1,
  220, 2,
  0, 835, 67,
  52
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 31/12/2025',
  '2025-12-31',
  '20:00:00',
  918, 0,
  4, 0,
  310, 0,
  0, 1726, 401,
  27
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2025-12-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 03/01/2026',
  '2026-01-03',
  '20:00:00',
  103, 0,
  0, 1,
  22, 0,
  0, 192, 0,
  19
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-03'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 04/01/2026',
  '2026-01-04',
  '08:30:00',
  229, 28,
  4, 6,
  347, 9,
  1, 1498, 0,
  67
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 04/01/2026',
  '2026-01-04',
  '10:00:00',
  397, 95,
  3, 0,
  257, 7,
  7, 931, 0,
  67
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 04/01/2026',
  '2026-01-04',
  '11:30:00',
  700, 115,
  6, 6,
  240, 3,
  1, 927, 0,
  67
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 04/01/2026',
  '2026-01-04',
  '19:00:00',
  555, 53,
  8, 5,
  400, 0,
  4, 1399, 0,
  52
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 07/01/2026',
  '2026-01-07',
  '20:00:00',
  291, 20,
  0, 20,
  435, 0,
  2, 2050, 0,
  32
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 10/01/2026',
  '2026-01-10',
  '20:00:00',
  108, 0,
  0, 4,
  31, 0,
  0, 236, 0,
  20
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-10'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 11/01/2026',
  '2026-01-11',
  '08:30:00',
  201, 19,
  1, 0,
  266, 0,
  0, 1441, 0,
  106
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 11/01/2026',
  '2026-01-11',
  '10:00:00',
  402, 103,
  4, 10,
  248, 0,
  3, 774, 0,
  106
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 11/01/2026',
  '2026-01-11',
  '11:30:00',
  474, 106,
  6, 1,
  154, 0,
  2, 549, 0,
  106
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 11/01/2026',
  '2026-01-11',
  '19:00:00',
  395, 55,
  4, 4,
  309, 4,
  3, 1256, 0,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 14/01/2026',
  '2026-01-14',
  '20:00:00',
  290, 41,
  2, 2,
  482, 0,
  3, 513, 37,
  46
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 17/01/2026',
  '2026-01-17',
  '20:00:00',
  95, 0,
  0, 8,
  38, 0,
  0, 22, 12,
  10
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-17'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 18/01/2026',
  '2026-01-18',
  '08:30:00',
  214, 27,
  0, 0,
  304, 0,
  3, 255, 18,
  98
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 18/01/2026',
  '2026-01-18',
  '10:00:00',
  382, 99,
  2, 0,
  205, 1,
  1, 661, 20,
  98
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 18/01/2026',
  '2026-01-18',
  '11:30:00',
  503, 99,
  1, 1,
  157, 0,
  1, 52, 10,
  98
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 18/01/2026',
  '2026-01-18',
  '19:00:00',
  346, 44,
  2, 6,
  247, 3,
  0, 195, 133,
  56
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 21/01/2026',
  '2026-01-21',
  '20:00:00',
  199, 27,
  1, 1,
  696, 1,
  1, 574, NULL,
  41
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 24/01/2026',
  '2026-01-24',
  '20:00:00',
  129, 0,
  0, 8,
  33, 0,
  0, 251, NULL,
  20
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-24'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 25/01/2026',
  '2026-01-25',
  '08:30:00',
  187, 27,
  0, 6,
  277, 1,
  2, 760, NULL,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 25/01/2026',
  '2026-01-25',
  '10:00:00',
  361, 77,
  2, 0,
  249, 1,
  0, 804, NULL,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 25/01/2026',
  '2026-01-25',
  '11:30:00',
  494, 90,
  10, 1,
  172, 3,
  2, 432, NULL,
  60
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 25/01/2026',
  '2026-01-25',
  '19:00:00',
  401, 51,
  0, 4,
  288, 0,
  0, 764, NULL,
  48
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 28/01/2026',
  '2026-01-28',
  '20:00:00',
  230, 32,
  4, 0,
  298, 0,
  1, 1274, 37,
  35
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 31/01/2026',
  '2026-01-31',
  '20:00:00',
  152, NULL,
  3, 6,
  22, 0,
  0, 229, 42,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-01-31'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 01/02/2026',
  '2026-02-01',
  '08:30:00',
  161, 23,
  1, 0,
  277, 1,
  2, 783, 53,
  50
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 01/02/2026',
  '2026-02-01',
  '10:00:00',
  430, 96,
  0, 5,
  249, 1,
  0, 827, 47,
  50
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 01/02/2026',
  '2026-02-01',
  '11:30:00',
  561, 119,
  6, 8,
  172, 3,
  2, 444, 50,
  50
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 01/02/2026',
  '2026-02-01',
  '19:00:00',
  397, 72,
  3, 9,
  288, 0,
  0, 898, 217,
  36
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 04/02/2026',
  '2026-02-04',
  '20:00:00',
  271, 35,
  0, 2,
  279, 0,
  0, 928, 649,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 07/02/2026',
  '2026-02-07',
  '20:00:00',
  130, 0,
  0, 6,
  17, 0,
  0, 151, 37,
  24
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 08/02/2026',
  '2026-02-08',
  '08:30:00',
  155, 26,
  0, 1,
  246, 0,
  0, 1161, 220,
  70
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 08/02/2026',
  '2026-02-08',
  '10:00:00',
  440, 111,
  6, 9,
  233, 2,
  2, 656, 2,
  70
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 08/02/2026',
  '2026-02-08',
  '11:30:00',
  602, 113,
  0, 3,
  157, 1,
  2, 501, 8,
  70
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 08/02/2026',
  '2026-02-08',
  '19:00:00',
  291, 46,
  0, 9,
  420, 2,
  1, 1006, 71,
  40
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 11/02/2026',
  '2026-02-11',
  '20:00:00',
  189, 28,
  0, 0,
  895, 0,
  2, 1373, 202,
  40
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 15/02/2026',
  '2026-02-15',
  '08:30:00',
  172, 22,
  0, 0,
  229, 1,
  1, 875, 23,
  53
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 15/02/2026',
  '2026-02-15',
  '10:00:00',
  264, 85,
  5, 0,
  189, 3,
  2, 614, 49,
  53
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 15/02/2026',
  '2026-02-15',
  '11:30:00',
  352, 84,
  2, 0,
  124, 0,
  1, 420, 48,
  53
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 15/02/2026',
  '2026-02-15',
  '19:00:00',
  185, 41,
  0, 0,
  145, 1,
  1, 554, 141,
  27
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 18/02/2026',
  '2026-02-18',
  '20:00:00',
  211, 27,
  1, 0,
  527, 0,
  2, 1888, 202,
  37
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 21/02/2026',
  '2026-02-21',
  '20:00:00',
  123, NULL,
  0, 8,
  17, 0,
  0, 289, 22,
  38
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 22/02/2026',
  '2026-02-22',
  '08:30:00',
  199, 31,
  0, 13,
  357, 1,
  2, 1295, 23,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 22/02/2026',
  '2026-02-22',
  '10:00:00',
  483, 113,
  4, 6,
  278, 0,
  0, 810, 49,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 22/02/2026',
  '2026-02-22',
  '11:30:00',
  704, 122,
  2, 0,
  214, 0,
  2, 699, 48,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 22/02/2026',
  '2026-02-22',
  '19:00:00',
  384, 43,
  2, 4,
  392, 3,
  1, 1070, 141,
  42
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 25/02/2026',
  '2026-02-25',
  '20:00:00',
  314, 29,
  0, 0,
  483, 0,
  1, 1616, 2019,
  34
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 28/02/2026',
  '2026-02-28',
  '20:00:00',
  203, NULL,
  0, 8,
  30, 0,
  0, 290, NULL,
  38
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-02-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 01/03/2026',
  '2026-03-01',
  '08:30:00',
  251, 32,
  2, 8,
  335, 4,
  3, 958, NULL,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 01/03/2026',
  '2026-03-01',
  '10:00:00',
  476, 115,
  4, 16,
  228, 4,
  1, 792, NULL,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 01/03/2026',
  '2026-03-01',
  '11:30:00',
  784, 145,
  3, 4,
  230, 0,
  1, 528, NULL,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 01/03/2026',
  '2026-03-01',
  '19:00:00',
  457, 75,
  2, 2,
  350, 0,
  3, 1209, NULL,
  46
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 04/03/2026',
  '2026-03-04',
  '20:00:00',
  341, 25,
  1, 10,
  462, 0,
  1, 1672, 2089,
  55
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 07/03/2026',
  '2026-03-07',
  '20:00:00',
  187, NULL,
  0, 16,
  81, 0,
  0, 239, NULL,
  28
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-07'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 08/03/2026',
  '2026-03-08',
  '08:30:00',
  225, 14,
  0, 8,
  483, 0,
  0, 118, NULL,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 08/03/2026',
  '2026-03-08',
  '10:00:00',
  472, 97,
  0, 5,
  175, 0,
  0, 739, NULL,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 08/03/2026',
  '2026-03-08',
  '11:30:00',
  531, 97,
  0, 1,
  98, 0,
  0, 503, NULL,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 08/03/2026',
  '2026-03-08',
  '19:00:00',
  311, 36,
  0, 4,
  187, 3,
  0, 920, NULL,
  47
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 11/03/2026',
  '2026-03-11',
  '20:00:00',
  287, 19,
  2, 1,
  574, 0,
  4, 1891, NULL,
  38
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 14/03/2026',
  '2026-03-14',
  '20:00:00',
  174, NULL,
  0, 2,
  55, 0,
  0, 172, NULL,
  32
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-14'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 15/03/2026',
  '2026-03-15',
  '08:30:00',
  212, 21,
  0, 3,
  372, 0,
  2, 1333, NULL,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 15/03/2026',
  '2026-03-15',
  '10:00:00',
  415, 93,
  2, 2,
  259, 1,
  2, 800, NULL,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 15/03/2026',
  '2026-03-15',
  '11:30:00',
  688, 106,
  8, 3,
  236, 1,
  2, 815, NULL,
  59
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 15/03/2026',
  '2026-03-15',
  '19:00:00',
  517, 54,
  2, 2,
  382, 2,
  3, 1347, NULL,
  36
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-15'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 18/03/2026',
  '2026-03-18',
  '20:00:00',
  286, 18,
  2, 3,
  575, 3,
  1, 1887, 323,
  35
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-18'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 21/03/2026',
  '2026-03-21',
  '20:00:00',
  171, NULL,
  0, 3,
  21, 0,
  0, 220, 33,
  31
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-21'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 22/03/2026',
  '2026-03-22',
  '08:30:00',
  199, 15,
  0, 10,
  369, 1,
  2, 1126, 118,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 22/03/2026',
  '2026-03-22',
  '10:00:00',
  503, 95,
  2, 20,
  223, 0,
  3, 747, 53,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 22/03/2026',
  '2026-03-22',
  '11:30:00',
  621, 90,
  3, 0,
  167, 3,
  3, 575, 71,
  73
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 22/03/2026',
  '2026-03-22',
  '19:00:00',
  458, 48,
  0, 0,
  385, 2,
  5, 1020, 203,
  25
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-22'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 25/03/2026',
  '2026-03-25',
  '20:00:00',
  330, 28,
  1, 0,
  554, 4,
  1, 1818, 452,
  45
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-25'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 28/03/2026',
  '2026-03-28',
  '20:00:00',
  139, NULL,
  0, 5,
  22, 0,
  0, 197, 74,
  30
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-28'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 29/03/2026',
  '2026-03-29',
  '08:30:00',
  188, 18,
  1, 5,
  302, 1,
  1, 1203, 42,
  69
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 29/03/2026',
  '2026-03-29',
  '10:00:00',
  436, 84,
  3, 1,
  234, 5,
  0, 828, 23,
  69
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 29/03/2026',
  '2026-03-29',
  '11:30:00',
  592, 100,
  5, 1,
  160, 0,
  0, 561, 315,
  69
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 29/03/2026',
  '2026-03-29',
  '19:00:00',
  364, 41,
  1, 4,
  270, 1,
  4, 1318, 420,
  41
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-03-29'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 01/04/2026',
  '2026-04-01',
  '20:00:00',
  311, 53,
  0, 0,
  510, 0,
  3, 1643, 432,
  35
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-04-01'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 04/04/2026',
  '2026-04-04',
  '20:00:00',
  107, NULL,
  1, 0,
  20, 0,
  0, 180, 58,
  28
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-04-04'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 05/04/2026',
  '2026-04-05',
  '08:30:00',
  402, 32,
  0, 1,
  410, 0,
  5, 1507, 413,
  102
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-04-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 05/04/2026',
  '2026-04-05',
  '10:00:00',
  716, 116,
  6, 7,
  284, 1,
  4, 850, 69,
  102
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-04-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 05/04/2026',
  '2026-04-05',
  '11:30:00',
  684, 88,
  9, 1,
  170, 0,
  0, 596, 53,
  102
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-04-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 05/04/2026',
  '2026-04-05',
  '19:00:00',
  566, 53,
  1, 3,
  378, 2,
  5, 1008, 39,
  71
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-04-05'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Quarta com Deus - 08/04/2026',
  '2026-04-08',
  '20:00:00',
  325, 24,
  4, 2,
  543, 1,
  3, 1783, 395,
  35
FROM public.vol_service_types vst
WHERE vst.name = 'Quarta com Deus'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-04-08'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'AMI - 11/04/2026',
  '2026-04-11',
  '20:00:00',
  154, 0,
  0, 8,
  30, 0,
  0, 290, 38,
  32
FROM public.vol_service_types vst
WHERE vst.name = 'AMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-04-11'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 08:30 - 12/04/2026',
  '2026-04-12',
  '08:30:00',
  198, 29,
  1, 0,
  331, 0,
  0, 1102, 80,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 08:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-04-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 10:00 - 12/04/2026',
  '2026-04-12',
  '10:00:00',
  476, 103,
  2, 12,
  245, 0,
  0, 890, 51,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 10:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-04-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 11:30 - 12/04/2026',
  '2026-04-12',
  '11:30:00',
  653, 88,
  1, 3,
  169, 0,
  0, 463, 90,
  75
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 11:30'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-04-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  'Domingo 19:00 - 12/04/2026',
  '2026-04-12',
  '19:00:00',
  417, 46,
  5, 8,
  297, 0,
  0, 891, 635,
  50
FROM public.vol_service_types vst
WHERE vst.name = 'Domingo 19:00'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '2026-04-12'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;

COMMIT;

-- Fim: 925 registros gerados.
