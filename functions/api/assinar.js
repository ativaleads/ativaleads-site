// POST /api/assinar  { contrato, token, email, metodo }
// Cria a assinatura mensal (preapproval SEM plano, status "authorized") com o cartão
// tokenizado pelo campo seguro do Mercado Pago na nossa página (o número do cartão não
// passa por aqui; SAQ A). Valor SEMPRE da tabela do servidor.
// Regra: só depois da implantação aprovada, e uma assinatura ativa por contrato.

import { pacote, INICIO_MENSALIDADE_DIAS } from '../_lib/precos.js';
import { json, erro, lerJson, codigoValido, emailValido } from '../_lib/util.js';
import { criarCliente, resumoErro, ErroMP } from '../_lib/mp.js';
import { lerContrato, gravarContrato, anotar, refMensal, refImplantacao } from '../_lib/contratos.js';

const ATIVAS = new Set(['authorized', 'pending', 'paused']);

export async function onRequestPost({ request, env }) {
  let corpo;
  try {
    corpo = await lerJson(request);
  } catch {
    return erro('Pedido inválido.');
  }
  if (!codigoValido(corpo.contrato)) return erro('Contrato inválido.', 404, 'contrato');
  if (typeof corpo.token !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(corpo.token)) return erro('Cartão não informado.', 400, 'token');
  const email = String(corpo.email || '').trim().toLowerCase();
  if (!emailValido(email)) return erro('Informe um e-mail válido.', 400, 'email');

  const c = await lerContrato(env, corpo.contrato);
  if (!c) return erro('Contrato não encontrado.', 404, 'contrato');
  const pk = pacote(c.pacote);
  let mp;
  try {
    mp = criarCliente(env);
  } catch {
    return erro('Checkout indisponível no momento.', 503, 'sem_config');
  }

  // 1) Implantação aprovada? (registro ou fonte)
  if (c.implantacao.status !== 'approved') {
    try {
      const r = await mp.pagamentosPorReferencia(refImplantacao(c.codigo));
      const ap = ((r && r.results) || []).find((p) => p.status === 'approved');
      if (ap) c.implantacao = { ...c.implantacao, status: 'approved', pagamento_id: ap.id, valor: ap.transaction_amount };
    } catch (e) {
      console.log('conferência da implantação falhou', resumoErro(e));
    }
    if (c.implantacao.status !== 'approved') return erro('A mensalidade é ativada depois que a implantação for aprovada.', 409, 'implantacao');
  }

  // 2) Já existe assinatura viva? (registro e fonte)
  if (c.assinatura && ATIVAS.has(c.assinatura.status)) {
    return json({ ok: true, situacao: 'ja_assinado', status: c.assinatura.status });
  }
  try {
    const r = await mp.assinaturasPorReferencia(refMensal(c.codigo));
    const viva = ((r && r.results) || []).find((a) => ATIVAS.has(a.status));
    if (viva) {
      c.assinatura = { id: viva.id, status: viva.status, proxima: viva.next_payment_date || null };
      anotar(c, `assinatura existente encontrada: ${viva.id}`);
      await gravarContrato(env, c);
      return json({ ok: true, situacao: 'ja_assinado', status: viva.status });
    }
  } catch (e) {
    console.log('busca de assinaturas falhou', resumoErro(e));
  }

  // 3) Cria.
  const origem = new URL(request.url).origin;
  const auto = { frequency: 1, frequency_type: 'months', transaction_amount: pk.mensal, currency_id: 'BRL' };
  if (INICIO_MENSALIDADE_DIAS > 0) auto.start_date = new Date(Date.now() + INICIO_MENSALIDADE_DIAS * 86400e3).toISOString();
  const pedido = {
    reason: `Ativaleads · ${pk.titulo} (${pk.descricao})`,
    external_reference: refMensal(c.codigo),
    payer_email: email,
    card_token_id: corpo.token,
    auto_recurring: auto,
    back_url: `${origem}/contratar/aprovado/?c=${c.codigo}`,
    notification_url: `${origem}/api/mp-webhook?source_news=webhooks`,
    status: 'authorized',
  };
  const tentativa = (c.tentativasAssinatura || 0) + 1;
  c.tentativasAssinatura = tentativa;
  try {
    const a = await mp.criarAssinatura(pedido, `${c.codigo}-mens-${tentativa}`);
    c.assinatura = { id: a.id, status: a.status, proxima: a.next_payment_date || null, valor: pk.mensal, email };
    anotar(c, `assinatura ${a.id} criada (${a.status})`);
    await gravarContrato(env, c);
    return json({ ok: true, situacao: 'assinado', status: a.status, proxima: a.next_payment_date || null });
  } catch (e) {
    const resumo = resumoErro(e);
    console.log('criar assinatura falhou', resumo);
    anotar(c, `assinatura recusada: ${resumo.slice(0, 160)}`);
    await gravarContrato(env, c);
    const recusa = e instanceof ErroMP && e.status >= 400 && e.status < 500;
    return erro(
      recusa
        ? 'O cartão não foi aceito para a mensalidade. Confira os dados ou use outro cartão.'
        : 'Não foi possível ativar a mensalidade agora. Tente de novo em alguns minutos.',
      recusa ? 402 : 502,
      recusa ? 'cartao' : 'mp',
    );
  }
}

export function onRequest() {
  return erro('Use POST.', 405, 'metodo');
}
