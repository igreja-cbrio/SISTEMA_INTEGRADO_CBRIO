// Gate de deploy · SÓ a regra de ordem dos hooks do React
//
// ⚠️ POR QUE UM CONFIG SEPARADO, e não `npm run lint` no CI:
// o lint completo acusa ~1.714 problemas (a esmagadora maioria
// `@typescript-eslint/no-explicit-any` de código legado). Ligá-lo no gate
// deixaria a esteira vermelha para sempre e alguém removeria o passo na
// primeira urgência. Um gate que ninguém consegue manter verde não protege
// nada — vira ruído que se aprende a ignorar.
//
// Este config roda UMA regra, que hoje tem ZERO violações, e cobre uma classe
// de bug que já derrubou a tela inteira do voluntariado em produção
// (16/08/2026): um `useState` depois de um `return null` no
// AgenteVoluntariadoPainel fazia a primeira renderização contar 6 hooks e a
// seguinte 7 — "Minified React error #310: Rendered more hooks than during the
// previous render".
//
// O erro é especialmente traiçoeiro porque só aparece quando o componente
// PASSA do early return. Naquele caso, só havia crash quando existia trabalho
// pendente de verdade, então ele atravessou review, preview e vários dias de
// produção antes de alguém esbarrar nele.
//
// ⚠️ NÃO acrescentar outras regras aqui sem antes zerar as violações delas.
// O valor deste arquivo é ser um gate que fica verde.

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "build", "node_modules", "backend", "e2e"] },
  // Comentário inline NÃO desliga este gate: `eslint-disable` referenciando
  // regras que este config não define viraria erro de "rule not found", e —
  // mais importante — um `eslint-disable react-hooks/rules-of-hooks` solto
  // deixaria passar exatamente o bug que o gate existe para pegar.
  { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: false } },
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    plugins: { "react-hooks": reactHooks },
    // Só esta. Nenhuma outra.
    rules: { "react-hooks/rules-of-hooks": "error" },
  },
);
