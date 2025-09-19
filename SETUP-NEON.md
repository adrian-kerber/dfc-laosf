# Setup Neon Database via Vercel

## 1. Criar Projeto no Neon

1. Acesse [Neon Console](https://console.neon.tech/)
2. Crie uma nova conta ou faça login
3. Clique em "Create Project"
4. Escolha um nome para o projeto (ex: "dfc-laosf")
5. Selecione a região mais próxima (ex: US East)

## 2. Obter String de Conexão

1. No dashboard do Neon, vá em "Connection Details"
2. Copie a "Connection string" completa
3. Ela terá o formato: `postgresql://username:password@host/database?sslmode=require`

## 3. Configurar no Vercel

### Para Deploy no Vercel:
1. Vá no seu projeto no Vercel Dashboard
2. Acesse "Settings" > "Environment Variables"
3. Adicione a variável:
   - **Name**: `DATABASE_URL`
   - **Value**: `sua_connection_string_do_neon`
   - **Environments**: Production, Preview, Development

### Para Desenvolvimento Local:
1. Crie um arquivo `.env.local` na raiz do projeto:
   ```
   VITE_DATABASE_URL=sua_connection_string_do_neon
   ```

## 4. Deploy

1. Faça commit das mudanças:
   ```bash
   git add .
   git commit -m "Add Neon database integration"
   git push
   ```

2. O Vercel fará deploy automaticamente
3. As tabelas serão criadas automaticamente na primeira execução

## 5. Estrutura do Banco

O sistema criará automaticamente estas tabelas:

- **contas**: Armazena as contas contábeis
- **agrupadores**: Grupos de contas personalizados
- **movimentacoes**: Débitos e créditos por mês/ano
- **agrupador_contas**: Relacionamento contas ↔ agrupadores
- **precos**: Preços para conversão de unidades

## 6. Funcionalidades

✅ **Importação Mensal**: Cada arquivo Excel é salvo por mês/ano específico
✅ **Sincronização**: Mudanças em agrupadores aplicam em todos os meses
✅ **Relatórios**: Filtros por período com conversão de unidades
✅ **Backup**: Exportação completa dos dados
✅ **Fallback**: Funciona offline com localStorage se banco não disponível

## 7. Troubleshooting

**Erro de conexão?**
- Verifique se a string de conexão está correta
- Confirme se as variáveis de ambiente estão configuradas
- Teste a conexão no Neon SQL Editor

**Tabelas não criadas?**
- Abra o console do navegador para ver logs
- Verifique se há erros de permissão no Neon

**Dados não persistindo?**
- Confirme se `DATABASE_URL` está definida no Vercel
- Teste localmente com `VITE_DATABASE_URL`