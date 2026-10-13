# Site da Nova FM 87,5 — guia rápido

## O que dá para editar pelo painel (`novafmsbs.com.br/admin`)

| Seção do painel | O que muda no site |
|---|---|
| **Campanha / Banner** | Faixa de aviso no topo (liga/desliga, texto, botão, cor, data para sumir) |
| **Programação** | Grade de Seg–Sex, Sábado e Domingo. O site destaca sozinho o que está **no ar**, mostra "A seguir" e monta os horários no card de cada locutor |
| **Locutores** | Nome, apelido, foto, cor, Instagram e "Mostrar na seção Locutores" (liga/desliga o card sem apagar o cadastro). Sem foto aparece a logo da Nova |
| **Apoiadores** | Nome, logo (opcional) e link (opcional) da faixa de apoiadores |
| **Contato e redes** | WhatsApp do estúdio, **WhatsApp comercial (opcional — usado pelo formulário da página Anuncie; vazio = usa o do estúdio)**, endereço do portal de notícias e redes sociais (Instagram, Facebook, YouTube, TikTok) — cada rede vira um card "Seguir" no site |

> Dica: em **Programação → Apresentadores**, escreva o nome **igual** ao cadastrado em Locutores
> para a foto aparecer na grade e o selo "No ar" acender no card do locutor.

## Como o site funciona

```
index.html            página inicial: abertura + player, programa no ar, notícias, programação, equipe,
                      promoções (com últimos ganhadores), redes sociais e anunciantes
anuncie.html          página comercial (formatos reais + formulário que abre o WhatsApp) — endereço /anuncie
privacidade.html      política de privacidade da rádio (LGPD) — endereço /privacidade
assets/site.css       visual (cores, tipografia e espaçamentos ficam como variáveis no topo, em :root)
assets/app.js         player, tocando agora, programação, promoções, notícias, apoiadores (página inicial)
assets/paginas.js     formulário comercial e lista de anunciantes (páginas internas)
content/*.json        dados editados pelo painel
img/                  logo, imagem de compartilhamento (og-image) e fotos dos locutores
functions/api/        nowplaying.js (música tocando) e noticias.js (notícias do Portal Nova Mais)
promocoes.html        só redireciona para /#promocoes (links e QR codes antigos continuam valendo)
404.html, robots.txt, sitemap.xml, _headers, sw.js, manifest.webmanifest
```

- **Player:** um único áudio no site inteiro, com estados reais — "Conectando…", "Tocando ao vivo",
  "Carregando…" (sinal oscilando) e "Sem conexão" com botão **Tentar de novo** (depois de 3 tentativas).
  Só mostra "tocando" quando o áudio realmente começa. Pausar encerra a conexão (não gasta dados).
  Páginas internas (Anuncie, Privacidade) abrem em outra aba quando a rádio está tocando, para o som não parar.
- **Tocando agora:** `/api/nowplaying` lê a página de status do Icecast (e o próprio stream como reserva).
  Títulos com "Nova FM" (vinhetas) fazem o site mostrar o programa do horário.
- **Notícias:** `/api/noticias` busca as 7 últimas matérias do **Portal Nova Mais** pela API do WordPress
  (foto, categoria, resumo, data), com o RSS de reserva e cache de 10 min. As matérias, a busca e as
  categorias continuam no portal — o site só lista e linka.
- **Promoções:** a seção mostra todas as promoções abertas (com prêmio e regra real de chances) e os
  últimos ganhadores (nome abreviado). A participação abre numa janela dentro do site e usa o Worker
  `novafm-sorteador` (`/api/agora`, `/api/promocoes`, `/api/participar`, `/api/sorteados`).
  Quando há promoção valendo, o menu Promoções ganha uma bolinha vermelha e aparece um aviso discreto.
- **Endereço direto das promoções:** `novafmsbs.com.br/#promocoes` abre a participação (bom para QR code e Instagram).
- **Contato comercial:** o formulário de /anuncie não guarda dados; ele abre o WhatsApp com a mensagem pronta.

## Testar no computador antes de publicar

Dentro desta pasta: `wrangler pages dev . --port 8788` e abra http://localhost:8788
(roda o site com as funções de notícias e tocando agora, buscando os dados reais).

## Ao mudar CSS ou JS à mão

Troque a versão `?v=...` nas duas linhas do `index.html` **e** em `sw.js` (lista `BASICOS`),
e mude `VERSAO` em `sw.js` (ex.: `novafm-v12`). Faça o mesmo nas páginas `anuncie.html` e `privacidade.html`. Sem isso, quem tem o app instalado continua vendo a versão antiga.

---

# Instalação inicial do painel (já feita — referência)

Este pacote transforma o site em um projeto editável por um **painel** em `novafmsbs.com.br/admin`,
com login por GitHub. A primeira coisa editável é o **banner de campanha** no topo do site
(ligar/desligar, texto, botão, cor e data para sumir).

> Faça as etapas **na ordem**. Não precisa instalar nada no computador — é tudo pelo navegador.
> Quando terminar a ETAPA 1, me avise que seguimos juntos nas próximas.

---

## ETAPA 1 — Criar o repositório e subir os arquivos

1. Logado no GitHub (usuário **novafmsbs-lab**), acesse: https://github.com/new
2. Em **Repository name**, digite exatamente: `novafmsbs`
3. Deixe **Public** marcado, **não** marque "Add a README".
4. Clique em **Create repository**.
5. Na página do repositório novo, clique em **"uploading an existing file"** (ou **Add file → Upload files**).
6. **Arraste para a janela** todo o conteúdo desta pasta (os arquivos e as pastas
   `admin/`, `content/`, `functions/`, `icons/`). Aguarde subir tudo.
7. Em baixo, clique em **Commit changes**.

✅ Pronto: o site agora "mora" no GitHub.

---

## ETAPA 2 — Publicar no Cloudflare (conectado ao GitHub)

Vamos criar um projeto novo no Cloudflare Pages ligado ao GitHub (o atual é de upload manual e
não dá pra converter; por isso criamos um novo e depois passamos o domínio pra ele).

1. Cloudflare → **Workers e Pages** → **Criar** → aba **Pages** → **Conectar ao Git**.
2. Autorize o Cloudflare a acessar sua conta GitHub e escolha o repositório **novafmsbs**.
3. Em configurações de build, deixe **tudo em branco**:
   - Framework preset: **None**
   - Build command: (vazio)
   - Build output directory: `/` (ou deixe o padrão)
4. Clique em **Salvar e implantar**. Em ~1 min ele publica num endereço tipo
   `novafmsbs-xxxx.pages.dev`. Abra e confira se o site aparece certinho.

> A partir daqui, **toda alteração** feita pelo painel publica sozinha (o Cloudflare reconstrói no push).

---

## ETAPA 3 — Ligar o login do painel (autenticação)

O painel precisa de um "porteiro" que faz o login com o GitHub. É um pequeno serviço gratuito
no Cloudflare (Worker). Faremos uma vez só.

### 3.1 — Publicar o porteiro (Worker de autenticação)
1. Acesse o projeto oficial: https://github.com/sveltia/sveltia-cms-auth
2. No README, clique no botão **"Deploy to Cloudflare Workers"** e siga (ele cria o Worker na sua conta).
3. Ao final, copie a **URL do Worker** (algo como
   `https://sveltia-cms-auth.SEU-SUBDOMINIO.workers.dev`). **Guarde essa URL.**

### 3.2 — Criar o "aplicativo OAuth" no GitHub
1. Acesse: https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**.
2. Preencha:
   - **Application name:** `Nova FM Painel`
   - **Homepage URL:** `https://novafmsbs.com.br`
   - **Authorization callback URL:** a URL do Worker **+ `/callback`**
     (ex.: `https://sveltia-cms-auth.SEU-SUBDOMINIO.workers.dev/callback`)
3. Clique em **Register application**.
4. Copie o **Client ID**. Clique em **Generate a new client secret** e copie o **Client secret**.
   (Guarde os dois — o secret só aparece uma vez.)

### 3.3 — Colocar as chaves no Worker
1. Cloudflare → **Workers e Pages** → abra o worker **sveltia-cms-auth** → **Settings → Variables**.
2. Adicione estas variáveis (marque "Encrypt" nas duas primeiras):
   - `GITHUB_CLIENT_ID` = (o Client ID)
   - `GITHUB_CLIENT_SECRET` = (o Client secret)
   - `ALLOWED_DOMAINS` = `novafmsbs.com.br,*.pages.dev`
3. **Save and deploy.**

### 3.4 — Apontar o painel para o porteiro
- No arquivo `admin/config.yml` (dá pra editar direto no GitHub: abra o arquivo → ✏️ **Edit**),
  troque a linha do `base_url` pela URL do Worker (sem o `/callback`):
  ```
  base_url: https://sveltia-cms-auth.SEU-SUBDOMINIO.workers.dev
  ```
- **Commit changes.** (Me mande a URL do Worker que eu confirmo essa linha com você.)

---

## ETAPA 4 — Passar o domínio e usar o painel

1. No **projeto novo** do Pages (o conectado ao GitHub) → **Domínios personalizados** →
   adicione `novafmsbs.com.br` e `www.novafmsbs.com.br`.
   (O Cloudflare avisa que o domínio está em outro projeto Pages — confirme a transferência.)
2. Aguarde ficar **Ativo**.
3. Acesse **`novafmsbs.com.br/admin`** → **Login with GitHub** → autorize.
4. Você verá a seção **Campanha / Banner**. Ligue o banner, escreva o texto, salve em **Publish**.
   Em ~1 min o banner aparece no site. 🎉

---

## Como usar no dia a dia (depois de pronto)
- Entre em `novafmsbs.com.br/admin`.
- **Campanha / Banner:** ligue/desligue, troque texto/cor/botão e clique **Publish**.
- Pra desligar a promoção, é só desmarcar **"Ativar banner"** e publicar.

> Próximos passos (quando quiser): deixar **Notícias**, **Programação** e **Locutores** também
> editáveis pelo painel — a estrutura já está pronta pra crescer.
