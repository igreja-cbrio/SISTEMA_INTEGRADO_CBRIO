import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
const mocks=vi.hoisted(()=>({campi:vi.fn(),horarios:vi.fn(),textos:vi.fn(),inscrever:vi.fn()}));
vi.mock('../api',()=>({batismoPublico:mocks}));
vi.mock('../pages/public/AnimatedBackground',()=>({default:()=>null}));
vi.mock('../pages/public/publicTheme',()=>({usePublicTheme:()=>({C:{}}),PublicThemeToggle:()=>null}));
vi.mock('../components/ui/birth-date-picker',()=>({BirthDatePicker:()=>null}));
import InscricaoBatismo from '../pages/public/InscricaoBatismo';
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const slot=(id:string)=>({datas:[{evento_id:id,data_batismo:'2099-09-20',horarios:[{horario_id:id,horario:'10:00',label:`Horário ${id===A?'A':'B'}`,vagas_restantes:2}]}]});
beforeEach(()=>{window.history.replaceState({},'','/batismo');mocks.campi.mockResolvedValue({estado:'ativo',campus_legado_id:A,campi:[{id:A,nome:'Sede',slug:'sede'},{id:B,nome:'Nova',slug:'nova'}]});mocks.textos.mockResolvedValue({});});
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('seletor público de campus do batismo',()=>{
 it('exige escolha fora de preparação e não envia formulário sem catálogo validado',async()=>{
  render(<InscricaoBatismo/>);await screen.findByRole('option',{name:'Nova'});
  expect(mocks.horarios).not.toHaveBeenCalled();
  fireEvent.submit(document.querySelector('form')!);
  expect(await screen.findByText('Escolha o campus, a data e um horário disponível.')).toBeTruthy();
  expect(mocks.inscrever).not.toHaveBeenCalled();
 });
 it('descarta catálogo atrasado da unidade anterior',async()=>{
  let finishA:(v:any)=>void=()=>{};mocks.horarios.mockImplementation((id:string)=>id===A?new Promise(resolve=>{finishA=resolve;}):Promise.resolve(slot(B)));
  render(<InscricaoBatismo/>);await screen.findByRole('option',{name:'Nova'});
  const select=screen.getByLabelText(/Campus do batismo/);
  fireEvent.change(select,{target:{value:A}});await waitFor(()=>expect(mocks.horarios).toHaveBeenCalledWith(A));
  fireEvent.change(select,{target:{value:B}});await screen.findByText('Horário B');
  await act(async()=>{finishA(slot(A));});
  expect(screen.queryByText('Horário A')).toBeNull();expect(screen.getByText('Horário B')).toBeTruthy();
 });
});
