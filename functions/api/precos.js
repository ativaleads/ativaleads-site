// GET /api/precos — a página de contratação mostra os valores a partir daqui,
// para nunca divergir da tabela que o servidor cobra.

import { IMPLANTACAO, PACOTES } from '../_lib/precos.js';
import { json } from '../_lib/util.js';

export function onRequestGet({ env }) {
  return json({
    ok: true,
    implantacao: { titulo: IMPLANTACAO.titulo, valor: IMPLANTACAO.valor, parcelasMax: IMPLANTACAO.parcelasMax },
    pacotes: Object.values(PACOTES).map(({ codigo, titulo, descricao, mensal }) => ({ codigo, titulo, descricao, mensal })),
    teste: env.MP_MODO !== 'producao',
    disponivel: Boolean(env.MP_ACCESS_TOKEN && env.CHECKOUT),
  });
}
