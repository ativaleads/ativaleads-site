// GET /api/contrato?c=<codigo>
// Situação do contrato para as páginas de retorno. Confere na fonte (API do MP) quando
// o registro ainda não diz "aprovado": a página de retorno não é prova, o webhook pode
// atrasar. Devolve só o necessário (primeiro nome, pacote, valores, situação).

import { IMPLANTACAO, pacote } from '../_lib/precos.js';
import { json, erro, codigoValido } from '../_lib/util.js';
import { criarCliente, resumoErro } from '../_lib/mp.js';
import { lerContrato, gravarContrato, anotar, refImplantacao } from '../_lib/contratos.js';

export async function onRequestGet({ request, env }) {
  const c0 = new URL(request.url).searchParams.get('c');
  if (!codigoValido(c0)) return erro('Contrato inválido.', 404, 'contrato');
  const c = await lerContrato(env, c0);
  if (!c) return erro('Contrato não encontrado.', 404, 'contrato');

  if (c.implantacao.status !== 'approved') {
    try {
      const mp = criarCliente(env);
      const r = await mp.pagamentosPorReferencia(refImplantacao(c.codigo));
      const res = (r && r.results) || [];
      const ap = res.find((p) => p.status === 'approved');
      const outro = ap || res[0];
      if (outro && (outro.status !== c.implantacao.status || String(outro.id) !== String(c.implantacao.pagamento_id))) {
        c.implantacao = { ...c.implantacao, status: outro.status, status_detail: outro.status_detail, pagamento_id: outro.id, valor: outro.transaction_amount };
        anotar(c, `situação conferida na API: ${outro.id} ${outro.status}`);
        await gravarContrato(env, c);
      }
    } catch (e) {
      console.log('conferência do contrato falhou', resumoErro(e));
    }
  }

  const pk = pacote(c.pacote);
  const a = c.assinatura;
  return json({
    ok: true,
    contrato: c.codigo,
    primeiroNome: c.cliente.nome.split(' ')[0],
    email: c.cliente.email,
    pacote: { codigo: pk.codigo, titulo: pk.titulo, descricao: pk.descricao, mensal: pk.mensal },
    implantacao: { valor: IMPLANTACAO.valor, status: c.implantacao.status, detalhe: c.implantacao.status_detail || null },
    assinatura: a ? { status: a.status, proxima: a.proxima || null } : null,
    chavePublica: env.MP_PUBLIC_KEY || null,
    teste: env.MP_MODO !== 'producao',
  });
}

export function onRequest() {
  return erro('Use GET.', 405, 'metodo');
}
