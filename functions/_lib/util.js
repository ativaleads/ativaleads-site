// Utilidades sem dependência (Web Crypto + fetch), iguais no Cloudflare e no Node 20+.

export function json(dados, status = 200, extra = {}) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      ...extra,
    },
  });
}

export function erro(mensagem, status = 400, codigo = 'erro') {
  return json({ ok: false, codigo, mensagem }, status);
}

const enc = new TextEncoder();

export function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256(texto) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(texto)));
}

export async function hmacSha256Hex(chave, mensagem) {
  const k = await crypto.subtle.importKey('raw', enc.encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(mensagem)));
}

// Comparação em tempo constante (para assinatura de webhook).
export function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Código do contrato: 128 bits aleatórios em base32 minúscula (sem 0/1/o/l para ler fácil).
// Não dá para adivinhar: é ele que abre a página de retorno do cliente.
const ALFA = 'abcdefghijkmnpqrstuvwxyz23456789';
export function novoCodigo(tamanho = 26) {
  const b = crypto.getRandomValues(new Uint8Array(tamanho));
  let s = '';
  for (const x of b) s += ALFA[x % ALFA.length];
  return s;
}

export function codigoValido(c) {
  return typeof c === 'string' && /^[a-z2-9]{26}$/.test(c);
}

export function soDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

export function cpfValido(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function cnpjValido(cnpj) {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

// Devolve { tipo: 'CPF'|'CNPJ', numero } ou null.
export function documento(s) {
  const d = soDigitos(s);
  if (d.length === 11 && cpfValido(d)) return { tipo: 'CPF', numero: d };
  if (d.length === 14 && cnpjValido(d)) return { tipo: 'CNPJ', numero: d };
  return null;
}

export function emailValido(e) {
  return typeof e === 'string' && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

export function nomeLimpo(n) {
  const s = String(n || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim();
  return s.length >= 2 && s.length <= 120 ? s : null;
}

export function mascararDoc(doc) {
  if (!doc) return '';
  const n = doc.numero;
  return doc.tipo === 'CPF' ? `***.${n.slice(3, 6)}.***-**` : `${n.slice(0, 2)}.***.***/${n.slice(8, 12)}-**`;
}

export function escaparHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Data/hora em BRT para os avisos ao Operador.
export function brt(d = new Date()) {
  return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export async function lerJson(request, limite = 8192) {
  const t = await request.text();
  if (t.length > limite) throw new Error('corpo grande demais');
  return t ? JSON.parse(t) : {};
}
