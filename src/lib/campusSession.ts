// Contexto de transporte por aba. Apenas o servidor autoriza o campus solicitado.
let generation = 0;
let campusId: string | null = null;
let ownerId: string | null = null;
let ready = false;
const controllers = new Set<AbortController>();

export function beginCampusSession(owner: string | null, campus: string | null, available = false) {
  generation += 1;
  ownerId = owner;
  campusId = campus;
  ready = available;
  for (const controller of controllers) controller.abort();
  controllers.clear();
  return generation;
}

export function getCampusGeneration() { return generation; }
export function getCampusHeader(): Record<string, string> {
  return ready && campusId ? { 'X-Campus-Id': campusId } : {};
}
export function isCampusSessionReady() { return ready; }
export function getCampusOwner() { return ownerId; }

export function createCampusRequest() {
  const started = generation;
  const controller = new AbortController();
  controllers.add(controller);
  return {
    generation: started,
    signal: controller.signal,
    assertCurrent() {
      if (started !== generation || controller.signal.aborted) {
        throw Object.assign(new Error('O campus mudou. Carregue os dados novamente.'), { code: 'CAMPUS_CONTEXT_CHANGED' });
      }
    },
    release() { controllers.delete(controller); },
  };
}
