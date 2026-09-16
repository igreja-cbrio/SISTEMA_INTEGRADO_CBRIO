// ============================================================================
// COMPLETAR CADASTRO NO CHECK-IN                              (16/09/2026)
//
// Pedido do Marcos: *"quando um voluntário apertar em fazer o check-in e tiver
// algum campo de inscrição padrão não preenchido, criar um modal apenas com os
// campos que não temos dele. Deixe sempre a opção de não preencher, caso a
// pessoa esteja com pressa, mas na próxima vez vai aparecer novamente."*
//
// Era o ContactCaptureDialog (só CPF/telefone/e-mail, sempre os 3, sempre que
// faltava CPF). Medido em 16/09 nos 516 voluntários com check-in no semestre:
// 220 (42,6%) com pelo menos 1 dos 6 campos base faltando, e os dois maiores
// buracos eram SEXO (207) e NASCIMENTO (158) — que o diálogo antigo nem pedia.
//
// ⚠️ QUEM DECIDE O QUE FALTA É O SERVIDOR (`missing_fields` na resposta do
// check-in). A tela não recalcula: "falta" é a união de `vol_profiles` com o
// `mem_membros` vinculado, e o cliente não vê a membresia. Duplicar a régua aqui
// faria o modal pedir de novo, a cada culto, telefone que a igreja já tem.
//
// ⚠️ PULAR NÃO GRAVA NADA — é o que faz o modal voltar no próximo check-in, sem
// precisar de "dispensado até quando" no banco. A fila do culto tem que andar.
//
// ⚠️ Máscaras e validação vêm de `@/lib/inscricao` (o espelho client do Contrato
// de Inscrição). Não recriar cópia local: era assim que a máscara de telefone
// divergia e comia 2 dígitos de quem colava "+55 21 ...".
// ============================================================================

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BirthDatePicker } from '@/components/ui/birth-date-picker';
import { voluntariado } from '@/api';
import { toast } from 'sonner';
import {
  SEXOS, mascaraCpf, mascaraTelefone, soDigitos, tirarCodigoPais, cpfValido,
  telefoneValido, nomeCompletoValido, validarNascimento,
} from '@/lib/inscricao';

export type CampoBase = 'nome' | 'telefone' | 'cpf' | 'data_nascimento' | 'email' | 'sexo';

const ROTULO: Record<CampoBase, string> = {
  nome: 'Nome completo',
  telefone: 'Telefone (WhatsApp)',
  cpf: 'CPF',
  data_nascimento: 'Data de nascimento',
  email: 'E-mail',
  sexo: 'Sexo',
};

// Ordem do Contrato de Inscrição — a mesma do servidor, pra tela e log falarem
// do mesmo formulário.
const ORDEM: CampoBase[] = ['nome', 'telefone', 'cpf', 'data_nascimento', 'email', 'sexo'];

interface Props {
  volunteerId: string;
  volunteerName: string;
  /** o que o servidor disse que falta (`missing_fields` do check-in) */
  missingFields: CampoBase[];
  onDone: () => void;
}

export default function CompletarCadastroDialog({ volunteerId, volunteerName, missingFields, onDone }: Props) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [email, setEmail] = useState('');
  const [sexo, setSexo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const campos = ORDEM.filter((c) => missingFields.includes(c));
  if (!campos.length) return null;

  const salvar = async () => {
    // Valida SÓ o que foi preenchido: quem responde 2 de 4 grava os 2, e o
    // resto volta a ser perguntado no próximo check-in.
    const payload: Record<string, string> = {};

    if (campos.includes('nome') && nome.trim()) {
      if (!nomeCompletoValido(nome)) return toast.error('Escreva o nome completo, sem abreviações');
      payload.full_name = nome.trim();
    }
    if (campos.includes('telefone') && soDigitos(telefone)) {
      if (!telefoneValido(telefone)) return toast.error('Telefone inválido — DDD + número');
      // ⚠️ `tirarCodigoPais` de novo aqui, mesmo com a máscara já aplicada:
      // colar "+55 21 99999-8888" com autofill pode escapar do onChange, e o
      // que o servidor recebe é o que persiste. Lei de 31/07 — ver
      // src/test/mascaraTelefone55.test.ts.
      payload.phone = tirarCodigoPais(soDigitos(telefone));
    }
    if (campos.includes('cpf') && soDigitos(cpf)) {
      if (!cpfValido(cpf)) return toast.error('CPF inválido — confira os dígitos');
      payload.cpf = soDigitos(cpf);
    }
    if (campos.includes('data_nascimento') && nascimento) {
      if (!validarNascimento(nascimento)) return toast.error('Data de nascimento inválida');
      payload.birth_date = nascimento;
    }
    if (campos.includes('email') && email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error('E-mail inválido');
      payload.email = email.trim().toLowerCase();
    }
    if (campos.includes('sexo') && sexo) payload.gender = sexo;

    // Abriu, não digitou nada e apertou Salvar = pulou. Mesmo efeito do "Agora
    // não": nada gravado, pergunta de novo no próximo check-in.
    if (!Object.keys(payload).length) { onDone(); return; }

    setSalvando(true);
    try {
      const r: any = await voluntariado.updateProfileContact(volunteerId, payload);
      const faltaAinda: string[] = r?.missing_fields || [];
      const gravou = campos.filter((c) => !faltaAinda.includes(c)).length;
      toast.success(gravou
        ? `Cadastro atualizado (${gravou} ${gravou === 1 ? 'campo' : 'campos'})`
        : 'Cadastro atualizado');
      onDone();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar');
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onDone(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Completar cadastro</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-1">
          Faltam {campos.length === 1 ? 'estes dados' : `${campos.length} dados`} de{' '}
          <span className="font-medium text-foreground">{volunteerName}</span>.
          Aproveite o check-in pra completar — é opcional.
        </p>

        <div className="space-y-3 py-1 max-h-[55vh] overflow-y-auto">
          {campos.includes('nome') && (
            <div>
              <Label htmlFor="cc-nome">{ROTULO.nome}</Label>
              <Input id="cc-nome" autoFocus placeholder="Nome e sobrenome"
                value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
          )}

          {campos.includes('telefone') && (
            <div>
              <Label htmlFor="cc-telefone">{ROTULO.telefone}</Label>
              <Input id="cc-telefone" inputMode="tel" placeholder="(00) 00000-0000"
                autoFocus={campos[0] === 'telefone'}
                value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} />
            </div>
          )}

          {campos.includes('cpf') && (
            <div>
              <Label htmlFor="cc-cpf">{ROTULO.cpf}</Label>
              <Input id="cc-cpf" inputMode="numeric" placeholder="000.000.000-00"
                autoFocus={campos[0] === 'cpf'}
                value={cpf} onChange={(e) => setCpf(mascaraCpf(e.target.value))} />
            </div>
          )}

          {campos.includes('data_nascimento') && (
            <div>
              <Label htmlFor="cc-nascimento">{ROTULO.data_nascimento}</Label>
              <BirthDatePicker id="cc-nascimento" value={nascimento} onChange={setNascimento} />
            </div>
          )}

          {campos.includes('email') && (
            <div>
              <Label htmlFor="cc-email">{ROTULO.email}</Label>
              <Input id="cc-email" type="email" inputMode="email" placeholder="email@exemplo.com"
                autoFocus={campos[0] === 'email'}
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}

          {campos.includes('sexo') && (
            <div>
              <Label>{ROTULO.sexo}</Label>
              <div className="flex gap-2 mt-1">
                {SEXOS.map((opcao: string) => {
                  const marcado = sexo === opcao;
                  return (
                    <button key={opcao} type="button" aria-pressed={marcado}
                      onClick={() => setSexo(marcado ? '' : opcao)}
                      className={`flex-1 min-h-[44px] rounded-lg border px-3 text-sm capitalize transition ${
                        marcado ? 'border-[#00B39D] bg-[#00B39D]/10 font-semibold' : 'bg-card hover:bg-muted/40'
                      }`}
                    >
                      {opcao}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Sem pressa: o que não for preenchido agora será perguntado no próximo check-in.
        </p>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDone} disabled={salvando}>Agora não</Button>
          <Button onClick={salvar} disabled={salvando} className="bg-[#00B39D] hover:bg-[#00B39D]/90 text-white">
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
