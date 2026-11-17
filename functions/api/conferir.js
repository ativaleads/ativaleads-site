// POST /api/conferir  (cabeçalho authorization: Bearer <CONFERIR_TOKEN>)
// Rotina de conferência (E se… "webhook não chega" e "paga a implantação e não assina"):
//  1. Busca na API os pagamentos das últimas 48 h e processa como se fosse webhook
//     (idempotente: estado já avisado não é avisado de novo).
//  2. Implantação aprovada sem assinatura há mais de LEMBRETE_DIAS → lembrete ao Operador
//     (no máximo um por dia por contrato).
// Sem CONFERIR_TOKEN no ambiente a rota não existe (404). Quem chama: um agendador
// (pendente; Pages Functions não têm cron). Ver ativaleads-ana/sessoes/S68.md.

import { json, erro, iguais } from '../_lib/util.js';
import { criarCliente, resumoErro } from '../_lib/mp.js';
import { processarPagamento } from '../_lib/eventos.js';
import { listarContratos, eventoJaVisto, marcarEvento, lerReferencia } from '../_lib/contratos.js';
import { avisar, montarAviso } from '../_lib/avisos.js';
import { pacote, reais } from '../_lib/precos.js';

const LEMBRETE_DIAS = 3;

export async function onRequestPost({ request, env }) {
  if (!env.CONFERIR_TOKEN) return erro('não encontrado', 404);
  const auth = request.headers.get('authorization') || '';
  if (!iguais(auth, `Bearer ${env.CONFERIR_TOKEN}`)) return erro('não autorizado', 401);

  const mp = criarCliente(env);
  const saida = { pagamentos: [], lembretes: [], erros: [] };

  try {
    const r = await mp.pagamentosRecentes(48);
    for (const p of (r && r.results) || []) {
      if (!lerReferencia(p.external_reference)) continue;
      try {
        const x = await processarPagamento(env, mp, p.id);
        saida.pagamentos.push({ id: p.id, ...x });
      } catch (e) {
        saida.erros.push(`pagamento ${p.id}: ${resumoErro(e)}`);
      }
    }
  } catch (e) {
    saida.erros.push(`busca: ${resumoErro(e)}`);
  }

  const hoje = new Date().toISOString().slice(0, 10);
  for (const c of await listarContratos(env)) {
    const imp = c.implantacao || {};
    if (imp.status !== 'approved') continue;
    if (c.assinatura && ['authorized', 'pending', 'paused'].includes(c.assinatura.status)) continue;
    const desde = Date.parse(imp.em || c.atualizado || c.criado);
    if (!desde || Date.now() - desde < LEMBRETE_DIAS * 86400e3) continue;
    const chave = `lembrete:${c.codigo}:${hoje}`;
    if (await eventoJaVisto(env, chave)) continue;
    const pk = pacote(c.pacote);
    try {
      await avisar(env, montarAviso({
        titulo: `Implantação paga SEM mensalidade — ${c.cliente.nome}`,
        linhas: [
          ['Cliente', c.cliente.nome],
          ['E-mail', c.cliente.email],
          ['Pacote', `${pk.titulo} (${reais(pk.mensal)}/mês)`],
          ['Implantação aprovada em', new Date(desde).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })],
          ['Contrato', c.codigo],
        ],
        nota: `Mandar ao cliente o link para ativar a mensalidade: /contratar/aprovado/?c=${c.codigo}`,
        teste: env.MP_MODO !== 'producao',
      }));
      await marcarEvento(env, chave);
      saida.lembretes.push(c.codigo);
    } catch (e) {
      saida.erros.push(`lembrete ${c.codigo}: ${String(e.message || e)}`);
    }
  }
  return json({ ok: saida.erros.length === 0, ...saida });
}

export function onRequest() {
  return erro('Use POST.', 405, 'metodo');
}
