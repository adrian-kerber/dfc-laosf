# DFC-LAOSF Enhanced - TODO List

## Database Schema (Neon DB via Vercel)
1. **agrupadores** table
   - idagrupador (PK, UUID)
   - nome (VARCHAR)
   - created_at (TIMESTAMP)

2. **contas** table  
   - idconta (PK, VARCHAR) - código da conta (ex: 1.1.1.01)
   - nome (VARCHAR)
   - created_at (TIMESTAMP)

3. **movimentacoes** table
   - idmov (PK, UUID)
   - idconta (FK to contas)
   - mes (INTEGER 1-12)
   - ano (INTEGER)
   - debito (DECIMAL)
   - credito (DECIMAL)
   - created_at (TIMESTAMP)

4. **agrupador_contas** table (junction table)
   - idagrupador (FK)
   - idconta (FK)
   - mes (INTEGER)
   - ano (INTEGER)

5. **precos** table
   - id (PK, UUID)
   - tipo (VARCHAR: 'soja', 'milho', 'suino')
   - preco (DECIMAL)
   - mes (INTEGER)
   - ano (INTEGER)

## Files to Create/Modify

1. **src/lib/database.js** - Database connection and queries
2. **src/components/MonthYearSelector.jsx** - Month/Year selection component
3. **src/components/DataManager.jsx** - Save/Clear data functionality
4. **src/components/ReportFilters.jsx** - Report filtering by month/year
5. **src/components/PriceManager.jsx** - Manage conversion prices
6. **src/App.jsx** - Enhanced main app with monthly data support
7. **package.json** - Add database dependencies

## Key Features Implementation

1. **Monthly Import System**
   - Select month/year before import
   - Store data with month/year context
   - Maintain historical data

2. **Agrupador Synchronization**
   - When creating agrupador, apply to all months
   - When moving account between agrupadores, sync across all months

3. **Advanced Reporting**
   - Filter by specific month/year or all months of a year
   - Show data in different units (R$, Kg suíno, Sc milho, Sc soja)
   - Historical comparison capabilities

4. **Data Persistence**
   - Save all data to Neon DB
   - Clear data functionality with confirmation
   - Backup/restore capabilities