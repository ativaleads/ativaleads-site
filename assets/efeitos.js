// Efeitos do site da Ativaleads (S41, 13/11/2026): revelação ao rolar, barra de progresso e a conversa
// encenada da peça 2 da abertura. Sem biblioteca e sem rastreamento. O HTML já traz tudo no estado final:
// sem JavaScript ou com "reduzir movimento" ligado, a página aparece pronta e nada se mexe.
(function () {
  var reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  document.addEventListener('DOMContentLoaded', function () {
    revelar();
    progresso();
    document.querySelectorAll('[data-conversa]').forEach(conversa);
  });
})();
