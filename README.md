# XT Fibra — Portal de Cobrança

## Como publicar (passo a passo)

### PARTE 1 — Criar o banco de dados no Firebase (5 minutos)

1. Acesse https://console.firebase.google.com
2. Clique em **"Criar projeto"** → dê um nome (ex: `xt-cobranca`) → clique em Continuar até finalizar
3. No menu lateral, clique em **"Realtime Database"**
4. Clique em **"Criar banco de dados"** → escolha **"Iniciar no modo de teste"** → Concluir
5. No menu lateral, clique em **"Visão geral do projeto"** (ícone de casa) → clique em **"</>"** (Web)
6. Dê um apelido ao app (ex: `portal`) → clique em **"Registrar app"**
7. Você verá uma tela com as credenciais. **Copie os seguintes valores:**
   - `apiKey`
   - `authDomain`
   - `databaseURL`
   - `projectId`
   - `appId`

### PARTE 2 — Publicar no Vercel (5 minutos)

1. Acesse https://vercel.com e crie uma conta gratuita (pode usar Google)
2. Clique em **"Add New Project"** → **"Upload"** (ou conecte ao GitHub se preferir)
3. Arraste a pasta `portal-cobranca-xt` inteira para a área de upload
4. Antes de clicar em Deploy, expanda **"Environment Variables"** e adicione:

   | Nome                        | Valor                      |
   |-----------------------------|----------------------------|
   | VITE_FIREBASE_API_KEY       | (seu apiKey do Firebase)   |
   | VITE_FIREBASE_AUTH_DOMAIN   | (seu authDomain)           |
   | VITE_FIREBASE_DATABASE_URL  | (seu databaseURL)          |
   | VITE_FIREBASE_PROJECT_ID    | (seu projectId)            |
   | VITE_FIREBASE_APP_ID        | (seu appId)                |

5. Clique em **"Deploy"** — em ~1 minuto o link estará pronto
6. Compartilhe o link com Gabriela e Yasmin — funciona no celular e no computador

---

## Regras de segurança do Firebase (recomendado)

Depois de publicar, troque as regras do Realtime Database de "modo de teste" para:

```json
{
  "rules": {
    "cobrancas": {
      ".read": true,
      ".write": true
    }
  }
}
```

Isso mantém acesso aberto apenas ao caminho `cobrancas`, não ao banco todo.

---

## Como trocar a senha de supervisor

1. Abra o portal no navegador
2. Pressione F12 → aba **Console**
3. Cole e execute:
```js
crypto.subtle.digest('SHA-256', new TextEncoder().encode('SUA_NOVA_SENHA'))
  .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
```
4. Copie o hash gerado
5. Abra `src/App.jsx`, localize `HASH_SENHA_ADMIN` e substitua pelo novo hash
6. Faça novo deploy no Vercel

---

## Senha padrão

`xt2025`

Troque antes de colocar em produção.
