// Efeitos do site da Ativaleads (S41, 13/11/2026): revelação ao rolar, barra de progresso e a conversa
// encenada da peça 2 da abertura. Sem biblioteca e sem rastreamento. O HTML já traz tudo no estado final:
// sem JavaScript ou com "reduzir movimento" ligado, a página aparece pronta e nada se mexe.
(function () {
  var reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // As cenas da abertura começam depois que a página termina de abrir: até lá a capa fica no estado final
  // (é o que a pessoa vê de cara e o que o PageSpeed mede).
  var INICIO = 3000;
  var temObservador = 'IntersectionObserver' in window;

  function revelar() {
    var elementos = document.querySelectorAll('.reveal');

    if (reduzido || !temObservador) {
      elementos.forEach(function (elemento) { elemento.classList.add('visivel'); });
      return;
    }

    // A margem de cima cobre o que já passou da tela: quem pula direto para o fim (link do menu, #contato)
    // não deixa blocos invisíveis acima.
    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (entrada.isIntersecting) {
          entrada.target.classList.add('visivel');
          observador.unobserve(entrada.target);
        }
      });
    }, { rootMargin: '100000px 0px -8% 0px' });

    elementos.forEach(function (elemento) { observador.observe(elemento); });
  }

  function progresso() {
    var barra = document.querySelector('.progresso');
    var agendado = false;

    if (barra === null) {
      return;
    }

    function atualizar() {
      var total = document.documentElement.scrollHeight - window.innerHeight;

      barra.style.setProperty('--p', total > 0 ? Math.min(1, window.scrollY / total).toFixed(4) : '0');
      agendado = false;
    }

    window.addEventListener('scroll', function () {
      if (!agendado) {
        agendado = true;
        window.requestAnimationFrame(atualizar);
      }
    }, { passive: true });
    atualizar();
  }

  // Relógio que só anda com a cena na tela: fora dela, a espera fica pendente até ela voltar.
  function relogio(elemento) {
    var pendentes = [];
    var visivel = false;

    new IntersectionObserver(function (entradas) {
      visivel = entradas[0].isIntersecting;

      while (visivel && pendentes.length > 0) {
        pendentes.shift()();
      }
    }, { threshold: 0.3 }).observe(elemento);

    return function (ms) {
      return new Promise(function (resolver) {
        window.setTimeout(function () {
          if (visivel) {
            resolver();
          }
          else {
            pendentes.push(resolver);
          }
        }, ms);
      });
    };
  }

  function conversa(cena) {
    var lista = cena.querySelector('.msgs');
    var mensagens = Array.prototype.slice.call(cena.querySelectorAll('.msg'));
    var status = cena.querySelector('.pc-status');
    var esperar;

    if (lista === null || mensagens.length === 0 || reduzido || !temObservador) {
      return;
    }

    esperar = relogio(cena);
    // A peça mantém a altura final o tempo todo, para nada em volta pular.
    lista.style.minHeight = lista.offsetHeight + 'px';
    cena.classList.add('animada');

    function estado(mensagem, valor) {
      mensagem.setAttribute('data-estado', valor);
    }

    async function rodar() {
      await esperar(INICIO);
      for (;;) {
        mensagens.forEach(function (mensagem) {
          estado(mensagem, 'oculta');
          mensagem.classList.remove('lida');
        });
        cena.classList.remove('saindo');
        await esperar(900);

        for (var i = 0; i < mensagens.length; i++) {
          var mensagem = mensagens[i];
          var anterior = mensagens[i - 1];
          var daEmpresa = mensagem.classList.contains('env');

          if (anterior && anterior.classList.contains('env') && !daEmpresa) {
            anterior.classList.add('lida');
            await esperar(500);
          }

          if (status !== null) {
            status.textContent = daEmpresa ? 'digitando…' : 'online';
          }

          estado(mensagem, 'digitando');
          await esperar(900 + mensagem.textContent.length * 18);
          estado(mensagem, 'visivel');

          if (status !== null) {
            status.textContent = 'online';
          }

          await esperar(1100);
        }

        await esperar(3800);
        cena.classList.add('saindo');
        await esperar(600);
      }
    }

    rodar();
  }

  // Roteiro fixo: a seção fica presa na tela e a rolagem só troca o passo. Cada peça com data-n recebe
  // data-estado (antes, atual ou depois) e o CSS anima só opacity e transform.
  function roteiro(corpo) {
    var passos = corpo.querySelectorAll('.roteiro-texto').length;
    var fixo = corpo.querySelector('.roteiro-fixo');
    var conta = corpo.querySelector('.js-passo');
    var pecas = corpo.querySelectorAll('[data-n]');
    var agendado = false;

    function percurso() {
      return Math.max(corpo.offsetHeight - fixo.offsetHeight, 1);
    }

    function marcar(passo) {
      pecas.forEach(function (peca) {
        var n = Number(peca.getAttribute('data-n'));

        peca.setAttribute('data-estado', n < passo ? 'antes' : (n === passo ? 'atual' : 'depois'));

        if (peca.classList.contains('roteiro-ponto')) {
          peca.setAttribute('aria-current', n === passo ? 'step' : 'false');
        }
      });

      if (conta !== null) {
        conta.textContent = '0' + passo;
      }
    }

    function atualizar() {
      var progresso = Math.min(Math.max(-corpo.getBoundingClientRect().top / percurso(), 0), 1);
      var passo = Math.min(Math.floor(progresso * passos) + 1, passos);

      agendado = false;

      if (corpo.getAttribute('data-passo') !== String(passo)) {
        corpo.setAttribute('data-passo', String(passo));
        marcar(passo);
        corpo.querySelectorAll('.tela[data-estado="atual"]').forEach(contarNumeros);
      }
    }

    corpo.querySelectorAll('.roteiro-ponto').forEach(function (ponto) {
      ponto.addEventListener('click', function () {
        var n = Number(ponto.getAttribute('data-n'));
        var inicio = window.scrollY + corpo.getBoundingClientRect().top;

        window.scrollTo({ top: inicio + percurso() * (n - 0.5) / passos, behavior: reduzido ? 'auto' : 'smooth' });
      });
    });

    window.addEventListener('scroll', function () {
      if (!agendado) {
        agendado = true;
        window.requestAnimationFrame(atualizar);
      }
    }, { passive: true });
    // A altura do bloco fixo posiciona os pontos de encaixe da rolagem (CSS: --fixo-h).
    var textos = corpo.querySelector('.roteiro-textos');

    function medirFixo() {
      // Os textos dos passos ficam um sobre o outro; a caixa reserva a altura do mais alto, para nenhum
      // encostar no aparelho, qualquer que seja o tamanho de letra do celular.
      if (textos !== null) {
        var maior = 0;

        textos.querySelectorAll('.roteiro-texto').forEach(function (t) { maior = Math.max(maior, t.offsetHeight); });
        textos.style.minHeight = maior + 'px';
      }

      corpo.style.setProperty('--fixo-h', fixo.offsetHeight + 'px');
    }

    window.addEventListener('resize', function () { medirFixo(); atualizar(); });
    medirFixo();
    atualizar();
  }

  // Calendário da abertura: começa vazio, os dias aprovados ficam verdes um a um (até o dia 18), depois
  // aparecem os dias em produção, e o ciclo recomeça. O HTML traz o estado final.
  function calendario(cena) {
    var aprovados = Array.prototype.slice.call(cena.querySelectorAll('.cel.ok'));
    var producao = Array.prototype.slice.call(cena.querySelectorAll('.cel.prod'));
    var esperar;

    if (aprovados.length === 0 || reduzido || !temObservador) {
      return;
    }

    esperar = relogio(cena);

    async function rodar() {
      var i;

      await esperar(INICIO);
      for (;;) {
        aprovados.forEach(function (dia) { dia.classList.remove('ok', 'aprovando'); });
        producao.forEach(function (dia) { dia.classList.remove('prod'); });
        await esperar(1200);

        for (i = 0; i < aprovados.length; i++) {
          aprovados[i].classList.add('ok', 'aprovando');
          await esperar(300);
          aprovados[i].classList.remove('aprovando');
          await esperar(200);
        }

        await esperar(500);

        for (i = 0; i < producao.length; i++) {
          producao[i].classList.add('prod');
          await esperar(220);
        }

        await esperar(3500);
      }
    }

    rodar();
  }

  // Funil de vendas da abertura: os cartões passam de coluna em coluna (Nova conversa → Horário marcado → Venda),
  // um cliente novo chega, e o ciclo recomeça. O movimento é FLIP: mede antes, troca de coluna, anima a diferença.
  function funil(cena) {
    var cols = {};
    var cards = {};
    var vendas = cena.querySelector('.fn-vendas b');
    var esperar;

    cena.querySelectorAll('.fn-col').forEach(function (col) { cols[col.getAttribute('data-col')] = col; });
    cena.querySelectorAll('.fn-card').forEach(function (card) { cards[card.getAttribute('data-k')] = card; });

    if (!cols['1'] || reduzido || !temObservador) {
      return;
    }

    esperar = relogio(cena);

    function mover(card, col) {
      var antes = card.getBoundingClientRect();
      var outros = Array.prototype.filter.call(cena.querySelectorAll('.fn-card'), function (c) { return c !== card && !c.hidden; });
      var posOutros = outros.map(function (c) { return c.getBoundingClientRect(); });

      col.appendChild(card);
      [card].concat(outros).forEach(function (c, i) {
        var a = i === 0 ? antes : posOutros[i - 1];
        var d = c.getBoundingClientRect();

        c.style.transition = 'none';
        c.style.transform = 'translate(' + (a.left - d.left) + 'px,' + (a.top - d.top) + 'px)';
      });
      card.getBoundingClientRect();
      [card].concat(outros).forEach(function (c) {
        c.style.transition = 'transform .6s cubic-bezier(.2,.75,.2,1)';
        c.style.transform = '';
      });
    }

    function inicio() {
      cena.classList.remove('saindo');
      cols['1'].appendChild(cards.a);
      cols['1'].appendChild(cards.b);
      cols['2'].appendChild(cards.c);
      cols['3'].appendChild(cards.d);
      cards.e.hidden = true;
      cena.appendChild(cards.e);
      Object.keys(cards).forEach(function (k) { cards[k].style.transform = ''; cards[k].classList.remove('entra'); });
      if (vendas) { vendas.textContent = '1'; }
    }

    async function rodar() {
      await esperar(INICIO);
      for (;;) {
        inicio();
        await esperar(1500);
        mover(cards.b, cols['2']);
        await esperar(1400);
        mover(cards.c, cols['3']);
        if (vendas) { vendas.textContent = '2'; }
        await esperar(1400);
        cards.e.hidden = false;
        cards.e.classList.add('entra');
        cols['1'].appendChild(cards.e);
        await esperar(1400);
        mover(cards.a, cols['2']);
        await esperar(3200);
        cena.classList.add('saindo');
        await esperar(500);
      }
    }

    rodar();
  }

  // Números do painel (passo 4 do roteiro) contam até o valor quando a tela aparece.
  function contarNumeros(tela) {
    if (reduzido) {
      return;
    }

    tela.querySelectorAll('[data-alvo]').forEach(function (el) {
      var alvo = Number(el.getAttribute('data-alvo'));
      var inicio = performance.now();

      function passo(agora) {
        var t = Math.min((agora - inicio) / 900, 1);

        el.textContent = String(Math.round(alvo * (1 - Math.pow(1 - t, 3))));
        if (t < 1) { window.requestAnimationFrame(passo); }
      }

      window.requestAnimationFrame(passo);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    revelar();
    progresso();
    document.querySelectorAll('[data-conversa]').forEach(conversa);
    document.querySelectorAll('[data-calendario]').forEach(calendario);
    document.querySelectorAll('[data-funil]').forEach(funil);
    // Anúncio da abertura: a animação (só CSS) liga com a peça na tela e desliga fora dela.
    if (!reduzido && temObservador) {
      window.setTimeout(function () {
        document.querySelectorAll('[data-anuncio]').forEach(function (cena) {
          new IntersectionObserver(function (entradas) {
            cena.classList.toggle('animada', entradas[0].isIntersecting);
          }, { threshold: 0.3 }).observe(cena);
        });
      }, INICIO);
    }
    document.querySelectorAll('[data-roteiro]').forEach(function (corpo) {
      // No celular a rolagem encaixa em cada passo, para um gesto rápido não pular dois de uma vez.
      document.documentElement.classList.add('roteiro-snap');
      roteiro(corpo);
    });
  });
})();
