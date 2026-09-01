// ════════════════════════════════════════════════════════════════════════════
//  Quem RECEBE o disparo da campanha — régua PURA
//
//  ⚠️⚠️ O canal decide a LEI, não a preferência de quem dispara:
//
//  • E-MAIL — canal PRIMÁRIO da campanha, por decisão da reunião: "o e-mail deve
//    ser priorizado como canal de agradecimento, especialmente em razão das
//    restrições mais rígidas da Meta para disparos em massa via WhatsApp".
//    Medido em 26/08/2026 (`deleted_at IS NULL AND active`): a base viva tem
//    **3.970 pessoas** — não as 8.090 linhas da tabela, porque 4.120 estão
//    soft-deletadas. Dessas, **2.392 com e-mail válido** e 1.434 `membro_ativo`
//    com e-mail. ⚠️ Contar `mem_membros` sem `deleted_at IS NULL` infla o
//    público em 2×, e é o erro que faz uma prévia de disparo mentir.
//
//  • WHATSAPP — pedir dinheiro é **Marketing** na régua da Meta (a categoria
//    Utility já foi rejeitada pra parabéns nesta mesma conta), e Marketing
//    **exige opt-in explícito**. Medido em 26/08/2026: **727 pessoas vivas e
//    ativas com `whatsapp_optin`** (todas com telefone) — mais que os ~200 que a
//    reunião estimava, e ainda assim 18% da base viva. ⚠️ A igreja tem UM
//    número: disparo de marketing sem opt-in
//    queima o número pra TODOS os outros módulos (escala, grupos, Kids, inbox).
//    Por isso a falta de opt-in aqui é `pulado`, nunca "tenta e vê".
//
//  • APP (push) — não é canal de arrecadação: cobrar dinheiro dentro do app
//    esbarra na guideline 3.2.2(iv) da App Store, que é o motivo de a página de
//    doação ser WEB e abrir no navegador EXTERNO (ver `publicGenerosidade.js`).
//    O push da campanha carrega NOTÍCIA e leva pro navegador, nunca um botão de
//    pagar dentro do app.
//
//  ⚠️ A régua é pura e devolve MOTIVO em texto: quem olha a prévia do disparo
//  precisa entender por que 5.400 pessoas ficaram de fora, senão o número parece
//  defeito. "Sem e-mail" e "sem opt-in" são respostas diferentes e levam a ações
//  diferentes (censo × formulário de opt-in).
// ════════════════════════════════════════════════════════════════════════════

const CANAIS = ['email', 'whatsapp', 'app_push'];

/**
 * Segmentos oferecidos. `todos` é a base ATIVA inteira — a campanha do Kids fala
 * com a igreja, não só com quem é membro formal (visitante que frequenta há
 * dois anos doa igual).
 *
 * ⚠️ `doadores_campanha` é o único segmento que depende de dado da própria
 * campanha e por isso é resolvido no serviço, não aqui.
 */
const SEGMENTOS = {
  todos: 'Toda a base ativa',
  membros: 'Somente membros ativos',
  voluntarios: 'Voluntários ativos',
  pais_kids: 'Responsáveis por crianças do Kids',
  doadores_campanha: 'Quem já doou para esta campanha',
};

/** E-mail com cara de e-mail. Espelha `utils/camposContato.js` de propósito. */
function emailUtilizavel(email) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!e || e.length > 254) return false;
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)) return false;
  // Endereço de placeholder que a base acumulou em imports antigos. Disparar
  // pra eles não erra silenciosamente: gera bounce, e bounce em massa é o que
  // derruba a reputação do domínio no Graph.
  if (/@(exemplo|example|teste|test|nao|sem)[.-]/.test(e)) return false;
  return true;
}

/** Celular brasileiro com DDD, digits-only, 10 ou 11 dígitos. */
function telefoneUtilizavel(telefone) {
  const d = String(telefone ?? '').replace(/\D/g, '');
  const sem55 = d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
  return sem55.length === 10 || sem55.length === 11;
}

/**
 * Esta pessoa entra neste disparo?
 *
 * Devolve `{ elegivel, motivo, destino }`. `destino` é o e-mail/telefone que
 * será usado — devolvido junto de propósito, pra quem monta o lote não ter que
 * reimplementar a escolha (e escolher diferente).
 */
function elegivel(pessoa, canal) {
  if (!pessoa) return { elegivel: false, motivo: 'sem cadastro', destino: null };
  if (pessoa.active === false) return { elegivel: false, motivo: 'cadastro inativo', destino: null };
  if (pessoa.deleted_at) return { elegivel: false, motivo: 'cadastro excluído', destino: null };

  // ⚠️ Falecido NUNCA recebe pedido de doação. Medido em 26/08/2026: NÃO existe
  // coluna `falecido` em `mem_membros` e `status` só tem `visitante` (2.213),
  // `membro_ativo` (1.746), `contribuinte_avulso` (8) e `inativo` (3) — ou seja
  // hoje esta guarda não filtra ninguém. Ela fica de propósito, como a porta que
  // já está no lugar no dia em que a membresia ganhar o campo: descobrir isso
  // DEPOIS de um disparo é tarde, e o custo de deixar a linha aqui é zero.
  if (pessoa.falecido === true || pessoa.status === 'falecido') {
    return { elegivel: false, motivo: 'falecido', destino: null };
  }

  // `inativo` é decisão da membresia sobre a pessoa; campanha não reabre isso.
  if (pessoa.status === 'inativo') {
    return { elegivel: false, motivo: 'cadastro marcado como inativo', destino: null };
  }

  if (canal === 'email') {
    if (pessoa.email_optout === true) {
      return { elegivel: false, motivo: 'pediu para não receber e-mail', destino: null };
    }
    if (!emailUtilizavel(pessoa.email)) {
      return { elegivel: false, motivo: 'sem e-mail utilizável', destino: null };
    }
    return { elegivel: true, motivo: null, destino: String(pessoa.email).trim().toLowerCase() };
  }

  if (canal === 'whatsapp') {
    // ⚠️ A ORDEM importa: "sem opt-in" é a resposta mais útil quando as duas
    // faltam, porque telefone se consegue no censo e opt-in só a própria pessoa
    // dá. Trocar a ordem faria a prévia mandar a igreja atrás da coisa errada.
    if (pessoa.whatsapp_optin !== true) {
      return { elegivel: false, motivo: 'sem opt-in de WhatsApp', destino: null };
    }
    if (!telefoneUtilizavel(pessoa.telefone)) {
      return { elegivel: false, motivo: 'sem telefone utilizável', destino: null };
    }
    return { elegivel: true, motivo: null, destino: String(pessoa.telefone).replace(/\D/g, '') };
  }

  if (canal === 'app_push') {
    if (!pessoa.tem_push_token) {
      return { elegivel: false, motivo: 'não tem o app instalado', destino: null };
    }
    return { elegivel: true, motivo: null, destino: String(pessoa.id) };
  }

  return { elegivel: false, motivo: `canal desconhecido: ${canal}`, destino: null };
}

/**
 * Reparte uma lista de pessoas em quem recebe e quem não recebe, com a contagem
 * por motivo — que é o que a prévia do disparo mostra.
 */
function montarPublico(pessoas, canal) {
  const alvo = [];
  const fora = [];
  const motivos = {};
  const vistos = new Set();

  for (const p of Array.isArray(pessoas) ? pessoas : []) {
    const r = elegivel(p, canal);
    if (!r.elegivel) {
      fora.push({ id: p?.id ?? null, motivo: r.motivo });
      motivos[r.motivo] = (motivos[r.motivo] || 0) + 1;
      continue;
    }
    // ⚠️ Dedup pelo DESTINO, não pelo id da pessoa. Família compartilha e-mail e
    // telefone nesta base (é a razão de `mem_contatos` existir): sem esta linha,
    // a casa com 4 cadastros no mesmo e-mail recebe 4 cópias do mesmo pedido de
    // doação — que é exatamente o tipo de disparo que faz gente descadastrar.
    const chave = `${canal}:${r.destino}`;
    if (vistos.has(chave)) {
      fora.push({ id: p.id, motivo: 'destino repetido (mesma casa)' });
      motivos['destino repetido (mesma casa)'] = (motivos['destino repetido (mesma casa)'] || 0) + 1;
      continue;
    }
    vistos.add(chave);
    alvo.push({ id: p.id, nome: p.nome || null, destino: r.destino });
  }

  return {
    canal,
    alvo,
    fora,
    total_base: Array.isArray(pessoas) ? pessoas.length : 0,
    total_alvo: alvo.length,
    total_fora: fora.length,
    motivos,
  };
}

module.exports = {
  CANAIS,
  SEGMENTOS,
  emailUtilizavel,
  telefoneUtilizavel,
  elegivel,
  montarPublico,
};
