// Testes do checkout (S68) sem rede: Mercado Pago, e-mail e KV simulados.
// Rodar: node --test testes/checkout/
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { conferirAssinatura, montarManifest } from '../../functions/_lib/assinatura.js';
import { documento, cpfValido, cnpjValido, novoCodigo, codigoValido } from '../../functions/_lib/util.js';
import { reais, pacote, IMPLANTACAO } from '../../functions/_lib/precos.js';
import { lerReferencia, refImplantacao, refMensal } from '../../functions/_lib/contratos.js';
import { onRequestPost as webhook } from '../../functions/api/mp-webhook.js';
import { onRequestPost as contratar } from '../../functions/api/contratar.js';
import { onRequestPost as assinar } from '../../functions/api/assinar.js';
import { onRequestPost as conferir } from '../../functions/api/conferir.js';
import { onRequestGet as precos } from '../../functions/api/precos.js';

// ---------- dublês ----------
function kvFalso() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    async list({ prefix = '' } = {}) {
      return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
    },
  };
}

// MP falso: estado em memória + registro das chamadas. Também atende o e-mail.
function mundo() {
  const s = { pagamentos: {}, assinaturas: {}, faturas: {}, preferencias: [], chamadas: [], emails: [], falharEmail: false };
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url);
    const metodo = init.method || 'GET';
    s.chamadas.push(`${metodo} ${u.pathname}${u.search}`);
    const resp = (st, d) => new Response(JSON.stringify(d), { status: st, headers: { 'content-type': 'application/json' } });
    if (u.hostname === 'api.resend.com') {
      if (s.falharEmail) return resp(500, { erro: 'fora' });
      s.emails.push(JSON.parse(init.body));
      return resp(200, { id: 'e' + s.emails.length });
    }
    const p = u.pathname;
    if (metodo === 'POST' && p === '/checkout/preferences') {
      const b = JSON.parse(init.body);
      s.preferencias.push({ corpo: b, idem: init.headers['x-idempotency-key'] });
      return resp(201, { id: 'pref' + s.preferencias.length, init_point: `https://mp.test/pagar/${s.preferencias.length}` });
    }
    if (metodo === 'GET' && p === '/v1/payments/search') {
      const ref = u.searchParams.get('external_reference');
      const results = Object.values(s.pagamentos).filter((x) => !ref || x.external_reference === ref);
      return resp(200, { results });
    }
    let m = /^\/v1\/payments\/(\w+)$/.exec(p);
    if (m) return s.pagamentos[m[1]] ? resp(200, s.pagamentos[m[1]]) : resp(404, { message: 'not found' });
    if (metodo === 'POST' && p === '/preapproval') {
      const b = JSON.parse(init.body);
      if (b.card_token_id === 'tokenrecusado00000000') return resp(400, { message: 'Card token invalid', cause: [] });
      const id = 'pre' + (Object.keys(s.assinaturas).length + 1);
      s.assinaturas[id] = { id, status: 'authorized', external_reference: b.external_reference, payer_email: b.payer_email, auto_recurring: b.auto_recurring, next_payment_date: '2026-12-17T12:00:00.000-03:00', live_mode: false, _pedido: b };
      return resp(201, s.assinaturas[id]);
    }
    if (metodo === 'GET' && p === '/preapproval/search') {
      const ref = u.searchParams.get('external_reference');
      return resp(200, { results: Object.values(s.assinaturas).filter((a) => a.external_reference === ref) });
    }
    m = /^\/preapproval\/(\w+)$/.exec(p);
    if (m) return s.assinaturas[m[1]] ? resp(200, s.assinaturas[m[1]]) : resp(404, {});
    m = /^\/authorized_payments\/(\w+)$/.exec(p);
    if (m) return s.faturas[m[1]] ? resp(200, s.faturas[m[1]]) : resp(404, {});
    return resp(404, { message: 'rota falsa sem dublê: ' + p });
  };
  return { s, fetchFn };
}

const SEGREDO = 'segredo-de-teste';
function envBase(kv) {
  return {
    MP_ACCESS_TOKEN: 'TESTE-falso', MP_WEBHOOK_SECRET: SEGREDO, MP_PUBLIC_KEY: 'pk-falsa', CHECKOUT: kv,
    AVISO_EMAIL_PARA: 'operador@exemplo.com', AVISO_EMAIL_DE: 'checkout@exemplo.com', AVISO_EMAIL_PROVEDOR: 'resend', RESEND_API_KEY: 'x',
    CONFERIR_TOKEN: 'tok-conferir',
  };
}

function assinar_(dataId, requestId, ts, segredo = SEGREDO) {
  const v1 = crypto.createHmac('sha256', segredo).update(montarManifest({ dataId, requestId, ts })).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

function reqWebhook({ tipo = 'payment', id, assinatura = 'valida', origem = 'https://x.pages.dev' }) {
  const url = `${origem}/api/mp-webhook?source_news=webhooks&data.id=${id}&type=${tipo}`;
  const headers = { 'content-type': 'application/json', 'x-request-id': 'req-1' };
  if (assinatura === 'valida') headers['x-signature'] = assinar_(String(id), 'req-1', '1763400000');
  if (assinatura === 'errada') headers['x-signature'] = assinar_(String(id), 'req-1', '1763400000', 'outro');
  return new Request(url, { method: 'POST', headers, body: JSON.stringify({ type: tipo, action: `${tipo}.updated`, data: { id: String(id) } }) });
}

const post = (url, corpo, headers = {}) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(corpo) });
const CPF = '52998224725'; // CPF válido de exemplo (gerador público), não é de pessoa conhecida
const CNPJ_ATIVALEADS = '52788441000101';

// Coloca o fetch falso como global (as rotas usam o fetch do ambiente).
function comFetch(fetchFn) { globalThis.fetch = fetchFn; }

// ---------- unidades ----------
test('assinatura do webhook: válida, errada, ausente, id alfanumérico em minúsculas', async () => {
  const ok = await conferirAssinatura({ xSignature: assinar_('123', 'r', '9'), requestId: 'r', dataId: '123', segredo: SEGREDO });
  assert.equal(ok.ok, true);
  assert.equal((await conferirAssinatura({ xSignature: assinar_('123', 'r', '9', 'x'), requestId: 'r', dataId: '123', segredo: SEGREDO })).ok, false);
  assert.equal((await conferirAssinatura({ xSignature: null, requestId: 'r', dataId: '123', segredo: SEGREDO })).ok, false);
  assert.equal((await conferirAssinatura({ xSignature: 'ts=1', requestId: 'r', dataId: '1', segredo: SEGREDO })).ok, false);
  assert.equal(montarManifest({ dataId: 'ORD01ABC', requestId: 'r', ts: '1' }), 'id:ord01abc;request-id:r;ts:1;');
  assert.equal(montarManifest({ dataId: '', requestId: '', ts: '1' }), 'ts:1;');
  // Exemplo literal da documentação: a mesma conta feita pelo Node.
  const doc = crypto.createHmac('sha256', SEGREDO).update('id:123;request-id:r;ts:9;').digest('hex');
  assert.equal(assinar_('123', 'r', '9').split('v1=')[1], doc);
});

test('documentos, códigos e preços', () => {
  assert.equal(cpfValido(CPF), true);
  assert.equal(cpfValido('11111111111'), false);
  assert.equal(cnpjValido(CNPJ_ATIVALEADS), true);
  assert.deepEqual(documento('52.788.441/0001-01'), { tipo: 'CNPJ', numero: CNPJ_ATIVALEADS });
  assert.equal(documento('123'), null);
  const c = novoCodigo();
  assert.equal(codigoValido(c), true);
  assert.deepEqual(lerReferencia(refImplantacao(c)), { codigo: c, etapa: 'implantacao' });
  assert.deepEqual(lerReferencia(refMensal(c)), { codigo: c, etapa: 'mensalidade' });
  assert.equal(lerReferencia('link-manual-eaaa'), null);
  assert.equal(reais(4997), 'R$ 4.997,00');
  assert.equal(pacote('social').mensal, 497);
  assert.equal(pacote('constructor'), null);
  assert.equal(pacote('__proto__'), null);
});

test('/api/precos mostra a tabela do servidor', async () => {
  const r = await (await precos({ env: { MP_ACCESS_TOKEN: 'x', CHECKOUT: kvFalso() } })).json();
  assert.equal(r.implantacao.valor, 4997);
  assert.deepEqual(r.pacotes.map((p) => p.mensal), [497, 597, 797]);
  assert.equal(r.teste, true);
});

// ---------- fluxo pagamento único + E se… ----------
test('contratar: preço do servidor, referência única, dados inválidos recusados', async () => {
  const { s, fetchFn } = mundo();
  comFetch(fetchFn);
  const kv = kvFalso();
  const env = envBase(kv);
  const origem = 'https://checkout-mp.ativaleads-site-v1.pages.dev';

  // Valor adulterado no navegador: o campo "valor" é ignorado.
  const r = await (await contratar({ request: post(`${origem}/api/contratar`, { pacote: 'social', nome: 'Cliente Teste', email: 'cli@exemplo.com', documento: CPF, aceite: true, valor: 1, unit_price: 1 }), env })).json();
  assert.equal(r.ok, true);
  assert.equal(r.situacao, 'pagar');
  const pref = s.preferencias[0].corpo;
  assert.equal(pref.items[0].unit_price, 4997);
  assert.equal(pref.payment_methods.installments, 18);
  assert.equal(pref.external_reference, `${r.contrato}-impl`);
  assert.equal(pref.back_urls.success, `${origem}/contratar/aprovado/?c=${r.contrato}`);
  assert.equal(pref.notification_url, `${origem}/api/mp-webhook?source_news=webhooks`);
  assert.equal(pref.auto_return, 'approved');
  assert.match(s.preferencias[0].idem, /-impl-1$/);
  // Sem CPF em claro no registro.
  assert.equal([...kv.m.values()].some((v) => String(v).includes(CPF)), false);

  // Duplo clique: mesma preferência, nenhuma nova.
  const r2 = await (await contratar({ request: post(`${origem}/api/contratar`, { pacote: 'social', nome: 'Cliente Teste', email: 'cli@exemplo.com', documento: CPF, aceite: true }), env })).json();
  assert.equal(r2.contrato, r.contrato);
  assert.equal(r2.url, r.url);
  assert.equal(s.preferencias.length, 1);

  for (const [corpo, codigo] of [
    [{ pacote: 'ouro', nome: 'A B', email: 'a@b.com', documento: CPF, aceite: true }, 'pacote'],
    [{ pacote: 'social', nome: 'A B', email: 'a@b', documento: CPF, aceite: true }, 'email'],
    [{ pacote: 'social', nome: 'A B', email: 'a@b.com', documento: '12345678900', aceite: true }, 'documento'],
    [{ pacote: 'social', nome: 'A B', email: 'a@b.com', documento: CPF, aceite: false }, 'aceite'],
  ]) {
    const x = await contratar({ request: post(`${origem}/api/contratar`, corpo), env });
    assert.equal(x.status, 400);
    assert.equal((await x.json()).codigo, codigo);
  }
});

test('ponta a ponta simulada: implantação aprovada → assinatura → webhooks → E se…', async () => {
  const { s, fetchFn } = mundo();
  comFetch(fetchFn);
  const kv = kvFalso();
  const env = envBase(kv);
  const origem = 'https://checkout-mp.ativaleads-site-v1.pages.dev';
  const r = await (await contratar({ request: post(`${origem}/api/contratar`, { pacote: 'social_trafego', nome: 'Empresa Teste LTDA', email: 'fin@exemplo.com', documento: CNPJ_ATIVALEADS, aceite: true }), env })).json();
  const c = r.contrato;

  // Assinatura antes da implantação aprovada: bloqueada.
  let x = await assinar({ request: post(`${origem}/api/assinar`, { contrato: c, token: 'tokencartao0000000001', email: 'fin@exemplo.com' }), env });
  assert.equal(x.status, 409);

  // Webhook com assinatura errada → 401; sem assinatura → 401 (padrão estrito).
  s.pagamentos['101'] = { id: 101, status: 'approved', status_detail: 'accredited', transaction_amount: 4997, external_reference: `${c}-impl`, payment_type_id: 'credit_card', installments: 3, live_mode: false, transaction_details: { net_received_amount: 4449.83, total_paid_amount: 4997 }, date_created: '2026-11-17T20:00:00.000-03:00' };
  assert.equal((await webhook({ request: reqWebhook({ id: 101, assinatura: 'errada' }), env })).status, 401);
  assert.equal((await webhook({ request: reqWebhook({ id: 101, assinatura: 'nenhuma' }), env })).status, 401);
  assert.equal(s.emails.length, 0);

  // Webhook válido → aviso de aprovação, contrato atualizado.
  x = await webhook({ request: reqWebhook({ id: 101 }), env });
  assert.equal(x.status, 200);
  assert.equal(s.emails.length, 1);
  assert.match(s.emails[0].subject, /^\[TESTE\] Checkout Ativaleads: Implantação APROVADA — Empresa Teste LTDA/);
  assert.match(s.emails[0].text, /Líquido: R\$ 4\.449,83/);
  assert.match(s.emails[0].text, /cartão de crédito em 3x/);

  // Reenvio do mesmo aviso (MP reenvia): nenhum e-mail novo.
  x = await webhook({ request: reqWebhook({ id: 101 }), env });
  assert.equal((await x.json()).acao, 'repetido');
  assert.equal(s.emails.length, 1);

  // Cliente volta ao formulário depois de pagar: não abre 2ª cobrança.
  const pr = s.preferencias.length;
  const volta = await (await contratar({ request: post(`${origem}/api/contratar`, { pacote: 'social_trafego', nome: 'Empresa Teste LTDA', email: 'fin@exemplo.com', documento: CNPJ_ATIVALEADS, aceite: true }), env })).json();
  assert.equal(volta.situacao, 'ja_pago');
  assert.equal(s.preferencias.length, pr);

  // Dois pagamentos aprovados do mesmo contrato → aviso de duplicado.
  s.pagamentos['102'] = { ...s.pagamentos['101'], id: 102 };
  await webhook({ request: reqWebhook({ id: 102 }), env });
  assert.match(s.emails.at(-1).subject, /PAGAMENTO DUPLICADO/);

  // Cartão recusado na assinatura → 402 com mensagem.
  x = await assinar({ request: post(`${origem}/api/assinar`, { contrato: c, token: 'tokenrecusado00000000', email: 'fin@exemplo.com' }), env });
  assert.equal(x.status, 402);

  // Assinatura com valor da tabela (797), sem preço vindo do navegador.
  x = await assinar({ request: post(`${origem}/api/assinar`, { contrato: c, token: 'tokencartao0000000001', email: 'fin@exemplo.com', valor: 1 }), env });
  assert.equal(x.status, 200);
  const pre = Object.values(s.assinaturas)[0];
  assert.equal(pre._pedido.auto_recurring.transaction_amount, 797);
  assert.equal(pre._pedido.status, 'authorized');
  assert.equal(pre._pedido.external_reference, `${c}-mens`);
  // Segunda tentativa de assinar: não cria outra.
  x = await (await assinar({ request: post(`${origem}/api/assinar`, { contrato: c, token: 'tokencartao0000000002', email: 'fin@exemplo.com' }), env })).json();
  assert.equal(x.situacao, 'ja_assinado');
  assert.equal(Object.keys(s.assinaturas).length, 1);

  // Webhook de assinatura ativa.
  await webhook({ request: reqWebhook({ tipo: 'subscription_preapproval', id: pre.id }), env });
  assert.match(s.emails.at(-1).subject, /Assinatura ATIVA/);

  // Parcela recusada (fatura em recycling) → aviso na 1ª recusa.
  s.faturas['901'] = { id: 901, preapproval_id: pre.id, status: 'recycling', retry_attempt: 1, transaction_amount: 797, payment: { id: 555, status: 'rejected', status_detail: 'cc_rejected_insufficient_amount' }, next_retry_date: '2026-12-19T12:00:00.000-03:00' };
  await webhook({ request: reqWebhook({ tipo: 'subscription_authorized_payment', id: 901 }), env });
  assert.match(s.emails.at(-1).subject, /Mensalidade RECUSADA \(tentativa 1\)/);

  // Parcela paga com valor divergente da tabela → aviso.
  s.pagamentos['556'] = { id: 556, status: 'approved', status_detail: 'accredited', transaction_amount: 500, external_reference: `${c}-mens`, payment_type_id: 'credit_card', installments: 1, live_mode: false };
  await webhook({ request: reqWebhook({ id: 556 }), env });
  assert.match(s.emails.at(-1).subject, /VALOR DIVERGENTE/);

  // Estorno e chargeback da implantação.
  s.pagamentos['101'] = { ...s.pagamentos['101'], status: 'refunded', status_detail: 'refunded' };
  await webhook({ request: reqWebhook({ id: 101 }), env });
  assert.match(s.emails.at(-1).subject, /DEVOLVIDA/);
  s.pagamentos['101'] = { ...s.pagamentos['101'], status: 'charged_back', status_detail: 'settled' };
  await webhook({ request: reqWebhook({ id: 101 }), env });
  assert.match(s.emails.at(-1).subject, /CHARGEBACK/);

  // Cliente cancela pelo app/banco.
  s.assinaturas[pre.id].status = 'cancelled';
  await webhook({ request: reqWebhook({ tipo: 'subscription_preapproval', id: pre.id }), env });
  assert.match(s.emails.at(-1).subject, /Assinatura CANCELADA/);

  // Pagamento da conta que não é do checkout (link manual): ignorado, sem e-mail.
  const n = s.emails.length;
  s.pagamentos['777'] = { id: 777, status: 'approved', external_reference: 'eaaa-manual', transaction_amount: 10 };
  x = await (await webhook({ request: reqWebhook({ id: 777 }), env })).json();
  assert.equal(x.acao, 'ignorado');
  assert.equal(s.emails.length, n);
});

test('e-mail fora do ar → 500 (MP reenvia) e depois avisa uma vez só', async () => {
  const { s, fetchFn } = mundo();
  comFetch(fetchFn);
  const kv = kvFalso();
  const env = envBase(kv);
  const r = await (await contratar({ request: post('https://a.pages.dev/api/contratar', { pacote: 'trafego', nome: 'Cli Dois', email: 'c2@exemplo.com', documento: CPF, aceite: true }), env })).json();
  s.pagamentos['201'] = { id: 201, status: 'rejected', status_detail: 'cc_rejected_other_reason', transaction_amount: 4997, external_reference: `${r.contrato}-impl`, payment_type_id: 'credit_card', installments: 1, live_mode: false };
  s.falharEmail = true;
  assert.equal((await webhook({ request: reqWebhook({ id: 201 }), env })).status, 500);
  s.falharEmail = false;
  assert.equal((await webhook({ request: reqWebhook({ id: 201 }), env })).status, 200);
  assert.equal((await webhook({ request: reqWebhook({ id: 201 }), env })).status, 200);
  assert.equal(s.emails.length, 1);
  assert.match(s.emails[0].subject, /Implantação RECUSADA/);
});

test('webhook sem x-signature só passa com a chave de configuração; assinatura errada nunca passa', async () => {
  const { s, fetchFn } = mundo();
  comFetch(fetchFn);
  const env = { ...envBase(kvFalso()), MP_WEBHOOK_SEM_ASSINATURA: 'aceitar' };
  s.pagamentos['301'] = { id: 301, status: 'approved', external_reference: 'outra-coisa', transaction_amount: 1 };
  assert.equal((await webhook({ request: reqWebhook({ id: 301, assinatura: 'nenhuma' }), env })).status, 200);
  assert.equal((await webhook({ request: reqWebhook({ id: 301, assinatura: 'errada' }), env })).status, 401);
});

test('conferir: webhook perdido é recuperado e implantação sem assinatura gera lembrete', async () => {
  const { s, fetchFn } = mundo();
  comFetch(fetchFn);
  const kv = kvFalso();
  const env = envBase(kv);
  const r = await (await contratar({ request: post('https://a.pages.dev/api/contratar', { pacote: 'social', nome: 'Cli Tres', email: 'c3@exemplo.com', documento: CPF, aceite: true }), env })).json();
  s.pagamentos['401'] = { id: 401, status: 'approved', status_detail: 'accredited', transaction_amount: 4997, external_reference: `${r.contrato}-impl`, payment_type_id: 'bank_transfer', installments: 1, live_mode: false, date_last_updated: '2026-11-10T10:00:00.000-03:00' };
  // Sem token → 401; sem CONFERIR_TOKEN no ambiente → 404.
  assert.equal((await conferir({ request: post('https://a.pages.dev/api/conferir', {}), env })).status, 401);
  assert.equal((await conferir({ request: post('https://a.pages.dev/api/conferir', {}), env: { ...env, CONFERIR_TOKEN: '' } })).status, 404);
  const out = await (await conferir({ request: post('https://a.pages.dev/api/conferir', {}, { authorization: 'Bearer tok-conferir' }), env })).json();
  assert.equal(out.ok, true);
  assert.equal(out.pagamentos[0].acao, 'pagamento approved');
  assert.match(s.emails[0].subject, /Implantação APROVADA/);
  assert.match(s.emails[0].text, /Meio: Pix/);
  assert.deepEqual(out.lembretes, [r.contrato]);
  assert.match(s.emails[1].subject, /Implantação paga SEM mensalidade/);
  // Rodar de novo no mesmo dia: nada repetido.
  const out2 = await (await conferir({ request: post('https://a.pages.dev/api/conferir', {}, { authorization: 'Bearer tok-conferir' }), env })).json();
  assert.equal(out2.lembretes.length, 0);
  assert.equal(s.emails.length, 2);
});

test('valores de exibição batem com a tabela da S66', () => {
  assert.equal(IMPLANTACAO.valor, 4997);
  assert.deepEqual(['social', 'trafego', 'social_trafego'].map((k) => pacote(k).mensal), [497, 597, 797]);
});
