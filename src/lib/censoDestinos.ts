// Destinos que uma pergunta do censo pode ter no cadastro da pessoa
// (`preenche_de`). É a lista que o construtor oferece.
//
// ⚠️ ESPELHO de `backend/utils/censoCampoCadastro.js` — quem decide de verdade é
// o backend (ele valida e traduz). Divergir aqui significa oferecer na tela um
// destino que o servidor recusa, ou esconder um que existe (foi o que deixou CEP
// e Escolaridade sem destino por semanas, coletando resposta que ninguém guardava).
// `src/test/censoCampoCadastro.test.ts` trava as duas listas iguais.
export const DESTINO_CADASTRO_LABEL: Record<string, string> = {
  nome: 'Nome completo',
  cpf: 'CPF',
  data_nascimento: 'Data de nascimento',
  telefone: 'Telefone',
  email: 'E-mail',
  endereco: 'Endereço',
  bairro: 'Bairro',
  cidade: 'Cidade',
  cep: 'CEP',
  profissao: 'Profissão',
  estado_civil: 'Estado civil',
  escolaridade: 'Escolaridade',
  genero: 'Sexo',
  frequenta_area: 'Frequenta (AMI/Bridge)',
};

/** Valor do Select quando a pergunta NÃO guarda nada no cadastro. */
export const DESTINO_NENHUM = '__nenhum__';
