// Checkout da Ativaleads (checkout MP). Sem dependências; o cartão é digitado no campo seguro do
// Mercado Pago (Card Payment Brick), que devolve só um token de uso único.
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var pagina = document.body.getAttribute('data-pagina');
  var params = new URLSearchParams(location.search);
  var contrato = params.get('c');

  function reais(v) {
    return 'R$ ' + Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function api(caminho, corpo) {
    return fetch(caminho, corpo ? {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo)
    } : { headers: { accept: 'application/json' } }).then(function (r) {
      return r.json().catch(function () { return { ok: false, mensagem: 'Resposta inválida do servidor.' }; })
        .then(function (d) { d._status = r.status; return d; });
    });
  }
  function mostrar(id, sim) { var e = document.getElementById(id); if (e) e.hidden = !sim; }
  function texto(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }
  function marcaTeste(t) { if (t) mostrar('ck-teste', true); }

  // ---------- /contratar/ ----------
  function paginaContratar() {
    var form = $('#ck-form');
    var lista = $('#ck-pacotes');
    var precos;
    var inicial = params.get('pacote');

    function resumo() {
      var sel = form.querySelector('input[name=pacote]:checked');
      var p = sel && precos.pacotes.filter(function (x) { return x.codigo === sel.value; })[0];
      texto('ck-r-impl', reais(precos.implantacao.valor));
      texto('ck-r-mens', p ? reais(p.mensal) + '/mês' : '—');
    }

    api('/api/precos').then(function (d) {
      if (!d.ok) { texto('ck-erro', 'Não foi possível carregar os pacotes.'); return; }
      precos = d;
      marcaTeste(d.teste);
      lista.innerHTML = '';
      d.pacotes.forEach(function (p, i) {
        var l = document.createElement('label');
        l.className = 'ck-pacote';
        l.innerHTML = '<input type="radio" name="pacote" required><b></b><small></small><span class="preco"></span>';
        var inp = l.querySelector('input');
        inp.value = p.codigo;
        if (p.codigo === inicial || (!inicial && i === d.pacotes.length - 1)) inp.checked = true;
        l.querySelector('b').textContent = p.titulo;
        l.querySelector('small').textContent = p.descricao;
        l.querySelector('.preco').textContent = reais(p.mensal) + '/mês';
        lista.appendChild(l);
      });
      texto('ck-parcelas', 'Pix ou cartão em até ' + d.implantacao.parcelasMax + 'x');
      resumo();
      if (!d.disponivel) { texto('ck-erro', 'O checkout ainda não está ligado neste endereço.'); form.querySelector('button').disabled = true; }
    });

    // Bandeiras e meios com as imagens oficiais do Mercado Pago (via /api/meios).
    api('/api/meios').then(function (d) {
      var ul = document.getElementById('ck-meios');
      if (!ul || !d.ok) return;
      d.meios.forEach(function (m) {
        var li = document.createElement('li');
        var img = document.createElement('img');
        img.src = m.img;
        img.alt = m.nome;
        img.title = m.nome;
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        li.appendChild(img);
        ul.appendChild(li);
      });
    });

    form.addEventListener('change', function (e) { if (e.target.name === 'pacote') resumo(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var b = form.querySelector('button');
      texto('ck-erro', '');
      var sel = form.querySelector('input[name=pacote]:checked');
      var dados = {
        pacote: sel ? sel.value : '',
        nome: form.nome.value,
        email: form.email.value,
        documento: form.documento.value,
        aceite: form.aceite.checked
      };
      b.disabled = true;
      b.textContent = 'Abrindo o pagamento…';
      api('/api/contratar', dados).then(function (d) {
        if (d.ok && d.url) { location.href = d.url; return; }
        texto('ck-erro', d.mensagem || 'Não foi possível continuar.');
        b.disabled = false;
        b.textContent = 'Pagar a implantação';
      }).catch(function () {
        texto('ck-erro', 'Sem conexão. Tente de novo.');
        b.disabled = false;
        b.textContent = 'Pagar a implantação';
      });
    });
  }

  // ---------- /contratar/aprovado/ ----------
  function paginaAprovado() {
    if (!contrato) { mostrar('ck-sem', true); mostrar('ck-carregando', false); return; }
    var tentativas = 0;
    function carregar() {
      api('/api/contrato?c=' + encodeURIComponent(contrato)).then(function (d) {
        mostrar('ck-carregando', false);
        if (!d.ok) { mostrar('ck-sem', true); return; }
        marcaTeste(d.teste);
        texto('ck-nome', d.primeiroNome);
        var imp = d.implantacao.status;
        var ass = d.assinatura && d.assinatura.status;
        if (imp !== 'approved') {
          if (tentativas++ < 8 && (imp === 'aberto' || imp === 'pending' || imp === 'in_process')) {
            mostrar('ck-confirmando', true);
            setTimeout(carregar, 4000);
            return;
          }
          mostrar('ck-confirmando', false);
          var destino = (imp === 'rejected' || imp === 'cancelled') ? 'recusado' : 'pendente';
          location.replace('/contratar/' + destino + '/?c=' + encodeURIComponent(contrato));
          return;
        }
        mostrar('ck-confirmando', false);
        if (ass === 'authorized' || ass === 'pending' || ass === 'paused') { mostrar('ck-tudo-certo', true); return; }
        texto('ck-pacote-titulo', d.pacote.titulo + ' · ' + d.pacote.descricao);
        texto('ck-mensal', reais(d.pacote.mensal) + '/mês');
        mostrar('ck-mensalidade', true);
        cartao(d);
      }).catch(function () { mostrar('ck-carregando', false); texto('ck-erro', 'Sem conexão. Recarregue a página.'); });
    }
    carregar();
  }

  function cartao(d) {
    if (!d.chavePublica) { texto('ck-erro', 'Pagamento com cartão indisponível no momento.'); return; }
    var s = document.createElement('script');
    s.src = 'https://sdk.mercadopago.com/js/v2';
    s.onload = function () {
      var mp = new window.MercadoPago(d.chavePublica, { locale: 'pt-BR' });
      mp.bricks().create('cardPayment', 'ck-cartao', {
        initialization: { amount: d.pacote.mensal, payer: { email: d.email } },
        customization: {
          paymentMethods: { maxInstallments: 1, minInstallments: 1, types: { excluded: ['debit_card', 'prepaid_card'] } },
          visual: { style: { customVariables: { baseColor: '#007A3F' } }, texts: { formSubmit: 'Ativar a mensalidade' } }
        },
        callbacks: {
          onReady: function () {},
          onError: function (e) { console.log('brick', e); },
          onSubmit: function (f) {
            texto('ck-erro', '');
            return api('/api/assinar', {
              contrato: contrato,
              token: f.token,
              email: (f.payer && f.payer.email) || d.email
            }).then(function (r) {
              if (r.ok) {
                mostrar('ck-mensalidade', false);
                mostrar('ck-tudo-certo', true);
                return;
              }
              texto('ck-erro', r.mensagem || 'Não foi possível ativar a mensalidade.');
              throw new Error(r.codigo || 'erro');
            });
          }
        }
      });
    };
    s.onerror = function () { texto('ck-erro', 'Não foi possível carregar o pagamento com cartão.'); };
    document.head.appendChild(s);
  }

  // ---------- /contratar/pendente/ e /contratar/recusado/ ----------
  function paginaRetorno() {
    var link = $('#ck-conferir');
    if (link && contrato) link.href = '/contratar/aprovado/?c=' + encodeURIComponent(contrato);
    if (contrato) api('/api/contrato?c=' + encodeURIComponent(contrato)).then(function (d) { if (d.ok) marcaTeste(d.teste); });
    var b = $('#ck-de-novo');
    if (!b) return;
    if (!contrato) { b.hidden = true; return; }
    b.addEventListener('click', function () {
      b.disabled = true;
      b.textContent = 'Abrindo o pagamento…';
      api('/api/contratar', { contrato: contrato }).then(function (d) {
        if (d.ok && d.url) { location.href = d.url; return; }
        texto('ck-erro', d.mensagem || 'Não foi possível continuar.');
        b.disabled = false;
        b.textContent = 'Tentar de novo';
      });
    });
  }

  if (pagina === 'contratar') paginaContratar();
  else if (pagina === 'aprovado') paginaAprovado();
  else paginaRetorno();
})();
