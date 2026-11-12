# Ativaleads — site institucional

Site estático, sem framework, build, dependências, JavaScript de interação, fontes externas ou rastreamento. Uma única folha de estilos (`styles.css`, direção visual B "institucional" com topo e abertura brancos e logo verde, refeita na S38 em 11/11/2026) e a fonte Manrope auto-hospedada em `assets/fonts/`. O JSON-LD é dado estruturado, não código executável.

## Testar

Na raiz, execute `python -m http.server 8000` e abra http://localhost:8000. Confira também /privacidade/, /termos/ e /404.html. Em Cloudflare Pages, 404.html é usado para endereços inexistentes; o servidor Python exibe seu próprio erro nesses endereços.

## Estado

- **Fora do Google por decisão do Operador (11/11/2026):** todas as páginas têm `<meta name="robots" content="noindex">` e o `robots.txt` não aponta o `sitemap.xml`. Para voltar a indexar: tirar o `noindex` das páginas e devolver a linha `Sitemap: https://ativaleads.com.br/sitemap.xml` ao `robots.txt`.
- **Contato:** só e-mail, contato@ativaleads.com.br. O botão abre uma mensagem pronta com "Empresa / Cidade / Objetivo"; não há formulário nem armazenamento no site. WhatsApp comercial entra quando houver número oficial.
- **Privacidade:** a Ativaleads é agente de tratamento de pequeno porte e não indicou encarregado (art. 11 da Resolução CD/ANPD nº 2/2022); o canal é o e-mail comercial.
- **Caminho reservado:** `/eaaa/` é de outro site (exemplo de cliente), que entra em pasta própria e não usa o CSS deste. Não criar página, redirecionamento ou regra que ocupe esse caminho.
- Logos oficiais em `assets/logo/` (variantes branca e verde, WebP transparente). Favicon oficial em `assets/favicon.png` e `favicon.ico`.

## Cloudflare Pages

Usar a raiz como diretório de saída e deixar o comando de build vazio. Nenhuma função ou armazenamento é necessário. O repositório remoto é ativaleads/ativaleads-site (público: nada privado entra aqui); o GitHub Pages está desativado. Cada branch enviada ganha prévia em `<branch>.ativaleads-site-v1.pages.dev`. Confirmar o estado do deploy no domínio após atualizar a `main`.

Nunca armazenar contatos de interessados, chaves ou segredos neste repositório.

## Configuração externa (painel da Cloudflare, fora deste repositório)

A resposta HTTP do domínio inclui scripts inseridos pela Cloudflare (ofuscação de e-mail e, se ligado, Web Analytics) e um `robots.txt` gerenciado que substitui o deste repositório. Revisar no painel se for preciso cumprir à risca "sem scripts de terceiros"; a política de privacidade já menciona a análise de visitas.
