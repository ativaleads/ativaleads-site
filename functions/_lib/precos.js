// Tabela de preços do checkout da Ativaleads. É a ÚNICA fonte de valor:
// o navegador manda só o código do pacote, nunca o preço.
// Decisão do Operador em 17/11/2026: valores da S66, com Social + Tráfego em R$ 897
// ("social + trafeco vai par R$ 897", fala dele na S67; antes R$ 797).
// Mudar preço = mudar este arquivo, revisar e publicar.

export const IMPLANTACAO = {
  codigo: 'implantacao',
  titulo: 'Implantação Ativaleads',
  descricao: 'Relatório estratégico e implantação dos serviços contratados',
  valor: 4997.0,
  // Até 18x no Checkout Pro. O "3x sem juros" é configuração da CONTA no painel
  // do Mercado Pago (Parcelado vendedor, canal Checkout), não deste código.
  parcelasMax: 18,
};

export const PACOTES = {
  social: {
    codigo: 'social',
    titulo: 'Social',
    descricao: 'Gestão de redes sociais',
    mensal: 497.0,
  },
  trafego: {
    codigo: 'trafego',
    titulo: 'Tráfego',
    descricao: 'Gestão de tráfego pago',
    mensal: 597.0,
  },
  social_trafego: {
    codigo: 'social_trafego',
    titulo: 'Social + Tráfego',
    descricao: 'Gestão de redes sociais e de tráfego pago',
    mensal: 897.0,
  },
};

// Dias entre a assinatura e a 1ª mensalidade. 0 = o Mercado Pago cobra a 1ª
// parcela cerca de 1 hora depois de criar a assinatura (documentação F4).
// Decisão em aberto do Operador; ver ativaleads-ana/sessoes/S_checkout_mp.md.
export const INICIO_MENSALIDADE_DIAS = 0;

// Meios excluídos do Checkout Pro da implantação. "ticket" = boleto (fica dias
// pendente e custa R$ 3,49). Pix, cartão e saldo Mercado Pago continuam.
export const MEIOS_EXCLUIDOS = [{ id: 'ticket' }];

export function pacote(codigo) {
  return Object.prototype.hasOwnProperty.call(PACOTES, codigo) ? PACOTES[codigo] : null;
}

export function reais(v) {
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
