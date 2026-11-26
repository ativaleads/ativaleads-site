/* Site de exemplo da Martinelli: scripts que podem esperar a página (S81, 26/11/2026: saíram do HTML para ele caber na primeira janela do TCP). Carrega com defer. */
(function(){var b=document.querySelector('.abre'),p=document.getElementById('painel');if(!b)return;b.addEventListener('click',function(){var a=p.classList.toggle('aberto');b.setAttribute('aria-expanded',a?'true':'false');});p.querySelectorAll('a').forEach(function(x){x.addEventListener('click',function(){p.classList.remove('aberto');b.setAttribute('aria-expanded','false');});});})();
/* faixa do Instagram (26/11/2026): carrossel de uma tela por vez, com setas, teclado e arrasto que acompanha o dedo e o mouse; telas 2 a 6 só carregam perto do uso */
(function(){document.querySelectorAll('.ig-visor').forEach(function(v){
  var tr=v.querySelector('.ig-trilho'),im=tr.children,n=im.length,i=0,a=v.querySelector('.ant'),b=v.querySelector('.prox'),ct=v.querySelector('.ig-conta');
  function carrega(k){var e=im[k];if(e&&e.dataset.src){e.src=e.dataset.src;e.removeAttribute('data-src')}}
  function ir(k){i=Math.max(0,Math.min(n-1,k));carrega(i);carrega(i+1);tr.style.transition='';tr.style.transform='translateX('+(-100*i)+'%)';a.disabled=i===0;b.disabled=i===n-1;ct.textContent='Tela '+(i+1)+' de '+n}
  a.addEventListener('click',function(){if(!arrastou)ir(i-1)});b.addEventListener('click',function(){if(!arrastou)ir(i+1)});
  v.addEventListener('keydown',function(e){if(e.key==='ArrowLeft')ir(i-1);if(e.key==='ArrowRight')ir(i+1)});
  var x0=null,dx=0,w=1,arrastou=false;
  /* o toque pode começar em cima da seta (o navegador puxa o toque para o botão mais perto): o arrasto vale também ali, e o clique que vier depois de um arrasto não conta */
  v.addEventListener('pointerdown',function(e){x0=e.clientX;dx=0;w=v.clientWidth;arrastou=false;carrega(i+1);tr.style.transition='none';if(!e.target.closest('.ig-seta'))try{v.setPointerCapture(e.pointerId)}catch(_){}});
  v.addEventListener('pointermove',function(e){if(x0===null)return;dx=e.clientX-x0;if((i===0&&dx>0)||(i===n-1&&dx<0))dx=dx/3;tr.style.transform='translateX(calc('+(-100*i)+'% + '+dx+'px))'});
  function solta(){if(x0===null)return;x0=null;if(Math.abs(dx)>w*.18){arrastou=true;setTimeout(function(){arrastou=false},0);ir(i+(dx<0?1:-1))}else ir(i)}
  v.addEventListener('pointerup',solta);v.addEventListener('pointercancel',solta);
  if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){if(es[0].isIntersecting){io.disconnect();carrega(1)}},{rootMargin:'200px'});io.observe(v)}else carrega(1);
});})();
/* flutuante do WhatsApp trava no rodapé (marca da Ativaleads, 26/11/2026; comportamento do site da Labate, S48). Versão com IntersectionObserver: não mede a página ao carregar (PageSpeed). Fonte: skill ativaleads-padrao-entrega, references/flutuante.js */
(function () {
  var F = 'flutua', V = 'rodape-vaga';
  var f = document.querySelector('.' + F), v = document.querySelector('.' + V);
  if (!f || !v || !('IntersectionObserver' in window)) return;
  var calmo = matchMedia('(prefers-reduced-motion: reduce)'), primeira = true, obs = null, pend = false;
  v.classList.add(V + '--espera');
  function desliza(parado) {
    if (calmo.matches) return;
    var de = parado ? f : v, para = parado ? v : f, a = de.getBoundingClientRect(), b = para.getBoundingClientRect();
    var dx = (a.left + a.right) / 2 - (b.left + b.right) / 2;
    if (Math.abs(dx) < 1) return;
    para.style.transition = 'none'; para.style.transform = 'translateX(' + dx + 'px)';
    void para.offsetWidth;
    para.style.transition = 'transform .28s ease'; para.style.transform = '';
    setTimeout(function () { para.style.transition = ''; }, 300);
  }
  function troca(parado) {
    var antes = !v.classList.contains(V + '--espera');
    if (parado !== antes && !primeira) desliza(parado);
    f.classList.toggle(F + '--parado', parado);
    v.classList.toggle(V + '--espera', !parado);
    primeira = false;
  }
  function arma() {
    pend = false;
    if (obs) obs.disconnect();
    var cs = getComputedStyle(f);
    if (cs.display === 'none') { f.classList.remove(F + '--parado'); v.classList.remove(V + '--espera'); return; }
    var linha = Math.round(parseFloat(cs.bottom) + f.offsetHeight);
    obs = new IntersectionObserver(function (es) {
      var e = es[es.length - 1];
      troca(e.boundingClientRect.top <= e.rootBounds.bottom + 0.5);
    }, { rootMargin: '0px 0px -' + linha + 'px 0px', threshold: [0, 1] });
    obs.observe(v);
  }
  function pede() { if (!pend) { pend = true; requestAnimationFrame(arma); } }
  function depois() { (window.requestIdleCallback || function (fn) { setTimeout(fn, 200); })(arma); }
  if (document.readyState === 'complete') depois(); else addEventListener('load', depois);
  addEventListener('resize', pede);
})();
