// Contrato único de PEDIDOS de cuidado (Caixa de entrada · cui_pedidos).
// Qualquer canal que gere um pedido relacionado a Cuidados chama aqui:
//   - WhatsApp (sistema do Matheus): registrarPedidoCuidado({ canal:'whatsapp', ... })
//   - Plataforma/app (formulários/ações do ERP): canal:'plataforma'
//   - Manual (líder na própria Caixa): canal:'manual' (via POST /cuidados/pedidos)
// O canal 'app' já entra por app_inscricoes (a Caixa lê de lá também) — não
// precisa chamar isto. Mantém a Caixa de entrada como fila única de triagem.
const { supabase } = require('../utils/supabase');
const { notificar } = require('./notificar');

const TIPOS = ['aconselhamento', 'capelania', 'oracao', 'sos', 'visita', 'outro'];
const CANAIS = ['app', 'whatsapp', 'plataforma', 'manual'];

async function registrarPedidoCuidado({
  canal = 'manual', tipo = 'outro', membro_id = null, nome = null,
  telefone = null, email = null, mensagem = null, origem_ref = null, criado_por = null,
} = {}) {
  const payload = {
    canal: CANAIS.includes(canal) ? canal : 'manual',
    tipo: TIPOS.includes(tipo) ? tipo : 'outro',
    membro_id: membro_id || null,
    nome: nome || null,
    telefone: telefone ? String(telefone).replace(/\D/g, '') || null : null,
    email: email ? String(email).trim().toLowerCase() || null : null,
    mensagem: mensagem || null,
    origem_ref: origem_ref || null,
    criado_por: criado_por || null,
  };
  const { data, error } = await supabase.from('cui_pedidos').insert(payload).select().single();
  if (error) throw error;

  notificar({
    modulo: 'cuidados',
    tipo: 'novo_pedido_cuidado',
    titulo: `Novo pedido de cuidado — ${payload.nome || 'pessoa'}`,
    mensagem: `${payload.tipo} via ${payload.canal}${payload.mensagem ? ': ' + String(payload.mensagem).slice(0, 120) : ''}`,
    link: '/ministerial/cuidados?tab=acomp',
    severidade: payload.tipo === 'sos' ? 'alta' : 'info',
    chaveDedup: `cui_pedido_${data.id}`,
  }).catch(() => {});

  return data;
}

module.exports = { registrarPedidoCuidado, TIPOS_PEDIDO_CUIDADO: TIPOS, CANAIS_PEDIDO_CUIDADO: CANAIS };
