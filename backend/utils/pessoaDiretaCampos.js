// ============================================================================
// CAMPOS do "Adicionar pessoa" no grupo · régua PURA (Marcos · 25/08/2026)
//
// ⚠️ Mora em `utils/` e NÃO em `services/`, de propósito: `services/` carrega o
// cliente do Supabase, e o gate de deploy roda sem as dependências de
// `backend/` instaladas — régua que precisa estar no gate não pode arrastar o
// banco atrás dela. É a mesma razão pela qual `validarNascimento`,
// `emailValido` e `tirarCodigoPaisTelefone` mudaram de casa em 06/08.
//
// Quem lê o banco e escreve é `services/grupoPessoaDireta.js`, que importa
// isto. O porquê de cada decisão de produto está no cabeçalho de lá.
// ============================================================================
const {
  soDigitos, tirarCodigoPaisTelefone, emailValido, validarNascimento,
} = require('./camposContato');

/**
 * Valida e normaliza o que a tela mandou. PURA — nenhuma ida ao banco, então
 * o teste do gate a exercita sem serviço nenhum de pé.
 *
 * ⚠️ Obrigatórios: nome + telefone. É o mesmo mínimo do irmão mais próximo
 * (`POST /public/grupos/grupo/frequencia/visitante`, o líder registrando um
 * visitante do encontro) e é DELIBERADO não exigir o contrato inteiro (CPF,
 * nascimento, sexo): quem preenche está no meio de um encontro, no celular, por
 * OUTRA pessoa. Exigir 6 campos faz o líder não usar a tela e a pessoa não
 * entrar em lugar nenhum — resultado pior que o cadastro incompleto, que a fila
 * de "faltam dados" da aba Pessoas já cobra (lei de 14/08).
 */
function validarPessoaDireta(body = {}) {
  const nome = String(body.nome || '').trim().replace(/\s+/g, ' ');
  if (nome.length < 3) return { ok: false, erro: 'Digite o nome da pessoa.', campo: 'nome' };

  const telefone = tirarCodigoPaisTelefone(soDigitos(body.telefone));
  if (![10, 11].includes(telefone.length)) {
    return { ok: false, erro: 'Digite um celular com DDD.', campo: 'telefone' };
  }

  const email = String(body.email || '').trim().toLowerCase() || null;
  if (email && !emailValido(email)) {
    return { ok: false, erro: 'E-mail inválido.', campo: 'email' };
  }

  // ⚠️ `validarNascimento` devolve a data NORMALIZADA ou `null` — não um objeto.
  const nascBruto = String(body.data_nascimento || '').trim();
  const dataNascimento = nascBruto ? validarNascimento(nascBruto) : null;
  if (nascBruto && !dataNascimento) {
    return { ok: false, erro: 'Data de nascimento inválida.', campo: 'data_nascimento' };
  }

  // ⚠️ `masculino|feminino`, NUNCA "outro" (Contrato de Inscrição · 28/07), e
  // ⚠️ NUNCA inferido do nome: a lei de 10/08 proíbe GRAVAR sexo por palpite.
  // Em branco fica NULL e a fila de "faltam dados" cobra depois.
  const generoBruto = String(body.genero || '').toLowerCase();
  const genero = ['masculino', 'feminino'].includes(generoBruto) ? generoBruto : null;

  // ⚠️ CPF: quem confere o DV é o matcher (é a chave FORTE dele). CPF com
  // tamanho errado é DESCARTADO em vez de virar identidade errada — mesma régua
  // do gatilho do auth (04/08) — e NÃO recusa o cadastro por causa disso.
  const cpfDigitos = soDigitos(body.cpf);
  const cpf = cpfDigitos.length === 11 ? cpfDigitos : null;

  // ⚠️ `visitante` SÓ quando quem preenche declara (lei de 14/08: "quem o líder
  // realmente identifica como visitante, deve ser visitante"). O default é
  // `frequentador`, porque adicionar alguém de propósito é PARTICIPAÇÃO, não
  // visita — a mesma régua da coordenação adicionando pela tela do ERP.
  const funcao = String(body.funcao || '') === 'visitante' ? 'visitante' : 'frequentador';

  return { ok: true, nome, telefone, email, dataNascimento, genero, cpf, funcao };
}

module.exports = { validarPessoaDireta };
