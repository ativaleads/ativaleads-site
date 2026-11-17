// O que fazer com cada notificação do Mercado Pago. Regra: nunca confiar no corpo do
// aviso; buscar o recurso pela API e decidir pelo estado de lá (desenho §5, item 2).
// Cada estado avisado uma vez só (marca ev:* no KV).

import { IMPLANTACAO, pacote, reais } from './precos.js';
import { lerContrato, gravarContrato, anotar, eventoJaVisto, marcarEvento, lerReferencia } from './contratos.js';
import { avisar, montarAviso } from './avisos.js';
import { brt } from './util.js';

const MEIO = {
  credit_card: 'cartão de crédito',
  debit_card: 'cartão de débito',
  bank_transfer: 'Pix',
  account_money: 'saldo Mercado Pago',
  ticket: 'boleto',
  prepaid_card: 'cartão pré-pago',
};

const NOME_STATUS = {
  approved: 'aprovado',
  pending: 'pendente',
  in_process: 'em análise',
  authorized: 'autorizado',
  rejected: 'recusado',
  cancelled: 'cancelado',
  refunded: 'devolvido (estorno)',
  charged_back: 'contestado no banco (chargeback)',
  in_mediation: 'em disputa (mediação)',
};

function meio(p) {
  const base = MEIO[p.payment_type_id] || p.payment_type_id || '?';
  return p.installments > 1 ? `${base} em ${p.installments}x` : base;
}

function linhasCliente(c) {
  if (!c) return [['Contrato', 'não encontrado no registro']];
  const pk = pacote(c.pacote);
  return [
    ['Cliente', c.cliente.nome],
    ['E-mail', c.cliente.email],
    ['Documento', c.cliente.docMascara],
    ['Pacote', pk ? `${pk.titulo} (${reais(pk.mensal)}/mês)` : c.pacote],
    ['Contrato', c.codigo],
  ];
}

function linhasPagamento(p) {
  const l = [
    ['Valor', reais(p.transaction_amount)],
    ['Meio', meio(p)],
    ['Status', `${NOME_STATUS[p.status] || p.status} (${p.status_detail || '-'})`],
    ['Pagamento', String(p.id)],
    ['Data', brt(p.date_last_updated || p.date_created)],
  ];
  const liq = p.transaction_details && p.transaction_details.net_received_amount;
  if (liq) l.splice(2, 0, ['Líquido', reais(liq)]);
  if (p.transaction_details && p.transaction_details.total_paid_amount > p.transaction_amount)
    l.splice(1, 0, ['Pago pelo cliente (com juros)', reais(p.transaction_details.total_paid_amount)]);
  return l;
}

async function enviar(env, deps, titulo, linhas, nota, teste) {
  return avisar(env, montarAviso({ titulo, linhas, nota, teste }), { fetchFn: deps.fetchFn });
}

// Descobre a referência de um pagamento (implantação direta ou parcela de assinatura).
async function referenciaDoPagamento(p, mp) {
  let ref = lerReferencia(p.external_reference);
  if (ref) return ref;
  const preId = (p.metadata && (p.metadata.preapproval_id || p.metadata.preapprovalId)) ||
    (p.point_of_interaction && p.point_of_interaction.transaction_data && p.point_of_interaction.transaction_data.subscription_id);
  if (preId) {
    try {
      const a = await mp.assinatura(preId);
      return lerReferencia(a.external_reference);
    } catch {
      return null;
    }
  }
  return null;
}

export async function processarPagamento(env, mp, id, deps = {}) {
  const p = await mp.pagamento(id);
  const chave = `pay:${p.id}:${p.status}:${p.status_detail || ''}`;
  if (await eventoJaVisto(env, chave)) return { acao: 'repetido', chave };

  const teste = p.live_mode === false;
  const ref = await referenciaDoPagamento(p, mp);
  if (!ref) {
    // Pagamento da conta que não é deste checkout (ex.: link de pagamento manual). Ignora.
    await marcarEvento(env, chave);
    return { acao: 'ignorado', motivo: 'referência fora do checkout', ref: p.external_reference || null };
  }
  const c = await lerContrato(env, ref.codigo);
  const etapa = ref.etapa;
  const esperado = etapa === 'implantacao' ? IMPLANTACAO.valor : c && pacote(c.pacote) ? pacote(c.pacote).mensal : null;
  const divergente = esperado !== null && Math.abs(Number(p.transaction_amount) - esperado) > 0.009;
  const nomeEtapa = etapa === 'implantacao' ? 'Implantação' : 'Mensalidade';
  const linhas = [...linhasCliente(c), ...linhasPagamento(p)];
  let titulo = null;
  let nota = null;
  let acao = `pagamento ${p.status}`;

  if (c) {
    const reg = etapa === 'implantacao' ? (c.implantacao = c.implantacao || {}) : (c.mensalidades = c.mensalidades || {});
    if (etapa === 'implantacao') {
      const anterior = reg.pagamento_id && String(reg.pagamento_id) !== String(p.id) && reg.status === 'approved';
      if (p.status === 'approved' && anterior) {
        titulo = `PAGAMENTO DUPLICADO da implantação — ${c.cliente.nome}`;
        nota = `Já existe o pagamento aprovado ${reg.pagamento_id} para este contrato. Conferir e devolver um deles no painel do Mercado Pago.`;
        acao = 'duplicado';
        anotar(c, `pagamento duplicado ${p.id} (já havia ${reg.pagamento_id})`);
      } else if (!(reg.status === 'approved' && p.status !== 'approved' && String(reg.pagamento_id) !== String(p.id))) {
        // Não deixa uma tentativa recusada apagar um aprovado de outro pagamento.
        Object.assign(reg, {
          status: p.status,
          status_detail: p.status_detail,
          pagamento_id: p.id,
          valor: p.transaction_amount,
          liquido: p.transaction_details && p.transaction_details.net_received_amount,
          meio: meio(p),
          em: p.date_last_updated || p.date_created,
        });
      }
    } else {
      reg[String(p.id)] = { status: p.status, valor: p.transaction_amount, em: p.date_last_updated || p.date_created };
    }
    anotar(c, `${nomeEtapa.toLowerCase()}: pagamento ${p.id} ${p.status}/${p.status_detail}`);
    await gravarContrato(env, c);
  }

  if (!titulo) {
    const quem = c ? c.cliente.nome : 'contrato não encontrado';
    switch (p.status) {
      case 'approved':
        titulo = `${nomeEtapa} APROVADA — ${quem}`;
        if (etapa === 'implantacao')
          nota = 'Próximo passo do cliente: ativar a mensalidade na página de retorno. Emitir a NFS-e (o Mercado Pago não emite).';
        break;
      case 'rejected':
        titulo = `${nomeEtapa} RECUSADA — ${quem}`;
        nota = etapa === 'mensalidade'
          ? 'O Mercado Pago tenta de novo até 4 vezes em 10 dias; 3 parcelas recusadas cancelam a assinatura. Plano B: Pix.'
          : 'O cliente pode tentar de novo pela mesma página.';
        break;
      case 'refunded':
        titulo = `${nomeEtapa} DEVOLVIDA (estorno) — ${quem}`;
        break;
      case 'charged_back':
        titulo = `CHARGEBACK na ${nomeEtapa.toLowerCase()} — ${quem}`;
        nota = 'Valor retido até a disputa. Juntar prova de entrega (relatório, site no ar, conversas).';
        break;
      case 'in_mediation':
        titulo = `${nomeEtapa} EM DISPUTA — ${quem}`;
        nota = 'Responder a disputa no painel do Mercado Pago com a prova de entrega.';
        break;
      default:
        // pending, in_process, authorized, cancelled: só registro, sem aviso.
        break;
    }
  }
  if (divergente) {
    titulo = `VALOR DIVERGENTE — ${titulo || `${nomeEtapa} ${p.status}`}`;
    nota = `Esperado ${reais(esperado)} pela tabela; o pagamento é de ${reais(p.transaction_amount)}. ${nota || ''}`.trim();
    acao = 'valor divergente';
  }
  if (!c && p.status === 'approved') {
    titulo = titulo || `${nomeEtapa} aprovada sem contrato`;
    nota = 'Pagamento com referência do checkout, mas o contrato não está no registro. Conferir.';
  }

  if (titulo) await enviar(env, deps, titulo, linhas, nota, teste);
  await marcarEvento(env, chave);
  return { acao, avisado: Boolean(titulo), status: p.status, etapa, contrato: c ? c.codigo : null };
}

export async function processarAssinatura(env, mp, id, deps = {}) {
  const a = await mp.assinatura(id);
  const chave = `pre:${a.id}:${a.status}`;
  if (await eventoJaVisto(env, chave)) return { acao: 'repetido', chave };
  const ref = lerReferencia(a.external_reference);
  if (!ref) {
    await marcarEvento(env, chave);
    return { acao: 'ignorado', motivo: 'referência fora do checkout' };
  }
  const c = await lerContrato(env, ref.codigo);
  const teste = a.live_mode === false || String(a.payer_email || '').endsWith('@testuser.com');
  if (c) {
    c.assinatura = { ...(c.assinatura || {}), id: a.id, status: a.status, proxima: a.next_payment_date || null, valor: a.auto_recurring && a.auto_recurring.transaction_amount };
    anotar(c, `assinatura ${a.id} ${a.status}`);
    await gravarContrato(env, c);
  }
  const quem = c ? c.cliente.nome : 'contrato não encontrado';
  const linhas = [
    ...linhasCliente(c),
    ['Assinatura', String(a.id)],
    ['Status', a.status],
    ['Valor mensal', a.auto_recurring ? reais(a.auto_recurring.transaction_amount) : '?'],
    ['Próxima cobrança', a.next_payment_date ? brt(a.next_payment_date) : '-'],
  ];
  let titulo = null;
  let nota = null;
  // A rota /api/assinar já grava "authorized"; o aviso sai aqui, uma vez por assinatura (marca ev:).
  if (a.status === 'authorized') titulo = `Assinatura ATIVA — ${quem}`;
  if (a.status === 'paused') { titulo = `Assinatura PAUSADA — ${quem}`; nota = 'Pausa não feita pelo checkout: conferir com o cliente.'; }
  if (a.status === 'cancelled') {
    titulo = `Assinatura CANCELADA — ${quem}`;
    nota = 'Pode ter sido o cliente (app ou banco) ou 3 parcelas recusadas. A multa de fidelidade, se houver, é cobrada por fora (contrato).';
  }
  if (titulo) await enviar(env, deps, titulo, linhas, nota, teste);
  await marcarEvento(env, chave);
  return { acao: `assinatura ${a.status}`, avisado: Boolean(titulo), contrato: c ? c.codigo : null };
}

export async function processarFatura(env, mp, id, deps = {}) {
  const f = await mp.fatura(id);
  const pg = f.payment || {};
  const chave = `fat:${f.id}:${f.status}:${pg.status || ''}:${f.retry_attempt || 0}`;
  if (await eventoJaVisto(env, chave)) return { acao: 'repetido', chave };
  let ref = lerReferencia(f.external_reference);
  if (!ref && f.preapproval_id) {
    try {
      ref = lerReferencia((await mp.assinatura(f.preapproval_id)).external_reference);
    } catch { /* sem referência */ }
  }
  if (!ref) {
    await marcarEvento(env, chave);
    return { acao: 'ignorado', motivo: 'referência fora do checkout' };
  }
  const c = await lerContrato(env, ref.codigo);
  let titulo = null;
  // Aprovado vem pelo tópico "payment"; aqui só a recusa, para avisar já na 1ª.
  if (pg.status === 'rejected' || f.status === 'recycling') {
    titulo = `Mensalidade RECUSADA (tentativa ${f.retry_attempt || 1}) — ${c ? c.cliente.nome : 'contrato não encontrado'}`;
  }
  if (c) {
    anotar(c, `fatura ${f.id} ${f.status} pagamento ${pg.id || '-'} ${pg.status || '-'}`);
    await gravarContrato(env, c);
  }
  if (titulo) {
    await enviar(env, deps, titulo, [
      ...linhasCliente(c),
      ['Fatura', String(f.id)],
      ['Valor', reais(f.transaction_amount)],
      ['Situação', `${f.status} / pagamento ${pg.status || '-'} (${pg.status_detail || '-'})`],
      ['Próxima tentativa', f.next_retry_date ? brt(f.next_retry_date) : '-'],
    ], 'Até 4 tentativas em 10 dias; 3 parcelas recusadas cancelam a assinatura. Plano B: Pix.', f.live_mode === false);
  }
  await marcarEvento(env, chave);
  return { acao: `fatura ${f.status}`, avisado: Boolean(titulo) };
}

export async function processarNotificacao(env, mp, { tipo, id }, deps = {}) {
  switch (tipo) {
    case 'payment':
      return processarPagamento(env, mp, id, deps);
    case 'subscription_preapproval':
    case 'preapproval':
      return processarAssinatura(env, mp, id, deps);
    case 'subscription_authorized_payment':
    case 'authorized_payment':
      return processarFatura(env, mp, id, deps);
    default:
      return { acao: 'ignorado', motivo: `tópico ${tipo}` };
  }
}
