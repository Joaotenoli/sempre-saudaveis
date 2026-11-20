# Sempre Saudáveis

App de sono, fichas de alimentação e meta de peso. Instala pelo navegador no iPhone, Android, Mac e Windows, funciona offline e sincroniza por login.

## O que tem na pasta

| Arquivo | Para que serve |
|---|---|
| `index.html` | Página de downloads (instruções por aparelho, QR code, botão de instalar) |
| `app/` | O aplicativo (`index.html`, `app.js`, `sw.js` para offline, `manifest.webmanifest`) |
| `app/config.js` | Onde você cola as 2 chaves do Supabase |
| `supabase/schema.sql` | Tabela e regras de acesso do banco |
| `icons/` | Ícones do app |

Sem as chaves, o app já funciona, só que guardando os dados apenas no aparelho. Com as chaves, aparece a tela de login e tudo sincroniza.

## Passo 1: banco e login (Supabase, grátis)

1. Crie uma conta em https://supabase.com e um projeto novo (região São Paulo).
2. No projeto, abra **SQL Editor → New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em **Authentication → Sign In / Providers → Email**, desligue **Confirm email**. Assim a conta entra direto, sem esperar e-mail de confirmação.
4. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
5. Cole as duas em `app/config.js`:

```js
window.VIGOR_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ..."
};
```

A chave `anon` pode ficar no código: quem protege os dados são as regras do `schema.sql`, que só deixam cada pessoa ler e alterar a própria linha.

## Passo 2: colocar no ar (GitHub Pages, grátis)

O app está publicado pelo GitHub Pages, a partir do repositório `sempre-saudaveis`. Cada `git push` na branch `main` publica a versão nova em 1 ou 2 minutos.

```bash
git add -A && git commit -m "Atualiza o app" && git push
```

## Passo 3: instalar

Abra o endereço em cada aparelho e siga a página de downloads. Cada pessoa cria a própria conta dentro do app (e-mail e senha). Mesma conta no celular e no computador = mesmos dados.

## Atualizar o app depois

Mude `VERSION` em `app/sw.js` (por exemplo `ss-v3`), faça commit e `git push`. Os aparelhos pegam a versão nova na próxima abertura com internet.

## Como a sincronização funciona

Cada registro (noite, dia, peso, ficha própria) guarda a hora da última edição. Ao sincronizar, o app junta o que está no aparelho com o que está na nuvem e, item por item, fica com a edição mais recente. Dá para usar offline: sincroniza sozinho quando a internet volta.
