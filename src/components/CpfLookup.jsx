// ============================================================================
// CpfLookup - input de CPF que busca pessoa existente antes de cadastrar
//
// Pedido do Marcos: "Membresia e fonte unica. Antes de criar, busca pessoa
// existente em mem_membros via CPF / email. Se acha, vincula. Senao, cria."
//
// Props:
//   onMatchFound({ membro, papeis })  -> callback quando acha pessoa existente
//   onNoMatch(cpf)                    -> callback quando nao acha (segue pra cadastro novo)
//   email, telefone (opcional, melhora a busca)
//   placeholder, autoFocus (opcional)
// ============================================================================

import { useState } from 'react';
import { pessoas as pessoasApi } from '../api';
import { Search, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

function maskCpf(v) {
  return String(v || '').replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1-$2');
}

function cleanCpf(v) {
  return String(v || '').replace(/\D/g, '');
}

export default function CpfLookup({
  onMatchFound,
  onNoMatch,
  email,
  telefone,
  placeholder = 'CPF (somente números)',
  autoFocus = false,
  defaultValue = '',
  label = 'CPF',
  helperText = 'Vamos verificar se você já está cadastrado para evitar duplicação.',
}) {
  const [cpf, setCpf] = useState(defaultValue);
  const [state, setState] = useState('idle'); // idle | searching | match | no_match | error
  const [match, setMatch] = useState(null);
  const [err, setErr] = useState(null);

  const submit = async () => {
    const cleaned = cleanCpf(cpf);
    if (cleaned.length !== 11) {
      setErr('CPF deve ter 11 dígitos');
      setState('error');
      return;
    }
    setErr(null);
    setState('searching');
    try {
      const r = await pessoasApi.lookup({ cpf: cleaned, email, telefone });
      if (r.found && r.membro) {
        setMatch(r);
        setState('match');
        onMatchFound?.(r);
      } else {
        setMatch(null);
        setState('no_match');
        onNoMatch?.(cleaned);
      }
    } catch (e) {
      setErr(e?.message || 'Erro na verificação');
      setState('error');
    }
  };

  const reset = () => {
    setState('idle');
    setMatch(null);
    setErr(null);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={cpf}
          autoFocus={autoFocus}
          onChange={(e) => { setCpf(maskCpf(e.target.value)); reset(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder={placeholder}
          disabled={state === 'searching'}
          className="flex-1 h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={submit}
          disabled={state === 'searching' || cleanCpf(cpf).length !== 11}
          className="px-4 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          {state === 'searching' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {state === 'searching' ? 'Buscando' : 'Verificar'}
        </button>
      </div>

      {state === 'idle' && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}

      {state === 'error' && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
          <AlertCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-900 dark:text-rose-200">{err}</p>
        </div>
      )}

      {state === 'no_match' && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
          <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-900 dark:text-blue-200">
            CPF não encontrado. Pode prosseguir com o cadastro — vai criar uma pessoa nova.
          </p>
        </div>
      )}

      {state === 'match' && match?.membro && (
        <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                Já está cadastrado: {match.membro.nome}
              </p>
              <p className="text-xs text-emerald-800 dark:text-emerald-200">
                {match.membro.email && <>{match.membro.email} · </>}
                Status: {match.membro.status}
              </p>
              {match.papeis && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {match.papeis.voluntario && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 font-semibold">Voluntário</span>}
                  {match.papeis.visitante && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 font-semibold">Visitante</span>}
                  {(match.papeis.inscricoes_next || []).length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-semibold">{match.papeis.inscricoes_next.length}× NEXT</span>}
                  {match.papeis.grupo_ativo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200 font-semibold">Em grupo</span>}
                  {match.papeis.contribuinte_recente && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200 font-semibold">Contribuinte</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

CpfLookup.cleanCpf = cleanCpf;
CpfLookup.maskCpf = maskCpf;
