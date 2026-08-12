-- Bucket PRIVADO pra mídia RECEBIDA no inbox (foto/documento que o MEMBRO
-- manda — conteúdo pastoral potencialmente sensível). Antes ia pro bucket
-- público 'wa-inbox' com URL permanente: bastava o link vazar (print,
-- encaminhamento) e não havia revogação nem expiração.
-- O OUTBOUND continua no bucket público DE PROPÓSITO: a Meta busca o anexo
-- pelo link no envio — privado quebraria o envio de anexo.
-- Só o backend toca aqui (service_role bypassa a RLS do storage) — nenhuma
-- policy pra authenticated/anon de propósito; a equipe vê por URL ASSINADA
-- de 15 min gerada na leitura da thread.
INSERT INTO storage.buckets (id, name, public)
VALUES ('wa-inbox-privado', 'wa-inbox-privado', false)
ON CONFLICT (id) DO UPDATE SET public = false;
