// POST /api/contratar  { pacote, nome, email, documento, aceite }
//   ou                  { contrato }   (nova tentativa de um contrato existente)
// Cria (ou reaproveita) o contrato e a preferência do Checkout Pro da implantação.
// O preço vem SEMPRE da tabela do servidor (precos.js).

import { IMPLANTACAO, MEIOS_EXCLUIDOS, pacote } from '../_lib/precos.js';
import { json, erro, lerJson, documento, emailValido, nomeLimpo, novoCodigo, codigoValido, mascararDoc } from '../_lib/util.js';
import { criarCliente, resumoErro } from '../_lib/mp.js';
import {
  hashDoc, lerContrato, gravarContrato, contratoDoCliente, ligarCliente, anotar, refImplantacao,
} from '../_lib/contratos.js';

const VALIDADE_PREF_H = 72;

function preferencia(c, origem, docObj) {
  const pk = pacote(c.pacote);
  const [primeiro, ...resto] = c.cliente.nome.split(' ');
  const volta = (p) => `${origem}/contratar/${p}/?c=${c.codigo}`;
  const expira = new Date(Date.now() + VALIDADE_PREF_H * 3600e3).toISOString();
  return {
    items: [{
      id: IMPLANTACAO.codigo,
      title: IMPLANTACAO.titulo,
      description: `${IMPLANTACAO.descricao}. Pacote ${pk.titulo}.`,
      category_id: 'services',
      quantity: 1,
      currency_id: 'BRL',
      unit_price: IMPLANTACAO.valor,
    }],
    payer: {
      name: primeiro,
      surname: resto.join(' ') || undefined,
      email: c.cliente.email,
      identification: docObj ? { type: docObj.tipo, number: docObj.numero } : undefined,
    },
    external_reference: refImplantacao(c.codigo),
    back_urls: { success: volta('aprovado'), pending: volta('pendente'), failure: volta('recusado') },
    auto_return: 'approved',
    notification_url: `${origem}/api/mp-webhook?source_news=webhooks`,
    payment_methods: { installments: IMPLANTACAO.parcelasMax, excluded_payment_types: MEIOS_EXCLUIDOS },
    statement_descriptor: 'ATIVALEADS',
    expires: true,
    expiration_date_to: expira,
    metadata: { contrato: c.codigo, etapa: 'implantacao', pacote: c.pacote },
  };
}

export async function onRequestPost({ request, env }) {
  let corpo;
  try {
    corpo = await lerJson(request);
  } catch {
    return erro('Pedido inválido.');
  }
  const origem = new URL(request.url).origin;
  let mp;
  try {
    mp = criarCliente(env);
  } catch {
    return erro('Checkout indisponível no momento. Fale com a Ativaleads.', 503, 'sem_config');
  }

  let c;
  let docObj = null;
  if (corpo.contrato) {
    // Nova tentativa (página "recusado"): mesmo contrato, nova preferência.
    if (!codigoValido(corpo.contrato)) return erro('Contrato inválido.', 404, 'contrato');
    c = await lerContrato(env, corpo.contrato);
    if (!c) return erro('Contrato não encontrado.', 404, 'contrato');
  } else {
    const pk = pacote(corpo.pacote);
    const nome = nomeLimpo(corpo.nome);
    const email = String(corpo.email || '').trim().toLowerCase();
    docObj = documento(corpo.documento);
    if (!pk) return erro('Escolha um pacote.', 400, 'pacote');
    if (!nome) return erro('Informe o nome completo ou a razão social.', 400, 'nome');
    if (!emailValido(email)) return erro('Informe um e-mail válido.', 400, 'email');
    if (!docObj) return erro('Informe um CPF ou CNPJ válido.', 400, 'documento');
    if (corpo.aceite !== true) return erro('É preciso aceitar os termos de contratação.', 400, 'aceite');

    const hash = await hashDoc(env, docObj.numero);
    c = await contratoDoCliente(env, hash, pk.codigo);
    if (!c) {
      c = {
        codigo: novoCodigo(),
        criado: new Date().toISOString(),
        pacote: pk.codigo,
        cliente: { nome, email, docTipo: docObj.tipo, docHash: hash, docMascara: mascararDoc(docObj) },
        implantacao: { status: 'aberto' },
        assinatura: null,
        historico: [],
      };
      anotar(c, 'contrato criado');
      await gravarContrato(env, c);
      await ligarCliente(env, hash, pk.codigo, c.codigo);
    } else {
      // Mesmo cliente e pacote: não abre 2ª cobrança. Atualiza contato se mudou.
      c.cliente.nome = nome;
      c.cliente.email = email;
      anotar(c, 'cliente voltou ao formulário');
    }
  }

  // Implantação já paga: não cria outra cobrança (E se… "dois pagamentos").
  if (c.implantacao && c.implantacao.status === 'approved') {
    await gravarContrato(env, c);
    return json({ ok: true, situacao: 'ja_pago', contrato: c.codigo, url: `${origem}/contratar/aprovado/?c=${c.codigo}` });
  }
  // Conferência na fonte: há pagamento aprovado ou em andamento para esta referência?
  try {
    const busca = await mp.pagamentosPorReferencia(refImplantacao(c.codigo));
    const res = (busca && busca.results) || [];
    const aprovado = res.find((p) => p.status === 'approved');
    const andamento = res.find((p) => p.status === 'pending' || p.status === 'in_process' || p.status === 'authorized');
    if (aprovado) {
      c.implantacao = { ...c.implantacao, status: 'approved', pagamento_id: aprovado.id, valor: aprovado.transaction_amount };
      anotar(c, `aprovado encontrado na busca: ${aprovado.id}`);
      await gravarContrato(env, c);
      return json({ ok: true, situacao: 'ja_pago', contrato: c.codigo, url: `${origem}/contratar/aprovado/?c=${c.codigo}` });
    }
    if (andamento) {
      await gravarContrato(env, c);
      return json({ ok: true, situacao: 'em_andamento', contrato: c.codigo, url: `${origem}/contratar/pendente/?c=${c.codigo}` });
    }
  } catch (e) {
    console.log('busca de pagamentos falhou', resumoErro(e));
  }

  // Reaproveita a preferência ainda válida (duplo clique, voltar e clicar de novo).
  const pref = c.implantacao && c.implantacao.preferencia;
  if (pref && pref.expira && Date.parse(pref.expira) - Date.now() > 3600e3 && pref.origem === origem) {
    await gravarContrato(env, c);
    return json({ ok: true, situacao: 'pagar', contrato: c.codigo, url: pref.url });
  }

  try {
    const p = preferencia(c, origem, docObj);
    const tentativa = (c.implantacao.tentativas || 0) + 1;
    const r = await mp.criarPreferencia(p, `${c.codigo}-impl-${tentativa}`);
    c.implantacao = {
      ...c.implantacao,
      tentativas: tentativa,
      preferencia: { id: r.id, url: r.init_point, expira: p.expiration_date_to, origem },
    };
    anotar(c, `preferência ${r.id} criada`);
    await gravarContrato(env, c);
    return json({ ok: true, situacao: 'pagar', contrato: c.codigo, url: r.init_point });
  } catch (e) {
    console.log('criar preferência falhou', resumoErro(e));
    await gravarContrato(env, c);
    return erro('Não foi possível abrir o pagamento agora. Tente de novo em alguns minutos.', 502, 'mp');
  }
}

export function onRequest() {
  return erro('Use POST.', 405, 'metodo');
}
