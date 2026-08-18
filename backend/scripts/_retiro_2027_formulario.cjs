#!/usr/bin/env node
/**
 * RETIRO 2027 · monta o formulário do PDF do Arthur + a configuração de pagamento
 * ============================================================================
 * Pedido do Marcos (17/08/2026): *"por conta das taxas, decidimos fazer a
 * inscrição do retiro pelo E-Inscrição quando for cartão e no sistema quando for
 * no pix, por conta disso, antes de preencher os dados deve ter uma tela com
 * essas opções para serem selecionadas, o arthur pediu para alterar as perguntas
 * do retiro para ficar assim: [PDF]"*
 *
 * O que este script faz (e SÓ isto):
 *   1. restaura o evento "Retiro AMI 2027" (soft-deletado em 31/07) **como
 *      RASCUNHO** — ver o ⚠️ abaixo;
 *   2. grava as perguntas do PDF em `insc_eventos.campos`;
 *   3. liga `exigir_endereco` e `exige_dados_menor` e grava os 2 aceites;
 *   4. deixa `pagamento_metodos = ['pix']` (o cartão passa a ser do E-Inscrição);
 *   5. encerra o "RETIRO TESTE" (a pedido do Marcos: *"se nao for mais útil,
 *      retire ele"*).
 *
 * ⚠️⚠️ RESTAURA COMO **RASCUNHO**, não como `publicado`. O evento estava
 * `publicado` quando foi apagado, e restaurar assim colocaria
 * `/evento/retiro-ami-2027` NO AR na hora — cobrando R$ 900 com dois aceites cujo
 * TEXTO REAL ainda não existe (o regulamento e o termo de menor são documentos do
 * Arthur) e sem o link do E-Inscrição, que o Marcos ainda não tem. Publicar é UM
 * CLIQUE na aba Eventos, depois de conferir; abrir a porta por efeito colateral
 * de um script não é.
 *
 * ⚠️ Os textos dos 2 aceites entram como PLACEHOLDER explícito, dizendo na
 * própria frase que falta o documento. NÃO inventei termo jurídico: quem aceita
 * um texto tem esse texto gravado como prova, e prova fabricada é pior que
 * ausência de prova. A tela do evento é onde o Arthur cola o texto final.
 *
 * Uso:
 *   node backend/scripts/_retiro_2027_formulario.cjs            (dry-run)
 *   node backend/scripts/_retiro_2027_formulario.cjs --exec
 *
 * ⚠️ Rodar de um checkout que tenha `backend/.env` e `backend/node_modules`
 * (o principal). A worktree não tem — ver a lição de 31/07 (MODULE_NOT_FOUND).
 */

const fs = require('fs');
const path = require('path');

const EXEC = process.argv.includes('--exec');
const ID_RETIRO = 'f16e5e78-a513-421e-b229-d60c5460e5db';
const ID_TESTE = '97f453be-6386-4fd1-84a0-8af2a4f0c03f';

// ── conexão (mesmo arranjo dos outros scripts: .env do backend do checkout) ──
function resolverBackend() {
  const candidatos = [
    path.resolve(__dirname, '..'),
    'C:/Users/MarcosPauloAlmeida/SISTEMA_INTEGRADO_CBRIO/backend',
  ];
  for (const base of candidatos) {
    if (fs.existsSync(path.join(base, '.env')) && fs.existsSync(path.join(base, 'node_modules/@supabase/supabase-js'))) return base;
  }
  throw new Error('Não achei um backend com .env + node_modules. Rode do checkout principal.');
}
const BASE = resolverBackend();
const env = {};
for (const linha of fs.readFileSync(path.join(BASE, '.env'), 'utf8').split(/\r?\n/)) {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const { createClient } = require(path.join(BASE, 'node_modules/@supabase/supabase-js'));
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── as perguntas do PDF ─────────────────────────────────────────────────────
// ⚠️ NÃO estão aqui, e é de propósito: nome completo, CPF, sexo, e-mail, data de
// nascimento, telefone e endereço são CAMPOS PADRÃO travados do Contrato de
// Inscrição — já aparecem em todo formulário. Repeti-los como pergunta extra
// gravaria o mesmo dado em dois lugares.
//   · "Endereço completo" → `exigir_endereco: true`
//   · o bloco "caso for menor de idade" (nome/CPF/parentesco/celular/e-mail do
//     responsável + autorização de batismo) → `exige_dados_menor: true`
//
// ⚠️ As `key` são OPACAS e ESTÁVEIS. Nunca derivar do rótulo: editar o texto de
// uma pergunta orfanaria as respostas já gravadas (incidente do Celebra ·
// utils/campoKey.js). Estas são fixas no script pra rodar de novo ser idempotente.
const K = {
  emergencia1: 'c_retiro_emerg1',
  emergencia2: 'c_retiro_emerg2',
  aceitouJesus: 'c_retiro_jesus',
  batizado: 'c_retiro_batizado',
  membro: 'c_retiro_membro',
  igreja: 'c_retiro_igreja',
  conhece: 'c_retiro_conhece',
  restricao: 'c_retiro_restricao',
  medControlado: 'c_retiro_med_controlado',
  alergia: 'c_retiro_alergia',
  qualMed: 'c_retiro_qual_med',
};

const CAMPOS = [
  // "Informe 2 contatos (nome + telefone), para casos de emergência"
  // ⚠️ DOIS campos, não um textarea: são dois contatos, e a equipe precisa
  // conseguir ler o segundo quando o primeiro não atende.
  { key: K.emergencia1, label: 'Contato de emergência 1 (nome e telefone)', tipo: 'texto', obrigatorio: true, opcoes: [] },
  { key: K.emergencia2, label: 'Contato de emergência 2 (nome e telefone)', tipo: 'texto', obrigatorio: true, opcoes: [] },

  { key: K.aceitouJesus, label: 'Já aceitou Jesus como seu salvador?', tipo: 'escolha', obrigatorio: true, opcoes: ['Sim', 'Não'] },
  { key: K.batizado, label: 'Já é batizado?', tipo: 'escolha', obrigatorio: true, opcoes: ['Sim', 'Não'] },
  { key: K.membro, label: 'É membro do Ami/CBRio?', tipo: 'escolha', obrigatorio: true, opcoes: ['Sim', 'Não'] },

  // "Caso não seja membro Ami/CBRio, qual a sua igreja?" — condicional de verdade.
  {
    key: K.igreja, label: 'Qual a sua igreja?', tipo: 'texto', obrigatorio: true, opcoes: [],
    mostrar_se: { key: K.membro, valores: ['Não'] },
  },
  // "Caso seja visitante, conhece alguém que vai ao Ami Camp 2027?"
  // ⚠️ NÃO obrigatório: pode não conhecer ninguém, e exigir empurraria a pessoa
  // a escrever qualquer nome pra o formulário deixar enviar.
  {
    key: K.conhece, label: 'Conhece alguém que vai ao Ami Camp 2027? Qual o nome e sobrenome?',
    tipo: 'texto', obrigatorio: false, opcoes: [],
    mostrar_se: { key: K.membro, valores: ['Não'] },
  },

  // ⚠️ Saúde: NÃO obrigatórios, porque "em branco" é a resposta da maioria
  // ("não tenho restrição"). Obrigar faria centenas de pessoas digitarem "não",
  // e aí a equipe teria que ler 200 linhas pra achar as 5 que importam.
  { key: K.restricao, label: 'Possui alguma restrição alimentar ou motora? Qual/Quais?', tipo: 'textarea', obrigatorio: false, opcoes: [] },
  { key: K.medControlado, label: 'Faz uso de algum medicamento controlado? Qual/Quais?', tipo: 'textarea', obrigatorio: false, opcoes: [] },

  { key: K.alergia, label: 'Possui alergia medicamentosa?', tipo: 'escolha', obrigatorio: true, opcoes: ['Sim', 'Não'] },
  {
    key: K.qualMed, label: 'Qual medicamento?', tipo: 'texto', obrigatorio: true, opcoes: [],
    mostrar_se: { key: K.alergia, valores: ['Sim'] },
  },
];

// ── os 2 aceites do PDF ─────────────────────────────────────────────────────
// ⚠️ `so_menor` no primeiro: exigir de um adulto que ele aceite um "Termo de
// Responsabilidade — Menor de idade" sobre si mesmo seria pedir que ele declare
// algo falso.
const TERMOS = [
  {
    chave: 'termo_menor',
    titulo: 'Termos de Responsabilidade — Menor de idade',
    so_menor: true,
    texto:
      'PENDENTE: cole aqui o texto do Termo de Responsabilidade do menor de idade '
      + '(documento do Arthur). Enquanto este texto não for o definitivo, NÃO publique '
      + 'o evento — quem marcar a caixa terá exatamente este texto gravado como prova '
      + 'do que aceitou.',
  },
  {
    chave: 'info_retiro',
    titulo: 'Informações Sobre o Retiro',
    texto:
      'PENDENTE: cole aqui as Informações Sobre o Retiro (o que está incluso, '
      + 'horários, o que levar, regras de convivência, política de cancelamento). '
      + 'Enquanto este texto não for o definitivo, NÃO publique o evento.',
  },
];

const PATCH_EVENTO = {
  campos: CAMPOS,
  exigir_endereco: true,
  exige_dados_menor: true,
  termos_extra: TERMOS,
  // ⚠️ SÓ Pix por aqui — é a decisão do Marcos ("no sistema quando for no pix").
  // O cartão vai pro E-Inscrição, e com o link preenchido o próprio
  // `utils/checkoutExterno` remove 'cartao' de `metodos_ofertados` da cobrança.
  // Boleto saiu porque ninguém pediu: forma ofertada que a equipe não acompanha
  // é vaga presa esperando um pagamento que ninguém confere.
  pagamento_metodos: ['pix'],
  // `null` significava "o provedor decide", que no Mercado Pago é 36x. À vista.
  parcelas_max: 1,
  // ⚠️ RASCUNHO — ver o ⚠️⚠️ do cabeçalho.
  status: 'rascunho',
};

async function main() {
  console.log(`\n=== RETIRO 2027 · formulário do PDF ${EXEC ? '(--exec · VAI ESCREVER)' : '(dry-run)'} ===\n`);

  const { data: alvo, error: eAlvo } = await db.from('insc_eventos')
    .select('id, nome, slug, status, data, valor_centavos, pagamento_metodos, campos, deleted_at, checkout_externo_url')
    .eq('id', ID_RETIRO).maybeSingle();
  if (eAlvo) throw eAlvo;
  if (!alvo) throw new Error(`Evento ${ID_RETIRO} não existe. ABORTANDO — conferir antes.`);

  console.log(`Alvo: "${alvo.nome}" (${alvo.slug})`);
  console.log(`  status atual .......... ${alvo.status}${alvo.deleted_at ? ' · APAGADO ' + alvo.deleted_at : ' · vivo'}`);
  console.log(`  valor ................. R$ ${(alvo.valor_centavos || 0) / 100}`);
  console.log(`  perguntas hoje ........ ${(alvo.campos || []).length}`);
  console.log(`  métodos hoje .......... ${JSON.stringify(alvo.pagamento_metodos)}`);
  console.log(`  link do E-Inscrição ... ${alvo.checkout_externo_url || '(vazio — o Marcos ainda não tem)'}`);

  const { count: vivas } = await db.from('inscricoes')
    .select('id', { count: 'exact', head: true }).eq('evento_id', ID_RETIRO).is('deleted_at', null);
  console.log(`  inscrições vivas ...... ${vivas}`);

  console.log('\nVai gravar:');
  console.log(`  ${CAMPOS.length} perguntas (${CAMPOS.filter(c => c.mostrar_se).length} condicionais)`);
  for (const c of CAMPOS) {
    const cond = c.mostrar_se ? `  ⤷ só se [${c.mostrar_se.key}] = ${c.mostrar_se.valores.join('/')}` : '';
    console.log(`   · ${c.obrigatorio ? '*' : ' '} ${c.label}${cond}`);
  }
  console.log(`  endereço obrigatório .. sim`);
  console.log(`  bloco de menor ........ sim (6 campos do responsável + consentimento LGPD art. 14)`);
  console.log(`  aceites ............... ${TERMOS.map(t => t.titulo + (t.so_menor ? ' [só menor]' : '')).join(' · ')}`);
  console.log(`  métodos ............... ${JSON.stringify(PATCH_EVENTO.pagamento_metodos)} (cartão sai daqui)`);
  console.log(`  status ................ rascunho (publicar é 1 clique, DEPOIS de colar os textos)`);

  // ── RETIRO TESTE ──────────────────────────────────────────────────────────
  const { data: teste } = await db.from('insc_eventos')
    .select('id, nome, slug, status, deleted_at').eq('id', ID_TESTE).maybeSingle();
  const { count: testeInsc } = await db.from('inscricoes')
    .select('id', { count: 'exact', head: true }).eq('evento_id', ID_TESTE).is('deleted_at', null);
  if (teste) {
    console.log(`\n"${teste.nome}" (${teste.slug}) · ${teste.status} · ${testeInsc} inscrições vivas`);
    console.log(`  → soft-delete (a pedido do Marcos). ⚠️ As ${testeInsc} inscrições NÃO são apagadas`);
    console.log('    (são de teste, mas apagar linha de pessoa é decisão caso a caso — lei do projeto).');
  }

  if (!EXEC) {
    console.log('\nDRY-RUN — nada foi escrito. Rode com --exec pra aplicar.\n');
    return;
  }

  // ── backup ANTES de qualquer escrita ──────────────────────────────────────
  const backup = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads',
    `backup_retiro_2027_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`);
  fs.writeFileSync(backup, JSON.stringify({ retiro: alvo, teste }, null, 2), 'utf8');
  console.log(`\nBackup do estado anterior: ${backup}`);

  // 1 · restaurar (o `app_restore` é o caminho canônico do soft-delete)
  if (alvo.deleted_at) {
    const { data: r, error: eR } = await db.rpc('app_restore', { p_table_name: 'insc_eventos', p_row_id: ID_RETIRO });
    if (eR) throw new Error(`app_restore falhou: ${eR.message}`);
    console.log(`  ✓ restaurado (app_restore → ${JSON.stringify(r)})`);
  } else {
    console.log('  · já estava vivo, nada a restaurar');
  }

  // 2 · o formulário + a configuração
  const { error: eUp } = await db.from('insc_eventos').update(PATCH_EVENTO).eq('id', ID_RETIRO);
  if (eUp) throw new Error(`update do evento falhou: ${eUp.message}`);
  console.log('  ✓ perguntas, endereço, bloco de menor, aceites e métodos gravados');

  // 3 · encerrar o teste
  if (teste && !teste.deleted_at) {
    const { data: d, error: eD } = await db.rpc('app_soft_delete', {
      p_table_name: 'insc_eventos', p_row_id: ID_TESTE, p_deleted_by: null,
    });
    if (eD) console.error(`  ⚠️ soft-delete do RETIRO TESTE falhou: ${eD.message} (siga pela tela)`);
    else console.log(`  ✓ "RETIRO TESTE" removido (app_soft_delete → ${JSON.stringify(d)})`);
  }

  // ── conferência: relê do banco, nunca confia no "sem erro" ────────────────
  const { data: depois } = await db.from('insc_eventos')
    .select('nome, slug, status, deleted_at, campos, exigir_endereco, exige_dados_menor, termos_extra, pagamento_metodos, parcelas_max')
    .eq('id', ID_RETIRO).maybeSingle();
  console.log('\n=== ESTADO FINAL (lido do banco) ===');
  console.log(`  ${depois.nome} · ${depois.slug} · ${depois.status} · ${depois.deleted_at ? 'APAGADO' : 'vivo'}`);
  console.log(`  perguntas: ${(depois.campos || []).length} · condicionais: ${(depois.campos || []).filter(c => c.mostrar_se).length}`);
  console.log(`  exigir_endereco=${depois.exigir_endereco} · exige_dados_menor=${depois.exige_dados_menor}`);
  console.log(`  aceites: ${(depois.termos_extra || []).length} · métodos: ${JSON.stringify(depois.pagamento_metodos)} · parcelas_max=${depois.parcelas_max}`);
  console.log('\n⚠️ PENDENTE DE GENTE, antes de publicar:');
  console.log('   1. colar o texto REAL dos 2 aceites (hoje estão marcados PENDENTE);');
  console.log('   2. colar o link do E-Inscrição em Pagamento → "Cartão em plataforma externa";');
  console.log('   3. conferir data, valor e prazo de inscrição;');
  console.log('   4. Publicar.\n');
}

main().catch((e) => { console.error('\nFALHOU:', e.message); process.exit(1); });
