// Aviso ao Operador. Decisão D5 (17/11/2026): e-mail hoje; WhatsApp quando estiver configurado.
// Todo aviso também fica no KV (aviso:<data>) por 30 dias, como registro e evidência de teste.
//
// Ambiente:
//   AVISO_EMAIL_PARA       destino (e-mail do Operador)
//   AVISO_EMAIL_DE         remetente (ex.: checkout@ativaleads.com.br, domínio liberado no provedor)
//   AVISO_EMAIL_PROVEDOR   "cloudflare" (Email Service, REST) ou "resend"
//   CF_ACCOUNT_ID + CF_EMAIL_TOKEN   (segredo) se provedor = cloudflare
//   RESEND_API_KEY                    (segredo) se provedor = resend
//   AVISO_WHATSAPP_URL + AVISO_WHATSAPP_TOKEN (segredo)  canal futuro: POST {texto}

import { escaparHtml, novoCodigo } from './util.js';

async function enviarEmail(env, { assunto, texto, html }, fetchFn) {
  const para = env.AVISO_EMAIL_PARA;
  const de = env.AVISO_EMAIL_DE;
  const provedor = env.AVISO_EMAIL_PROVEDOR;
  if (!para || !de || !provedor) return { canal: 'email', estado: 'desligado' };

  let r;
  if (provedor === 'cloudflare') {
    if (!env.CF_ACCOUNT_ID || !env.CF_EMAIL_TOKEN) return { canal: 'email', estado: 'sem credencial' };
    r = await fetchFn(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CF_EMAIL_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ to: para, from: de, subject: assunto, text: texto, html }),
    });
  } else if (provedor === 'resend') {
    if (!env.RESEND_API_KEY) return { canal: 'email', estado: 'sem credencial' };
    r = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: de, to: [para], subject: assunto, text: texto, html }),
    });
  } else {
    return { canal: 'email', estado: `provedor desconhecido: ${provedor}` };
  }
  const corpo = (await r.text()).slice(0, 300);
  if (!r.ok) throw new Error(`e-mail falhou (${provedor} ${r.status}): ${corpo}`);
  return { canal: 'email', estado: 'enviado', provedor };
}

async function enviarWhatsapp(env, { assunto, texto }, fetchFn) {
  if (!env.AVISO_WHATSAPP_URL || !env.AVISO_WHATSAPP_TOKEN) return { canal: 'whatsapp', estado: 'desligado' };
  const r = await fetchFn(env.AVISO_WHATSAPP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-aviso-token': env.AVISO_WHATSAPP_TOKEN },
    body: JSON.stringify({ texto: `${assunto}\n\n${texto}` }),
  });
  if (!r.ok) throw new Error(`WhatsApp falhou (${r.status})`);
  return { canal: 'whatsapp', estado: 'enviado' };
}

// linhas: [[rótulo, valor], ...]
export function montarAviso({ titulo, linhas, nota, teste }) {
  const prefixo = teste ? '[TESTE] ' : '';
  const assunto = `${prefixo}Checkout Ativaleads: ${titulo}`;
  const texto = [titulo, '', ...linhas.map(([k, v]) => `${k}: ${v}`), ...(nota ? ['', nota] : [])].join('\n');
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a">` +
    (teste ? `<p style="background:#fff3cd;padding:6px 10px;margin:0 0 12px">AMBIENTE DE TESTE — nenhum dinheiro real</p>` : '') +
    `<h2 style="color:#007A3F;margin:0 0 12px">${escaparHtml(titulo)}</h2><table cellpadding="4" style="border-collapse:collapse">` +
    linhas.map(([k, v]) => `<tr><td style="color:#555">${escaparHtml(k)}</td><td><b>${escaparHtml(v)}</b></td></tr>`).join('') +
    `</table>` +
    (nota ? `<p style="margin-top:14px">${escaparHtml(nota)}</p>` : '') +
    `</div>`;
  return { assunto, texto, html };
}

// Envia por todos os canais ligados. Falha de canal ligado = exceção (o webhook
// responde 500 e o Mercado Pago reenvia em 15 min). Canal desligado não é falha.
export async function avisar(env, aviso, { fetchFn = fetch } = {}) {
  const resultados = [];
  const falhas = [];
  for (const canal of [enviarEmail, enviarWhatsapp]) {
    try {
      resultados.push(await canal(env, aviso, fetchFn));
    } catch (e) {
      falhas.push(String(e.message || e));
    }
  }
  if (env.CHECKOUT) {
    const chave = `aviso:${new Date().toISOString()}:${novoCodigo(6)}`;
    await env.CHECKOUT.put(chave, JSON.stringify({ assunto: aviso.assunto, texto: aviso.texto, resultados, falhas }), {
      expirationTtl: 30 * 86400,
    });
  }
  if (falhas.length) throw new Error(falhas.join(' | '));
  return resultados;
}
