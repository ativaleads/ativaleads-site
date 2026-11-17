// POST /api/mp-webhook — notificações do Mercado Pago (Webhooks).
// 1. Confere x-signature (HMAC SHA-256 com MP_WEBHOOK_SECRET). Inválida → 401.
// 2. Busca o recurso pela API (nunca confia no corpo), atualiza o contrato, avisa o Operador.
// 3. Responde 200 bem antes de 22 s. Falha interna → 500, e o MP reenvia a cada 15 min
//    (seguro: cada estado só é avisado uma vez).
//
// MP_WEBHOOK_SEM_ASSINATURA = "aceitar" deixa passar aviso SEM cabeçalho x-signature
// (assinatura presente e errada continua 401). Existe porque a documentação diz que, no
// Brasil, assinaturas não usam o webhook configurado no painel; o teste mede se os avisos
// vindos do notification_url trazem x-signature. Mesmo assim o recurso é lido da API.

import { json, erro } from '../_lib/util.js';
import { conferirAssinatura } from '../_lib/assinatura.js';
import { criarCliente, resumoErro } from '../_lib/mp.js';
import { processarNotificacao } from '../_lib/eventos.js';

const LIMITE_MS = 18000;

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const texto = await request.text();
  if (texto.length > 16384) return erro('corpo grande demais', 413);
  let corpo = {};
  try {
    corpo = texto ? JSON.parse(texto) : {};
  } catch {
    corpo = {};
  }

  const tipo = url.searchParams.get('type') || url.searchParams.get('topic') || corpo.type || corpo.topic || '';
  const dataIdUrl = url.searchParams.get('data.id') || url.searchParams.get('id') || '';
  const id = dataIdUrl || (corpo.data && corpo.data.id) || '';

  const xSignature = request.headers.get('x-signature');
  const requestId = request.headers.get('x-request-id');
  if (xSignature || env.MP_WEBHOOK_SEM_ASSINATURA !== 'aceitar') {
    const v = await conferirAssinatura({ xSignature, requestId, dataId: dataIdUrl, segredo: env.MP_WEBHOOK_SECRET });
    if (!v.ok) {
      console.log('webhook recusado', v.motivo, tipo, id);
      return erro('assinatura inválida', 401, 'assinatura');
    }
  } else {
    console.log('webhook sem x-signature aceito por configuração', tipo, id);
  }

  if (!tipo || !id || !/^[A-Za-z0-9_-]{1,64}$/.test(String(id))) {
    return json({ ok: true, acao: 'ignorado', motivo: 'sem tipo ou id' });
  }

  let mp;
  try {
    mp = criarCliente(env);
  } catch {
    return erro('sem configuração', 500, 'sem_config');
  }

  try {
    const r = await Promise.race([
      processarNotificacao(env, mp, { tipo, id: String(id) }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), LIMITE_MS)),
    ]);
    console.log('webhook', tipo, id, JSON.stringify(r));
    return json({ ok: true, ...r, assinado: Boolean(xSignature) });
  } catch (e) {
    console.log('webhook falhou', tipo, id, resumoErro(e));
    return erro('falha ao processar; reenviar', 500, 'processamento');
  }
}

export function onRequest() {
  return erro('Use POST.', 405, 'metodo');
}
