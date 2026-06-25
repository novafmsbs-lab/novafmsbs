# Painel da Nova FM — como instalar e usar

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
