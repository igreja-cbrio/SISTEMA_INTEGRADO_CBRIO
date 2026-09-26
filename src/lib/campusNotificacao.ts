export function notificacaoDoCampus(notificacao: {igreja_id?: string | null; escopo_campus?: string} | null, campusId: string | null) {
  return !!notificacao && !!campusId && (notificacao.escopo_campus === 'central' || notificacao.igreja_id === campusId);
}
