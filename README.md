<p align="center">
  <img src="docs/img/promo-marquee-1400x560.png" alt="FarejaLivro" width="100%">
</p>

# FarejaLivro

Extensão gratuita para o Google Chrome que procura um livro nas lojas do Brasil, confere o preço todo dia e avisa quando ele cai. No dia 1 de cada mês, ela mostra um relatório com a variação de preço de cada loja.

![Tela principal do FarejaLivro](docs/img/captura-1-meus-livros.png)

## O que ela faz

- **Busca em várias lojas de uma vez.** Você digita o nome do livro e o autor, e ela mostra o resultado de cada loja com capa, edição e preço.
- **Você escolhe a edição.** O resultado mais parecido já vem marcado. É só confirmar ou trocar, para não acompanhar o e-book ou a edição errada.
- **Confere o preço todo dia.** Uma vez por dia, sempre que o Chrome estiver aberto.
- **Preço-alvo.** Defina um valor e receba uma notificação quando o livro chegar nele.
- **Relatório mensal.** O preço de cada loja no início e no fim do mês, o menor e o maior, a variação e um gráfico. Dá para salvar em PDF.
- **Modo claro e escuro.** Pode seguir o tema do computador ou ser escolhido na mão.

| Busca nas lojas | Relatório do mês |
| --- | --- |
| ![Resultados da busca](docs/img/captura-2-busca.png) | ![Relatório mensal](docs/img/captura-3-relatorio.png) |

## Lojas

Amazon, Estante Virtual (novos e usados), Mercado Livre, Magazine Luiza, Livraria Leitura e Livraria da Travessa.

Para adicionar outra livraria:

1. Abra o site da loja e pesquise a palavra **livro**.
2. Copie o endereço da página de resultados.
3. Na aba **Lojas** da extensão, cole o endereço, dê um nome e clique em **Adicionar loja**.

O Chrome vai pedir permissão para a extensão ler aquele site. A extensão testa a loja na hora e avisa se conseguiu ler os preços.

## Instalar

**Pela Chrome Web Store:** em breve.

**Direto do GitHub (1 minuto):**

1. Baixe o arquivo `farejalivro.zip` na página de [Releases](../../releases) e descompacte numa pasta que você não vá apagar.
   Se preferir, use **Code → Download ZIP** nesta página e, depois de descompactar, use a pasta `extension`.
2. No Chrome, abra `chrome://extensions`.
3. Ligue o **Modo do desenvolvedor**, no canto superior direito.
4. Clique em **Carregar sem compactação** e escolha a pasta da extensão (a que tem o arquivo `manifest.json` dentro).
5. Fixe o FarejaLivro na barra do Chrome pelo ícone de quebra-cabeça.

## Privacidade

Tudo fica no seu computador. A extensão não tem cadastro, não coleta dados e não envia nada para servidores. Ela só abre as páginas das lojas que você escolheu para ler o preço. Leia a [política de privacidade](PRIVACIDADE.md).

O FarejaLivro não tem relação com as lojas citadas. Os nomes das lojas pertencem aos seus donos.

## Como funciona por dentro

Extensão Manifest V3, em JavaScript puro, sem bibliotecas e sem build.

| Arquivo | Função |
| --- | --- |
| `extension/manifest.json` | Configuração, permissões e lojas com acesso liberado |
| `extension/stores.js` | Lojas padrão: endereço de busca e onde fica título, preço e link em cada uma |
| `extension/extractor.js` | Lê busca e página de produto. Usa os seletores da loja e, se falharem, um leitor genérico (JSON-LD, metatags, preço em destaque) |
| `extension/engine.js` | Busca, pontuação dos resultados, checagem diária, histórico e resumo do mês |
| `extension/background.js` | Alarme de hora em hora, checagem diária, notificações e aviso do relatório |
| `extension/offscreen.*` | Lê o HTML das lojas em segundo plano (o service worker não tem DOMParser) |
| `extension/app.*` | Página principal: busca, meus livros, lojas e apoio |
| `extension/report.*` | Relatório mensal com gráfico |
| `extension/theme.js` | Modo claro, escuro e automático |

Quando uma loja só mostra o preço depois de carregar a página, a extensão abre essa página numa janela minimizada, lê o preço e fecha.

## Contribuir

Achou uma loja que parou de funcionar ou quer sugerir uma nova? Abra uma [issue](../../issues).

Para ajustar uma loja padrão, edite a receita dela em `extension/stores.js`. Cada loja tem o endereço de busca (`{q}` é o termo pesquisado) e os seletores CSS do cartão do produto, do título, do preço e do link. Depois, recarregue a extensão em `chrome://extensions`.

## Apoie o projeto

O FarejaLivro é gratuito. Se ele te ajudou a pagar menos num livro, você pode apoiar com qualquer valor.

| Pix | Buy Me a Coffee |
| :---: | :---: |
| <img src="docs/img/qr-pix.png" width="220" alt="QR code Pix"> | <a href="https://www.buymeacoffee.com/oalvxs"><img src="docs/img/qr-bmc.png" width="220" alt="QR code Buy Me a Coffee"></a> |
| Qualquer valor | [buymeacoffee.com/oalvxs](https://www.buymeacoffee.com/oalvxs) |

## Licença

[MIT](LICENSE). Pode usar, copiar e modificar, mantendo o aviso de autoria.
