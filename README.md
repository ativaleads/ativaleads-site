# Ativaleads — pré-lançamento

Site estático, sem framework, build, dependências, JavaScript de interação, fontes externas ou rastreamento. Uma única folha de estilos. O JSON-LD é dado estruturado, não código executável.

## Testar

Na raiz, execute `python -m http.server 8000` e abra http://localhost:8000. Confira também /privacidade/, /termos/ e /404.html. Em Cloudflare Pages, 404.html será usado para endereços inexistentes; o servidor Python exibe seu próprio erro nesses endereços.

## Antes de publicar

- E-mail comercial configurado: contato@ativaleads.com.br. O CTA leva ao contato e o link mailto abre uma mensagem pronta; o visitante precisa enviá-la em seu aplicativo. Não há formulário nem armazenamento no site.
- [WHATSAPP_COMERCIAL] permanece apenas como TODO no código, sem exibição pública, até existir um número oficial.
- Confirmar [ENCARREGADO_LGPD] e [CONTATO_ENCARREGADO_LGPD], mantidos como TODO interno. O contato público de privacidade usa o e-mail comercial informado.
- Domínio público confirmado: https://ativaleads.com.br, configurado em index.html, sitemap.xml e robots.txt.
- Logos oficiais fornecidos estão em assets/logo/, nas variantes branca e verde, em WebP transparente. Os originais PNG foram preservados. O favicon oficial fornecido está em assets/favicon.png e favicon.ico.
- Conferir a política com os fluxos reais antes de habilitar contato/captação. A política referencia a LGPD oficial.

## Cloudflare Pages

Usar a raiz como diretório de saída e deixar o comando de build vazio. Nenhuma função ou armazenamento é necessário. O repositório remoto é ativaleads/ativaleads-site; o GitHub Pages está desativado. O domínio responde pela Cloudflare. Confirmar o estado do deploy no domínio após atualizar a branch de produção.

Nunca armazenar contatos de interessados, chaves ou segredos neste repositório.

## Configuração externa pendente

A resposta HTTP do domínio contém scripts de análise (Cloudflare Web Analytics) e segurança inseridos pela Cloudflare. Eles não fazem parte dos arquivos deste repositório. Para cumprir integralmente a exigência de não carregar scripts de terceiros, revisar essa configuração no painel da Cloudflare e atualizar a política de privacidade após a alteração.
