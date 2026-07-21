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
