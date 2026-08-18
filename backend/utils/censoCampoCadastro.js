// ============================================================================
// utils/censoCampoCadastro · o que o censo pode guardar no cadastro, e COMO
//
// ⚠️⚠️ O BUG QUE ISTO FECHA (medido em produção · 2026-08-17):
//
// A pergunta "Estado civil" do censo tem `preenche_de: 'estado_civil'` e as
// opções "Solteiro(a) / Casado(a) / União estável / ...". A coluna
// `mem_membros.estado_civil` tem CHECK vivo:
//
//     estado_civil IN ('solteiro','casado','divorciado','viuvo','uniao_estavel')
//
// Então o UPDATE do censo era RECUSADO com 23514. Provado no banco:
//   update mem_membros set estado_civil='Solteiro(a)', bairro='...'  →  23514
//
// E o `reconciliarCenso` grava TUDO NUM UPDATE SÓ: o estado civil inválido
// levava embora bairro, cidade, telefone, nascimento — todos os campos bons do
// mesmo passe. As 12 respostas do Censo 2026 responderam estado civil, logo
// NENHUMA delas conseguiria aplicar nada no cadastro.
//
// ⚠️ Régua que fica: rótulo de opção é TEXTO PARA HUMANO LER; coluna com CHECK
// guarda VOCABULÁRIO. Quem traduz um no outro é este arquivo — não o construtor
// (o Matheus renomeia opção quando quiser) e não a coluna (mudar o CHECK pra
// aceitar "Casado(a)" criaria DOIS valores para "casado" e quebraria todo filtro
// e toda agregação que já existe sobre os 147 cadastros preenchidos).
//
// ⚠️ Valor que não traduz NÃO É GRAVADO CRU. Ele volta como `nao_reconhecido`,
// é declarado no resultado e a resposta continua inteira em `cen_resposta`. É a
// política da casa: melhor campo vazio e declarado do que vocabulário sujo — e
// dado sujo aqui é irreversível na prática (ninguém sabe depois o que era rótulo
// de formulário e o que a equipe digitou à mão).
//
// Este arquivo é PURO (sem banco, sem rede, sem relógio) e mora em `utils/` de
// propósito: é assim que ele entra no gate de deploy.
// ============================================================================

// ── Normalização só PRA COMPARAR ────────────────────────────────────────────
// Tira acento, caixa, pontuação e o "(a)" de gênero dos rótulos. Nunca é o
// valor gravado — o gravado é sempre o canônico do mapa.
function chave(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(a\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Slug estável para campo SEM CHECK. Determinístico: mesma opção, mesmo valor.
function slug(v) {
  return chave(v).replace(/\s+/g, '_').slice(0, 40);
}

// ── Vocabulários canônicos ──────────────────────────────────────────────────
//
// ⚠️ `estado_civil`, `genero` e `frequenta_area` são FECHADOS porque a coluna
// tem CHECK no banco (conferido no catálogo em 17/08). Acrescentar valor aqui
// sem acrescentar no CHECK reintroduz exatamente o 23514 que este arquivo
// existe pra impedir.
const ESTADO_CIVIL = {
  solteiro: 'solteiro',
  casado: 'casado',
  casada: 'casado',
  divorciado: 'divorciado',
  separado: 'divorciado',
  'separado judicialmente': 'divorciado',
  desquitado: 'divorciado',
  viuvo: 'viuvo',
  'uniao estavel': 'uniao_estavel',
  amasiado: 'uniao_estavel',
  'mora junto': 'uniao_estavel',
};

const GENERO = {
  masculino: 'masculino', m: 'masculino', homem: 'masculino',
  feminino: 'feminino', f: 'feminino', mulher: 'feminino',
  // ⚠️ 'outro' passa no CHECK do banco mas o Contrato de Inscrição proíbe
  // oferecê-lo em porta de pessoa. Não está aqui de propósito: se aparecer,
  // volta como não reconhecido e ninguém grava sexo errado.
};

const FREQUENTA_AREA = { ami: 'ami', bridge: 'bridge' };

// ⚠️ `escolaridade` é coluna NOVA e ficou SEM CHECK de propósito (migration
// 20260817120000): opção nova no construtor não pode derrubar o UPDATE de
// ninguém. O mapa cobre o que se escreve na prática e o fallback é o slug —
// assim "Mestrado" entra como `mestrado` em vez de se perder.
const ESCOLARIDADE = {
  'ensino fundamental': 'fundamental',
  fundamental: 'fundamental',
  'fundamental incompleto': 'fundamental',
  'ensino medio': 'medio',
  medio: 'medio',
  'segundo grau': 'medio',
  tecnico: 'tecnico',
  'ensino tecnico': 'tecnico',
  superior: 'superior',
  'ensino superior': 'superior',
  graduacao: 'superior',
  faculdade: 'superior',
  'superior incompleto': 'superior_incompleto',
  'pos graduacao': 'pos_graduacao',
  pos: 'pos_graduacao',
  especializacao: 'pos_graduacao',
  mba: 'pos_graduacao',
  mestrado: 'mestrado',
  doutorado: 'doutorado',
};

// ── Catálogo de destinos ────────────────────────────────────────────────────
//
// É a lista que a UI do construtor oferece e a que o reconciliador respeita.
// `vocabulario` fechado → só o mapa vale. `slugLivre` → mapa com fallback.
// `texto` → o que a pessoa digitou (trim), porque a coluna é livre.
//
// ⚠️ Campo NOVO só entra aqui depois de conferir no CATÁLOGO do banco se a
// coluna tem CHECK. Sem isso o UPDATE volta a morrer com 23514.
const CAMPOS_CADASTRO = {
  nome: { label: 'Nome completo', modo: 'texto' },
  cpf: { label: 'CPF', modo: 'texto' },
  data_nascimento: { label: 'Data de nascimento', modo: 'texto' },
  telefone: { label: 'Telefone', modo: 'texto' },
  email: { label: 'E-mail', modo: 'texto' },
  endereco: { label: 'Endereço', modo: 'texto' },
  bairro: { label: 'Bairro', modo: 'texto' },
  cidade: { label: 'Cidade', modo: 'texto' },
  cep: { label: 'CEP', modo: 'cep' },
  profissao: { label: 'Profissão', modo: 'texto' },
  estado_civil: { label: 'Estado civil', modo: 'vocabulario', mapa: ESTADO_CIVIL },
  escolaridade: { label: 'Escolaridade', modo: 'slugLivre', mapa: ESCOLARIDADE },
  genero: { label: 'Sexo', modo: 'vocabulario', mapa: GENERO },
  frequenta_area: { label: 'Frequenta (AMI/Bridge)', modo: 'vocabulario', mapa: FREQUENTA_AREA },
};

function ehCampoDeCadastro(campo) {
  return Object.prototype.hasOwnProperty.call(CAMPOS_CADASTRO, campo);
}

// ── traduzirParaCadastro ────────────────────────────────────────────────────
// Devolve { ok: true, valor } ou { ok: false, motivo }.
//   motivo ∈ 'campo_desconhecido' | 'vazio' | 'nao_reconhecido' | 'cep_invalido'
//
// ⚠️ Multipla escolha (array) NÃO é traduzida: nenhuma coluna de cadastro
// guarda lista, e juntar com vírgula gravaria "casado, solteiro". Volta como
// não reconhecido — o dado continua no censo, onde o gráfico o lê.
function traduzirParaCadastro(campo, valorBruto) {
  if (!ehCampoDeCadastro(campo)) return { ok: false, motivo: 'campo_desconhecido' };
  if (Array.isArray(valorBruto)) return { ok: false, motivo: 'nao_reconhecido' };
  if (valorBruto === null || valorBruto === undefined) return { ok: false, motivo: 'vazio' };

  const bruto = String(valorBruto).trim();
  if (!bruto) return { ok: false, motivo: 'vazio' };

  const def = CAMPOS_CADASTRO[campo];

  if (def.modo === 'cep') {
    const d = bruto.replace(/\D+/g, '');
    // CEP com menos de 8 dígitos não é CEP incompleto — é lixo digitado, e
    // gravá-lo faria o autopreenchimento de endereço falhar para sempre.
    return d.length === 8 ? { ok: true, valor: d } : { ok: false, motivo: 'cep_invalido' };
  }

  if (def.modo === 'vocabulario' || def.modo === 'slugLivre') {
    const k = chave(bruto);
    if (!k) return { ok: false, motivo: 'vazio' };
    const canonico = def.mapa[k];
    if (canonico) return { ok: true, valor: canonico };
    if (def.modo === 'slugLivre') {
      const s = slug(bruto);
      return s ? { ok: true, valor: s } : { ok: false, motivo: 'nao_reconhecido' };
    }
    return { ok: false, motivo: 'nao_reconhecido' };
  }

  return { ok: true, valor: bruto };
}

// Destinos oferecidos na UI do construtor (ordem de exibição).
function destinosParaUI() {
  return Object.entries(CAMPOS_CADASTRO).map(([campo, def]) => ({ campo, label: def.label }));
}

module.exports = {
  CAMPOS_CADASTRO,
  ehCampoDeCadastro,
  traduzirParaCadastro,
  destinosParaUI,
  // exportados pro teste
  chave,
  slug,
};
