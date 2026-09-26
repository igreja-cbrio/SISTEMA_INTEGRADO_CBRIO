import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {beginCampusSession} from '../lib/campusSession';
vi.mock('bwip-js/browser',()=>({default:{toSVG:()=>'<svg />'}}));
const api=vi.hoisted(()=>({aniversario:vi.fn(),log:vi.fn()}));
vi.mock('@/api',()=>({totemKids:{criancas:{aniversarioImpressoes:api.aniversario},etiquetas:{log:api.log}}}));
import {imprimirEtiquetas} from '../pages/ministerial/totemKids/lib/imprimir';
const dados:any={crianca:{nome:'Criança sintética',salaNome:'Sala',idadeLabel:'5 anos',aniversarioSemana:true},responsavel:{nome:'Responsável'},codigoBarras:'ABCD',codigoSeguranca:'ABCD',criancaId:'child',checkinId:'10000000-0000-0000-0000-000000000001'};
beforeEach(()=>{beginCampusSession('user','A',true);api.log.mockResolvedValue({});});
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();});
it('troca durante preparação não abre preview com a etiqueta do campus anterior',async()=>{
 let resolver!:(v:unknown)=>void;api.aniversario.mockReturnValue(new Promise(ok=>{resolver=ok;}));const popup=vi.spyOn(window,'open').mockReturnValue(null);
 const pending=imprimirEtiquetas(dados,true);await vi.waitFor(()=>expect(api.aniversario).toHaveBeenCalledOnce());
 beginCampusSession('user','B',true);resolver({imprimir:true});await expect(pending).rejects.toThrow('campus');expect(popup).not.toHaveBeenCalled();expect(api.log).not.toHaveBeenCalled();
});
