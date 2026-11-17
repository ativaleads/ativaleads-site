// Conferência do cabeçalho x-signature dos webhooks do Mercado Pago.
// Documentação (17/11/2026): manifest "id:[data.id];request-id:[x-request-id];ts:[ts];",
// HMAC SHA-256 em hexadecimal com a chave secreta do webhook da aplicação.
// data.id vem da QUERY da URL; se tiver letras, vai em minúsculas.
// Se data.id ou x-request-id faltar, a parte some do manifest.

import { hmacSha256Hex, iguais } from './util.js';

export function lerCabecalho(x) {
  const out = {};
  for (const parte of String(x || '').split(',')) {
    const i = parte.indexOf('=');
    if (i > 0) out[parte.slice(0, i).trim()] = parte.slice(i + 1).trim();
  }
  return out;
}

export function montarManifest({ dataId, requestId, ts }) {
  let m = '';
  if (dataId) m += `id:${/[a-z]/i.test(dataId) ? String(dataId).toLowerCase() : dataId};`;
  if (requestId) m += `request-id:${requestId};`;
  m += `ts:${ts};`;
  return m;
}

// Devolve { ok, motivo }.
export async function conferirAssinatura({ xSignature, requestId, dataId, segredo }) {
  if (!segredo) return { ok: false, motivo: 'segredo do webhook não configurado' };
  if (!xSignature) return { ok: false, motivo: 'sem cabeçalho x-signature' };
  const { ts, v1 } = lerCabecalho(xSignature);
  if (!ts || !v1) return { ok: false, motivo: 'x-signature sem ts ou v1' };
  const esperado = await hmacSha256Hex(segredo, montarManifest({ dataId, requestId, ts }));
  return iguais(esperado, v1.toLowerCase()) ? { ok: true, ts } : { ok: false, motivo: 'assinatura não confere' };
}
