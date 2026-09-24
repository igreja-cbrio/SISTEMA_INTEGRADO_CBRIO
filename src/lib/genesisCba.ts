// ============================================================================
// Genesis CBA · evento que a CBRio opera para uma igreja PARCEIRA (24/09/2026)
// ============================================================================
// A inscrição usa a espinha inteira (campos padrão do Contrato + form-builder),
// mas a pessoa inscrita NÃO é da CBRio: não vira cadastro, não conta nos números
// e o evento não aparece no app (backend/services/igrejaParceira.js).
//
// Este arquivo é o MOLDE do formulário: as perguntas extras que a igreja
// parceira pediu. Os campos padrão (nome completo, CPF, e-mail, celular,
// nascimento, sexo, aceite LGPD) NÃO entram aqui — vêm do Contrato de Inscrição
// e são exigidos pelo servidor em toda porta.
//
// ⚠️ As `key` são FIXAS e opacas (padrão `[a-z0-9_]`, que `keyCampoPreservada`
// aceita): é a mesma key em todo Genesis, então a resposta de uma edição
// continua comparável com a da outra. NUNCA derivar a key do rótulo.
// ============================================================================

export type CampoForm = {
  key: string;
  label: string;
  tipo: string;
  obrigatorio: boolean;
  opcoes: string[];
};

export const GENESIS_CAMPOS: readonly CampoForm[] = Object.freeze([
  { key: 'c_genesis_igreja', label: 'Qual o nome da sua igreja ou instituição?', tipo: 'texto', obrigatorio: true, opcoes: [] },
  { key: 'c_genesis_endereco', label: 'Preencha o endereço completo da sua igreja ou instituição:', tipo: 'textarea', obrigatorio: true, opcoes: [] },
  { key: 'c_genesis_cargo', label: 'Qual seu cargo na sua igreja ou instituição?', tipo: 'texto', obrigatorio: true, opcoes: [] },
  { key: 'c_genesis_ja_participou', label: 'Você já participou do Gênesis?', tipo: 'escolha', obrigatorio: true, opcoes: ['Sim', 'Não'] },
  { key: 'c_genesis_como_soube', label: 'Como você ficou sabendo do Gênesis?', tipo: 'texto', obrigatorio: false, opcoes: [] },
]);

/** Molde de um evento Genesis novo: cópia (nunca o objeto congelado). */
export function presetGenesis() {
  return {
    nome: 'Genesis · ',
    tipo: 'evento',
    campos: GENESIS_CAMPOS.map((c) => ({ ...c, opcoes: [...c.opcoes] })),
  };
}

/**
 * Caminho público do formulário. Evento de igreja parceira sai por
 * `/genesis/:slug` (a porta do Genesis CBA); o resto, `/evento/:slug`.
 * As duas rotas abrem a MESMA página — o que muda é o endereço divulgado.
 */
export function caminhoPublicoEvento(ev: { slug?: string | null; igreja_id?: string | null }): string {
  const slug = String(ev?.slug || '').trim();
  if (!slug) return '';
  return ev?.igreja_id ? `/genesis/${slug}` : `/evento/${slug}`;
}
