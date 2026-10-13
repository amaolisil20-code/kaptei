# Kaptei

Encontre leads. Conquiste oportunidades. Ferramenta pessoal de prospecção: busca empresas por ramo e cidade, consulta CNPJ com sócios, lê o site das empresas para achar WhatsApp e e-mail, e abre o WhatsApp com scripts prontos.

No ar em https://kaptei.vercel.app

## Rodar localmente
As funções em `api/` precisam da Vercel CLI:

```
npm i -g vercel
vercel dev
```

Abra http://localhost:3000.

## Banco de dados (Supabase)
1. Crie o projeto no Supabase.
2. No SQL Editor, rode `supabase/schema.sql`.
3. Peça ao Claude Code para ligar o login e trocar o armazenamento local pelas tabelas (veja `CLAUDE.md`).
