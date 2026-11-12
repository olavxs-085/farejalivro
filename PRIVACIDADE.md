# Política de privacidade do FarejaLivro

Última atualização: 12 de novembro de 2026 (versão 1.5)

O FarejaLivro é uma extensão do Google Chrome que acompanha o preço de livros em lojas online do Brasil e mostra indicações de livros. Esta política explica quais dados a extensão usa e onde eles ficam.

## Resumo

- A extensão não tem cadastro nem login.
- Seus livros, preços e preferências ficam no seu próprio computador, dentro do Chrome.
- Só sai do seu computador a indicação de livro que **você** decidir enviar, com os dados que você digitar.
- Nenhum dado é vendido. A extensão não usa rastreadores nem publicidade.

## O que fica guardado no seu computador

- Os livros que você escolheu acompanhar (título, autor, preço-alvo).
- Os links dos produtos que você marcou em cada loja.
- O histórico de preços de cada livro.
- As lojas ligadas ou desligadas e as lojas que você adicionou.
- Suas preferências: tema (claro ou escuro), frequência de conferência, tipos de aviso, som de latido e categorias de indicações que você segue.
- Uma cópia da lista de indicações publicadas, para mostrar quando você estiver sem internet.
- Um código aleatório desta instalação (veja abaixo).

Esses dados ficam no armazenamento local do Chrome (`chrome.storage` e `localStorage`). Eles são apagados quando você remove um livro ou desinstala a extensão.

## Indicações de livros

A aba **Indicações** mostra livros indicados pela equipe do FarejaLivro e por outros leitores. Para isso, a extensão baixa a lista de indicações publicadas do banco de dados do FarejaLivro, hospedado no Supabase. Esse download não envia nenhum dado seu.

Se você usar o botão **Indicar um livro**, a extensão envia para esse banco:

- o nome do livro, o autor, a categoria e o texto que você escreveu;
- o nome ou @ que você digitar, se quiser (o campo é opcional; em branco, a indicação fica anônima);
- um código aleatório desta instalação, criado pela própria extensão. Ele serve só para limitar a 3 indicações por dia e evitar spam. Ele não identifica você, seu e-mail ou seu computador.

A equipe lê cada indicação antes de publicar. Se for aprovada, o livro, o texto e o nome ou @ que você informou ficam visíveis para quem usa a extensão. O código da instalação nunca é mostrado. Indicações com links ou palavrões são recusadas automaticamente.

Para pedir a remoção de uma indicação sua, abra uma issue no repositório do FarejaLivro no GitHub informando o livro e o texto enviado.

## Links de afiliado

As indicações feitas pela **equipe** têm o botão **Comprar no Mercado Livre**, que é um link de afiliado. Se você comprar por ele, o FarejaLivro recebe uma comissão do Mercado Livre, sem custo a mais para você. O link só é aberto quando você clica no botão. O Mercado Livre pode registrar esse clique e usar cookies, sob a política de privacidade dele.

A extensão não muda nenhum outro link: os links de preço em **Meus livros**, os links das lojas e as indicações dos leitores não têm comissão. A extensão não mexe nas páginas que você visita.

## Acesso às páginas das lojas

Para descobrir o preço, a extensão abre as páginas de busca e de produto das lojas que você escolheu, como faria uma pessoa navegando. O conteúdo dessas páginas é lido só no seu computador, para encontrar título, preço e link. Nada desse conteúdo é enviado para outro lugar.

Algumas lojas só mostram o preço depois que a página termina de carregar. Nesses casos, a extensão abre a página numa janela minimizada por alguns segundos e fecha em seguida.

A extensão só acessa as lojas padrão (Amazon, Estante Virtual, Mercado Livre, Magazine Luiza, Livraria Leitura e Livraria da Travessa) e as lojas que você mesmo adicionar. Para cada loja adicionada, o Chrome pede a sua permissão antes.

## Capas dos livros

As capas das indicações podem ser carregadas da Open Library (openlibrary.org) ou do site da loja. Como em qualquer imagem da internet, esse site recebe o pedido da imagem.

## Links de apoio

A página da extensão mostra um QR code de Pix e um link para o Buy Me a Coffee, para quem quiser apoiar o projeto. Esses pagamentos acontecem no app do seu banco ou no site do Buy Me a Coffee, sob as regras deles. A extensão não recebe nem guarda nenhuma informação de pagamento.

## Mudanças nesta política

Se a política mudar, a nova versão será publicada neste mesmo endereço, com a data de atualização no topo.

## Contato

Dúvidas sobre privacidade podem ser enviadas pela página de issues do repositório do FarejaLivro no GitHub.
