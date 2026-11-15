# Ativaleads — site institucional

Site estático, sem framework, build, dependências, fontes externas ou rastreamento. Desde a S41 há um script próprio pequeno (`assets/efeitos.js`: revelação ao rolar, barra de progresso e a conversa encenada da abertura); o HTML traz o estado final, então sem JavaScript ou com "reduzir movimento" a página aparece pronta. Uma única folha de estilos (`styles.css`, modelo de referência helenacrm.com com peças próprias do serviço na abertura, refeito na S41 em 13/11/2026) e a fonte Manrope auto-hospedada em `assets/fonts/`. O JSON-LD é dado estruturado, não código executável.

## Testar

Na raiz, execute `python -m http.server 8000` e abra http://localhost:8000 (página "em breve") e http://localhost:8000/ativaleads/ (site). Confira também /ativaleads/privacidade/, /ativaleads/termos/ e /404.html. Em Cloudflare Pages, 404.html é usado para endereços inexistentes; o servidor Python exibe seu próprio erro nesses endereços.

## Estado

- **CSS embutido na página principal (S41, PageSpeed 100):** `ativaleads/index.html` traz o `styles.css` dentro de `<style>` (entre `<!-- css:inicio -->` e `<!-- css:fim -->`). A fonte é o `styles.css`; depois de mudar o CSS, rodar `python _preview/s41/embutir_css.py` (fora do git, no clone de trabalho) ou colar o arquivo no bloco. As outras páginas usam o `<link>` com `?v=`.
- **Estrutura desde a S41 (13/11/2026):** a raiz (`index.html`) é a página "em breve" com o logo animado (camadas em `assets/logo/anim/`, só CSS). O site institucional fica em `/ativaleads/` (com `/ativaleads/privacidade/` e `/ativaleads/termos/`); `_redirects` leva os endereços antigos `/privacidade/` e `/termos/` para lá. `styles.css`, `assets/` e `404.html` continuam na raiz.
- **Fora do Google por decisão do Operador (11/11/2026):** todas as páginas têm `<meta name="robots" content="noindex">` e o `robots.txt` não aponta o `sitemap.xml`. Para voltar a indexar: tirar o `noindex` das páginas e devolver a linha `Sitemap: https://ativaleads.com.br/sitemap.xml` ao `robots.txt`.
- **Capa enxuta (S47, 15/11/2026, Operador: "tá muita informação ali"):** a capa tem só a etiqueta, um título curto, uma frase de apoio e o botão. A lista de serviços, os relatórios e os ativos ficam nas seções de baixo (Serviços e faixa), nunca no texto da capa. Etiqueta: "Estratégia, tráfego pago e redes sociais" (Operador: "colocamos a parte de estratégia ou vai poluir?" → "aprovado"): a estratégia entra no lugar de "Gestão de", sem somar palavras; etiqueta numa linha só, inclusive a 320 px com letra normal. O `<title>` e o og seguem "Gestão de tráfego pago e de redes sociais". Texto: "Seu próximo cliente começa com **uma conexão.**" (no computador em duas linhas, quebrando pelo sentido: "Seu próximo cliente / começa com uma conexão." — Operador: "uma conexão. na mesma linha de começa com"; a partir de 960 px a letra do título acompanha a largura da coluna, `min(2.85rem, 100cqi / 12.6)`, e `.linha` não quebra; no celular fica "Seu próximo cliente / começa com / uma conexão.") + "Ele está no Google, no Instagram e no WhatsApp. Planejamos, executamos e medimos o marketing digital de empresas, marcas e profissionais."
- **Botão da capa (S47, 15/11/2026, Operador: "quero um CTA impactante" → "era Conversar com a A.N.A."):** **"Conversar com a A.N.A."**, com o símbolo do WhatsApp, abrindo direto a conversa (`wa.me`, mesma mensagem pronta da chamada final). O título promete uma conexão e o clique já entrega: quem chega experimenta o produto na hora. Não usar o nome da empresa ("Fale com a Ativaleads") no botão.
- **Títulos de seção (S47, 15/11/2026, Operador: "todos os titulos de sessão preto em cima, verde em baixo"):** em título de duas cores a parte preta fica em cima e a verde começa sempre numa linha nova (`.cab h2 > .verde, .chamada h2 > .verde { display: block; }`), em qualquer largura. A troca de cor nunca cai no meio da linha. Título novo de seção segue o mesmo molde: `Texto preto <span class="verde">texto verde</span>`.
- **Celular estreito com letra grande (S47):** medir também 320 px com a letra a 125%. Palavra longa em título (ex.: "acompanhamento") e botão com `nowrap` empurram a página para o lado; abaixo de 400 px os títulos de seção usam `min(1.9rem, 10vw)` e o botão da chamada da Ana pode quebrar linha.
- **Contato:** WhatsApp da Ana (+55 11 96969-2055, assistente virtual) na chamada final, com mensagem pronta; e-mail contato@ativaleads.com.br no rodapé, nos termos e na privacidade. Não há formulário nem armazenamento no site.
- **Privacidade:** a Ativaleads é agente de tratamento de pequeno porte e não indicou encarregado (art. 11 da Resolução CD/ANPD nº 2/2022); o canal é o e-mail comercial.
- **Caminho reservado:** `/eaaa/` e `/vitocasella/` são de outros sites (clientes), que entra em pasta própria e não usa o CSS deste. Não criar página, redirecionamento ou regra que ocupe esse caminho.
- Logos oficiais em `assets/logo/` (variantes branca e verde, WebP transparente). Favicon oficial em `assets/favicon.png` e `favicon.ico`.

## Cloudflare Pages

Usar a raiz como diretório de saída e deixar o comando de build vazio. Nenhuma função ou armazenamento é necessário. O repositório remoto é ativaleads/ativaleads-site (público: nada privado entra aqui); o GitHub Pages está desativado. Cada branch enviada ganha prévia em `<branch>.ativaleads-site-v1.pages.dev`. Confirmar o estado do deploy no domínio após atualizar a `main`.

Nunca armazenar contatos de interessados, chaves ou segredos neste repositório.

## Configuração externa (painel da Cloudflare, fora deste repositório)

A resposta HTTP do domínio inclui scripts inseridos pela Cloudflare (ofuscação de e-mail e, se ligado, Web Analytics) e um `robots.txt` gerenciado que substitui o deste repositório. Revisar no painel se for preciso cumprir à risca "sem scripts de terceiros"; a política de privacidade já menciona a análise de visitas.
