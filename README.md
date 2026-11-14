# Ativaleads — site institucional

Site estático, sem framework, build, dependências, fontes externas ou rastreamento. Desde a S41 há um script próprio pequeno (`assets/efeitos.js`: revelação ao rolar, barra de progresso e a conversa encenada da abertura); o HTML traz o estado final, então sem JavaScript ou com "reduzir movimento" a página aparece pronta. Uma única folha de estilos (`styles.css`, modelo de referência helenacrm.com com peças próprias do serviço na abertura, refeito na S41 em 13/11/2026) e a fonte Manrope auto-hospedada em `assets/fonts/`. O JSON-LD é dado estruturado, não código executável.

## Testar

Na raiz, execute `python -m http.server 8000` e abra http://localhost:8000 (página "em breve") e http://localhost:8000/ativaleads/ (site). Confira também /ativaleads/privacidade/, /ativaleads/termos/ e /404.html. Em Cloudflare Pages, 404.html é usado para endereços inexistentes; o servidor Python exibe seu próprio erro nesses endereços.

## Estado

- **Estrutura desde a S41 (13/11/2026):** a raiz (`index.html`) é a página "em breve" com o logo animado (camadas em `assets/logo/anim/`, só CSS). O site institucional fica em `/ativaleads/` (com `/ativaleads/privacidade/` e `/ativaleads/termos/`); `_redirects` leva os endereços antigos `/privacidade/` e `/termos/` para lá. `styles.css`, `assets/` e `404.html` continuam na raiz.
- **Fora do Google por decisão do Operador (11/11/2026):** todas as páginas têm `<meta name="robots" content="noindex">` e o `robots.txt` não aponta o `sitemap.xml`. Para voltar a indexar: tirar o `noindex` das páginas e devolver a linha `Sitemap: https://ativaleads.com.br/sitemap.xml` ao `robots.txt`.
- **Contato:** WhatsApp da Ana (+55 11 96969-2055, assistente virtual) na chamada final, com mensagem pronta; e-mail contato@ativaleads.com.br no rodapé, nos termos e na privacidade. Não há formulário nem armazenamento no site.
- **Privacidade:** a Ativaleads é agente de tratamento de pequeno porte e não indicou encarregado (art. 11 da Resolução CD/ANPD nº 2/2022); o canal é o e-mail comercial.
- **Caminho reservado:** `/eaaa/` e `/vitocasella/` são de outros sites (clientes), que entra em pasta própria e não usa o CSS deste. Não criar página, redirecionamento ou regra que ocupe esse caminho.
- Logos oficiais em `assets/logo/` (variantes branca e verde, WebP transparente). Favicon oficial em `assets/favicon.png` e `favicon.ico`.

## Cloudflare Pages

Usar a raiz como diretório de saída e deixar o comando de build vazio. Nenhuma função ou armazenamento é necessário. O repositório remoto é ativaleads/ativaleads-site (público: nada privado entra aqui); o GitHub Pages está desativado. Cada branch enviada ganha prévia em `<branch>.ativaleads-site-v1.pages.dev`. Confirmar o estado do deploy no domínio após atualizar a `main`.

Nunca armazenar contatos de interessados, chaves ou segredos neste repositório.

## Configuração externa (painel da Cloudflare, fora deste repositório)

A resposta HTTP do domínio inclui scripts inseridos pela Cloudflare (ofuscação de e-mail e, se ligado, Web Analytics) e um `robots.txt` gerenciado que substitui o deste repositório. Revisar no painel se for preciso cumprir à risca "sem scripts de terceiros"; a política de privacidade já menciona a análise de visitas.
