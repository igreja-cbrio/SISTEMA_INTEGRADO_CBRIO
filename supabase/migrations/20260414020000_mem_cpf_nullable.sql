-- Torna cpf opcional em mem_membros (cadastro interno nem sempre tem CPF).
ALTER TABLE mem_membros ALTER COLUMN cpf DROP NOT NULL;
