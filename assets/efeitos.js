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
    window.addEventListener('resize', atualizar);
    atualizar();
  }

  // Calendário da abertura: os dias "em produção" vão sendo aprovados, um a um, e o ciclo recomeça.
  function calendario(cena) {
    var dias = Array.prototype.slice.call(cena.querySelectorAll('.cel.prod'));
    var esperar;

    if (dias.length === 0 || reduzido || !temObservador) {
      return;
    }

    esperar = relogio(cena);

    async function rodar() {
      for (;;) {
        dias.forEach(function (dia) {
          dia.classList.remove('ok', 'aprovando');
          dia.classList.add('prod');
        });
        await esperar(1600);

        for (var i = 0; i < dias.length; i++) {
          dias[i].classList.add('aprovando');
          dias[i].classList.replace('prod', 'ok');
          await esperar(350);
          dias[i].classList.remove('aprovando');
          await esperar(550);
        }

        await esperar(3200);
      }
    }

    rodar();
  }

  document.addEventListener('DOMContentLoaded', function () {
    revelar();
    progresso();
    document.querySelectorAll('[data-conversa]').forEach(conversa);
    document.querySelectorAll('[data-calendario]').forEach(calendario);
    document.querySelectorAll('[data-roteiro]').forEach(function (corpo) {
      // No celular a rolagem encaixa em cada passo, para um gesto rápido não pular dois de uma vez.
      document.documentElement.classList.add('roteiro-snap');
      roteiro(corpo);
    });
  });
})();
