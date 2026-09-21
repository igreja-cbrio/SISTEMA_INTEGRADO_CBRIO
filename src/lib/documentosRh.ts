/**
 * Catálogo e régua dos DOCUMENTOS do RH.
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE (medido em 21/09/2026)
 * O upload deduzia o tipo do documento pela **EXTENSÃO DO ARQUIVO**:
 *
 *   const tipo = ext === 'pdf' ? 'contrato' : ext;   // RH.jsx:2485
 *
 * Ou seja: todo PDF virava `tipo='contrato'` e todo JPEG virava `tipo='jpg'`.
 * O Cartão CNPJ enviado em PDF era gravado como "contrato", e o checklist de
 * obrigatórios **nunca ficava verde** para cnpj, contrato social ou comprovante
 * bancário — não importa quantos arquivos a pessoa mandasse.
 *
 * É por isso que `rh_documentos` tem **1 linha no banco inteiro** para 46
 * colaboradores ativos, e por que a única que existe tem `tipo='rg'` (veio da
 * rota "+ Manual", onde o tipo é digitado).
 *
 * ⚠️ A régua vive aqui (e não só dentro do componente) porque entra no gate
 * pelo `npm test`: é ela que decide se um documento obrigatório está entregue,
 * e "entregue" aqui vira liberação de pagamento na leitura de quem opera.
 */

export type TipoDoc = {
  /** Valor gravado em `rh_documentos.tipo`. ⚠️ NUNCA derivado do nome do arquivo. */
  tipo: string;
  label: string;
  /** Texto curto de ajuda, quando o nome não basta. */
  dica?: string;
};

/**
 * ⚠️ `rh_documentos.tipo` é TEXT **sem CHECK** (conferido no catálogo em 21/09):
 * acrescentar tipo aqui não exige migration. Em compensação, nada no banco
 * impede tipo escrito errado — por isso o valor tem que vir SEMPRE desta lista,
 * nunca de texto livre nem do arquivo.
 */
export const DOCS_CLT: TipoDoc[] = [
  { tipo: 'contrato', label: 'Contrato de Trabalho' },
  { tipo: 'rg', label: 'RG' },
  { tipo: 'cpf', label: 'CPF' },
  { tipo: 'ctps', label: 'CTPS' },
  { tipo: 'comprovante_residencia', label: 'Comprovante de Residência' },
];

/**
 * PJ · os anexos do **Anexo II** (Ficha Cadastral da Contratada).
 *
 * ⚠️ O PDF pede cinco. São quatro aqui porque o **comprovante de endereço da
 * sede** foi cortado com autorização do dono (21/09): ele é redundante — o
 * endereço já consta do cartão CNPJ — e costuma estar em nome de terceiro
 * (conta de luz do pai, da esposa), o que importaria um titular sem base legal
 * nenhuma (LGPD art. 6º III + art. 9º).
 */
export const DOCS_PJ: TipoDoc[] = [
  { tipo: 'contrato', label: 'Contrato de Prestação de Serviços' },
  { tipo: 'cnpj', label: 'Cartão CNPJ', dica: 'Cartão CNPJ atualizado' },
  { tipo: 'contrato_social', label: 'Contrato social ou MEI', dica: 'Contrato social ou certificado do MEI' },
  { tipo: 'rg', label: 'Identidade do representante' },
  { tipo: 'comprovante_bancario', label: 'Comprovante bancário', dica: 'Comprovante dos dados da conta' },
];

/** PJ e PJ+ → conjunto PJ; o resto (CLT, PREBENDA) → conjunto CLT. */
export function conjuntoDe(tipoContrato?: string | null): TipoDoc[] {
  return String(tipoContrato || '').toUpperCase().startsWith('PJ') ? DOCS_PJ : DOCS_CLT;
}

/**
 * Um documento obrigatório está entregue?
 *
 * ⚠️⚠️ Casa por tipo EXATO, nunca por `includes`. O código antigo fazia
 * `t.includes(req.tipo)`, e `'cnpj'` casa dentro de `'cartao_cnpj'` (desejado)
 * mas `'rg'` também casa dentro de `'encargos'` e de `'rg_antigo'` — um
 * documento errado pintaria o checklist de verde, que é pior que o vermelho
 * honesto de agora. Com o tipo vindo de lista fechada, o exato basta.
 */
export function entregue(documentos: Array<{ tipo?: string | null }> | null | undefined, tipo: string): boolean {
  const alvo = String(tipo || '').toLowerCase().trim();
  if (!alvo) return false;
  return (documentos || []).some((d) => String(d?.tipo || '').toLowerCase().trim() === alvo);
}

/** Quais obrigatórios ainda faltam, na ordem do catálogo. */
export function faltando(
  documentos: Array<{ tipo?: string | null }> | null | undefined,
  tipoContrato?: string | null,
): TipoDoc[] {
  return conjuntoDe(tipoContrato).filter((req) => !entregue(documentos, req.tipo));
}

/**
 * ⚠️ Documento cujo tipo NÃO está no catálogo do contrato daquela pessoa.
 *
 * Existe para a tela poder DIZER que há arquivo fora do checklist, em vez de
 * escondê-lo — é exatamente o caso do passivo deixado pelo bug da extensão
 * (arquivos gravados como `jpg`, `png`, `xlsx`). Esconder faria a pessoa
 * reenviar o que já está lá.
 */
export function foraDoCatalogo(
  documentos: Array<{ tipo?: string | null }> | null | undefined,
  tipoContrato?: string | null,
): Array<{ tipo?: string | null }> {
  const validos = new Set(conjuntoDe(tipoContrato).map((d) => d.tipo));
  return (documentos || []).filter((d) => !validos.has(String(d?.tipo || '').toLowerCase().trim()));
}

/**
 * ⚠️ Assinatura do bug antigo: tipo que é só uma EXTENSÃO de arquivo.
 * Serve para a tela marcar esses arquivos como "tipo não identificado" e
 * oferecer a correção, em vez de deixá-los parecendo categoria de documento.
 */
const EXTENSOES = new Set(['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx', 'webp', 'heic']);
export function tipoEhExtensao(tipo?: string | null): boolean {
  return EXTENSOES.has(String(tipo || '').toLowerCase().trim());
}
