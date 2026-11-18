// GET /api/meios — meios de pagamento ativos na conta, com as imagens OFICIAIS do
// Mercado Pago (secure_thumbnail da API /v1/payment_methods). A página mostra as
// bandeiras e o Pix a partir daqui, sem logo copiado para o repositório.
// Resposta guardada no cache da Cloudflare por 1 dia.

import { json } from '../_lib/util.js';
import { criarCliente, resumoErro } from '../_lib/mp.js';
import { MEIOS_EXCLUIDOS } from '../_lib/precos.js';

const TIPOS = new Set(['credit_card', 'bank_transfer', 'account_money']);

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const chave = new Request(new URL('/api/meios?v=1', request.url).toString());
  if (cache) {
    const guardado = await cache.match(chave);
    if (guardado) return guardado;
  }
  try {
    const mp = criarCliente(env);
    const lista = await mp.chamar('GET', '/v1/payment_methods');
    const excluidos = new Set(MEIOS_EXCLUIDOS.map((m) => m.id));
    const meios = (Array.isArray(lista) ? lista : [])
      .filter((m) => m.status === 'active' && TIPOS.has(m.payment_type_id) && !excluidos.has(m.payment_type_id))
      .filter((m) => typeof m.secure_thumbnail === 'string' && m.secure_thumbnail.startsWith('https://'))
      .map((m) => ({ id: m.id, nome: m.name, tipo: m.payment_type_id, img: m.secure_thumbnail }));
    const r = json({ ok: true, meios }, 200, { 'cache-control': 'public, max-age=86400' });
    if (cache) {
      const p = cache.put(chave, r.clone());
      if (waitUntil) waitUntil(p); else await p;
    }
    return r;
  } catch (e) {
    console.log('meios falhou', resumoErro(e));
    return json({ ok: false, meios: [] }, 200);
  }
}
