// Registro dos contratos no KV da Cloudflare (binding CHECKOUT).
// Chaves:
//   contrato:<codigo>            → JSON do contrato
//   cliente:<hashDoc>:<pacote>   → código do contrato aberto daquele cliente e pacote
//   ev:<chave do evento>         → marca de evento já avisado (deduplicação, 120 dias)
// Sem CPF/CNPJ em claro: só o hash (com sal do ambiente) e a máscara.

import { sha256 } from './util.js';

const DIAS = 86400;

export function kv(env) {
  if (!env.CHECKOUT) throw new Error('KV CHECKOUT não está ligado a este ambiente');
  return env.CHECKOUT;
}

export async function hashDoc(env, numero) {
  return (await sha256(`${env.DOC_SAL || 'ativaleads-checkout'}:${numero}`)).slice(0, 32);
}

export async function lerContrato(env, codigo) {
  const v = await kv(env).get(`contrato:${codigo}`);
  return v ? JSON.parse(v) : null;
}

export async function gravarContrato(env, contrato) {
  contrato.atualizado = new Date().toISOString();
  await kv(env).put(`contrato:${contrato.codigo}`, JSON.stringify(contrato));
  return contrato;
}

export async function contratoDoCliente(env, hash, pacote) {
  const c = await kv(env).get(`cliente:${hash}:${pacote}`);
  return c ? lerContrato(env, c) : null;
}

export async function ligarCliente(env, hash, pacote, codigo) {
  await kv(env).put(`cliente:${hash}:${pacote}`, codigo);
}

export function anotar(contrato, texto) {
  contrato.historico = contrato.historico || [];
  contrato.historico.push({ em: new Date().toISOString(), texto });
  if (contrato.historico.length > 60) contrato.historico.splice(0, contrato.historico.length - 60);
}

export async function eventoJaVisto(env, chave) {
  return (await kv(env).get(`ev:${chave}`)) !== null;
}

export async function marcarEvento(env, chave) {
  await kv(env).put(`ev:${chave}`, new Date().toISOString(), { expirationTtl: 120 * DIAS });
}

// Referências externas: um contrato tem duas cobranças.
export const refImplantacao = (codigo) => `${codigo}-impl`;
export const refMensal = (codigo) => `${codigo}-mens`;

export function lerReferencia(ref) {
  const m = /^([a-z2-9]{26})-(impl|mens)$/.exec(String(ref || ''));
  return m ? { codigo: m[1], etapa: m[2] === 'impl' ? 'implantacao' : 'mensalidade' } : null;
}

export async function listarContratos(env, limite = 1000) {
  const out = [];
  let cursor;
  do {
    const r = await kv(env).list({ prefix: 'contrato:', cursor, limit: 1000 });
    for (const k of r.keys) {
      const c = await lerContrato(env, k.name.slice('contrato:'.length));
      if (c) out.push(c);
      if (out.length >= limite) return out;
    }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}
