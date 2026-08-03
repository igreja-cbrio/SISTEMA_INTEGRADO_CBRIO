// Helper dos botões de WhatsApp dos módulos: em vez de abrir o wa.me externo,
// direciona pro inbox interno (/conversas) já abrindo a conversa da pessoa.
export function hrefConversa(telefone: string | number | null | undefined, texto?: string): string {
  const d = String(telefone ?? '').replace(/\D+/g, '');
  if (!d) return '/conversas';
  const p = new URLSearchParams();
  p.set('telefone', d);
  if (texto) p.set('texto', texto);
  return `/conversas?${p.toString()}`;
}

// Link que abre o WhatsApp DE QUEM CLICA (app do computador/celular, com a conta
// da própria pessoa), em vez do inbox interno da igreja. Use quando o contato é
// pessoal — a Apresentação de Crianças é assim: quem fala com a família é a
// voluntária, pelo WhatsApp dela, não pelo número institucional.
//
// ⚠️ O `55` é CONDICIONAL (só quando o número tem até 11 dígitos = DDD+número),
// mesmo padrão de VolFrequencia/GruposEntrada. Prefixar sempre estragaria número
// que já vem com código de país.
//
// ⚠️ LIMITAÇÃO CONHECIDA, não resolvível aqui: número ESTRANGEIRO de 11 dígitos é
// indistinguível de celular BR. O suíço `41765764538` do lançamento dos grupos
// vira `5541765764538` — e nem uma lista de DDD desambigua, porque `41` é DDD
// legítimo de Curitiba. Suportar internacional de verdade exige guardar o código
// de país separado na entrada (follow-up já registrado no CLAUDE.md, seção do
// contatoPessoa.js). Como as portas públicas validam 10-11 dígitos e removem o
// `55`, o caso BR — que é o de 99% — sai certo.
//
// Devolve null quando não dá pra montar link, e o chamador esconde o botão.
export function hrefWhatsapp(telefone: string | number | null | undefined, texto?: string): string | null {
  const d = String(telefone ?? '').replace(/\D+/g, '');
  if (d.length < 10) return null;
  const num = d.length <= 11 ? `55${d}` : d;
  const q = texto ? `?text=${encodeURIComponent(texto)}` : '';
  return `https://wa.me/${num}${q}`;
}
