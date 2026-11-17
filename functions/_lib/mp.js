// Cliente mínimo da API do Mercado Pago (só o que o checkout usa).
// O access token vem do ambiente (segredo da Cloudflare); nunca de arquivo.

const BASE = 'https://api.mercadopago.com';

export class ErroMP extends Error {
  constructor(status, corpo, caminho) {
    super(`Mercado Pago ${status} em ${caminho}`);
    this.status = status;
    this.corpo = corpo;
    this.caminho = caminho;
  }
}

export function criarCliente(env, { fetchFn = fetch, timeoutMs = 8000 } = {}) {
  const token = env.MP_ACCESS_TOKEN;
  if (!token) throw new Error('MP_ACCESS_TOKEN ausente no ambiente');

  async function chamar(metodo, caminho, corpo, { idempotencia } = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
      if (idempotencia) headers['x-idempotency-key'] = idempotencia;
      const r = await fetchFn(BASE + caminho, {
        method: metodo,
        headers,
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: ctl.signal,
      });
      const texto = await r.text();
      let dados;
      try {
        dados = texto ? JSON.parse(texto) : null;
      } catch {
        dados = { bruto: texto.slice(0, 500) };
      }
      if (!r.ok) throw new ErroMP(r.status, dados, caminho);
      return dados;
    } finally {
      clearTimeout(t);
    }
  }

  return {
    chamar,
    criarPreferencia: (p, chave) => chamar('POST', '/checkout/preferences', p, { idempotencia: chave }),
    pagamento: (id) => chamar('GET', `/v1/payments/${encodeURIComponent(id)}`),
    pagamentosPorReferencia: (ref) =>
      chamar('GET', `/v1/payments/search?sort=date_created&criteria=desc&limit=30&external_reference=${encodeURIComponent(ref)}`),
    pagamentosRecentes: (horas = 48) => {
      const fim = new Date();
      const ini = new Date(fim.getTime() - horas * 3600e3);
      return chamar(
        'GET',
        `/v1/payments/search?sort=date_created&criteria=desc&limit=100&range=date_created&begin_date=${ini.toISOString()}&end_date=${fim.toISOString()}`,
      );
    },
    criarAssinatura: (a, chave) => chamar('POST', '/preapproval', a, { idempotencia: chave }),
    assinatura: (id) => chamar('GET', `/preapproval/${encodeURIComponent(id)}`),
    assinaturasPorReferencia: (ref) => chamar('GET', `/preapproval/search?external_reference=${encodeURIComponent(ref)}`),
    fatura: (id) => chamar('GET', `/authorized_payments/${encodeURIComponent(id)}`),
  };
}

// Detalhe legível de um erro do MP para o log (sem token, que nunca vai no corpo).
export function resumoErro(e) {
  if (e instanceof ErroMP) {
    const c = e.corpo || {};
    const causa = Array.isArray(c.cause) ? c.cause.map((x) => x.description || x.code).join('; ') : '';
    return `${e.status} ${c.message || c.error || ''} ${causa}`.trim();
  }
  return String(e && e.message ? e.message : e);
}
