import { neon } from '@neondatabase/serverless'

// Configuração do Neon Database via Vercel
const getDatabaseUrl = () => {
  // Para desenvolvimento (Vite)
  if (import.meta.env?.VITE_DATABASE_URL) {
    return import.meta.env.VITE_DATABASE_URL
  }
  
  // Para produção (Vercel/Node.js) - usando globalThis para evitar erro do ESLint
  if (typeof globalThis !== 'undefined' && globalThis.process?.env?.DATABASE_URL) {
    return globalThis.process.env.DATABASE_URL
  }
  
  // Fallback
  return null
}

const databaseUrl = getDatabaseUrl()
const sql = databaseUrl ? neon(databaseUrl) : null

// Inicializar tabelas do banco de dados
export const initializeDatabase = async () => {
  if (!sql) {
    console.warn('Database URL not configured, using localStorage fallback')
    return
  }

  try {
    // Criar tabela contas
    await sql`
      CREATE TABLE IF NOT EXISTS contas (
        idconta VARCHAR(50) PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    // Criar tabela agrupadores
    await sql`
      CREATE TABLE IF NOT EXISTS agrupadores (
        idagrupador SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    // Criar tabela movimentacoes
    await sql`
      CREATE TABLE IF NOT EXISTS movimentacoes (
        idmov SERIAL PRIMARY KEY,
        idconta VARCHAR(50) REFERENCES contas(idconta) ON DELETE CASCADE,
        mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
        ano INTEGER NOT NULL,
        debito DECIMAL(15,2) DEFAULT 0,
        credito DECIMAL(15,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(idconta, mes, ano)
      )
    `

    // Criar tabela agrupador_contas (relacionamento)
    await sql`
      CREATE TABLE IF NOT EXISTS agrupador_contas (
        id SERIAL PRIMARY KEY,
        idagrupador INTEGER REFERENCES agrupadores(idagrupador) ON DELETE CASCADE,
        idconta VARCHAR(50) REFERENCES contas(idconta) ON DELETE CASCADE,
        mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
        ano INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(idagrupador, idconta, mes, ano)
      )
    `

    // Criar tabela precos
    await sql`
      CREATE TABLE IF NOT EXISTS precos (
        id SERIAL PRIMARY KEY,
        tipo VARCHAR(20) NOT NULL, -- 'soja', 'milho', 'suino'
        preco DECIMAL(10,2) NOT NULL,
        mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
        ano INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tipo, mes, ano)
      )
    `

    console.log('Database initialized successfully')
  } catch (error) {
    console.error('Error initializing database:', error)
    throw error
  }
}

// Database operations
export const db = {
  // Operações de Contas
  async getContas() {
    if (!sql) return []
    
    try {
      const result = await sql`SELECT * FROM contas ORDER BY idconta`
      return result || []
    } catch (error) {
      console.error('Error fetching contas:', error)
      return []
    }
  },

  async upsertConta(conta) {
    if (!sql) throw new Error('Database not configured')
    
    try {
      const result = await sql`
        INSERT INTO contas (idconta, nome)
        VALUES (${conta.id}, ${conta.name})
        ON CONFLICT (idconta) 
        DO UPDATE SET nome = ${conta.name}
        RETURNING *
      `
      return result[0]
    } catch (error) {
      console.error('Error upserting conta:', error)
      throw error
    }
  },

  // Operações de Agrupadores
  async getAgrupadores() {
    if (!sql) return []
    
    try {
      const result = await sql`SELECT * FROM agrupadores ORDER BY nome`
      return result || []
    } catch (error) {
      console.error('Error fetching agrupadores:', error)
      return []
    }
  },

  async createAgrupador(nome) {
    if (!sql) throw new Error('Database not configured')
    
    try {
      const result = await sql`
        INSERT INTO agrupadores (nome)
        VALUES (${nome})
        RETURNING *
      `
      return result[0]
    } catch (error) {
      console.error('Error creating agrupador:', error)
      throw error
    }
  },

  async updateAgrupador(id, nome) {
    if (!sql) throw new Error('Database not configured')
    
    try {
      const result = await sql`
        UPDATE agrupadores 
        SET nome = ${nome}
        WHERE idagrupador = ${id}
        RETURNING *
      `
      return result[0]
    } catch (error) {
      console.error('Error updating agrupador:', error)
      throw error
    }
  },

  async deleteAgrupador(id) {
    if (!sql) throw new Error('Database not configured')
    
    try {
      // Remove associações primeiro
      await sql`DELETE FROM agrupador_contas WHERE idagrupador = ${id}`
      
      // Remove o agrupador
      await sql`DELETE FROM agrupadores WHERE idagrupador = ${id}`
    } catch (error) {
      console.error('Error deleting agrupador:', error)
      throw error
    }
  },

  // Operações de Movimentações
  async getMovimentacoes(mes = null, ano = null) {
    if (!sql) return []
    
    try {
      let query
      if (mes !== null && ano !== null) {
        query = sql`
          SELECT m.*, c.nome, c.idconta as codigo 
          FROM movimentacoes m
          JOIN contas c ON m.idconta = c.idconta
          WHERE m.mes = ${mes} AND m.ano = ${ano}
          ORDER BY c.idconta
        `
      } else if (ano !== null) {
        query = sql`
          SELECT m.*, c.nome, c.idconta as codigo 
          FROM movimentacoes m
          JOIN contas c ON m.idconta = c.idconta
          WHERE m.ano = ${ano}
          ORDER BY c.idconta, m.mes
        `
      } else {
        query = sql`
          SELECT m.*, c.nome, c.idconta as codigo 
          FROM movimentacoes m
          JOIN contas c ON m.idconta = c.idconta
          ORDER BY c.idconta, m.ano, m.mes
        `
      }
      
      const result = await query
      return result || []
    } catch (error) {
      console.error('Error fetching movimentacoes:', error)
      return []
    }
  },

  async saveMovimentacoes(movimentacoes, mes, ano) {
    if (!sql) throw new Error('Database not configured')
    
    try {
      // Remove dados existentes do mês/ano
      await sql`
        DELETE FROM movimentacoes 
        WHERE mes = ${mes} AND ano = ${ano}
      `
      
      // Insere novos dados
      if (movimentacoes.length > 0) {
        for (const mov of movimentacoes) {
          await sql`
            INSERT INTO movimentacoes (idconta, mes, ano, debito, credito)
            VALUES (${mov.idconta}, ${mes}, ${ano}, ${mov.debito || 0}, ${mov.credito || 0})
          `
        }
      }
      
      return movimentacoes
    } catch (error) {
      console.error('Error saving movimentacoes:', error)
      throw error
    }
  },

  // Operações de Associações Agrupador-Contas
  async getAgrupadorContas(mes = null, ano = null) {
    if (!sql) return []
    
    try {
      let query
      if (mes !== null && ano !== null) {
        query = sql`
          SELECT ac.*, a.nome as agrupador_nome, c.nome as conta_nome, c.idconta
          FROM agrupador_contas ac
          JOIN agrupadores a ON ac.idagrupador = a.idagrupador
          JOIN contas c ON ac.idconta = c.idconta
          WHERE ac.mes = ${mes} AND ac.ano = ${ano}
          ORDER BY a.nome, c.idconta
        `
      } else {
        query = sql`
          SELECT ac.*, a.nome as agrupador_nome, c.nome as conta_nome, c.idconta
          FROM agrupador_contas ac
          JOIN agrupadores a ON ac.idagrupador = a.idagrupador
          JOIN contas c ON ac.idconta = c.idconta
          ORDER BY a.nome, c.idconta
        `
      }
      
      const result = await query
      return result || []
    } catch (error) {
      console.error('Error fetching agrupador contas:', error)
      return []
    }
  },

  async saveAgrupadorContas(associations, mes, ano) {
    if (!sql) throw new Error('Database not configured')
    
    try {
      // Remove associações existentes do mês/ano
      await sql`
        DELETE FROM agrupador_contas 
        WHERE mes = ${mes} AND ano = ${ano}
      `
      
      // Insere novas associações
      if (associations.length > 0) {
        for (const assoc of associations) {
          await sql`
            INSERT INTO agrupador_contas (idagrupador, idconta, mes, ano)
            VALUES (${assoc.idagrupador}, ${assoc.idconta}, ${mes}, ${ano})
          `
        }
      }
      
      return associations
    } catch (error) {
      console.error('Error saving agrupador contas:', error)
      throw error
    }
  },

  async syncAgrupadorToAllMonths(idagrupador, idconta, action = 'add') {
    if (!sql) throw new Error('Database not configured')
    
    try {
      if (action === 'add') {
        // Pega todos os períodos existentes
        const periods = await sql`
          SELECT DISTINCT mes, ano FROM movimentacoes ORDER BY ano, mes
        `
        
        if (periods && periods.length > 0) {
          for (const period of periods) {
            await sql`
              INSERT INTO agrupador_contas (idagrupador, idconta, mes, ano)
              VALUES (${idagrupador}, ${idconta}, ${period.mes}, ${period.ano})
              ON CONFLICT (idagrupador, idconta, mes, ano) DO NOTHING
            `
          }
        }
      } else if (action === 'remove') {
        await sql`
          DELETE FROM agrupador_contas 
          WHERE idagrupador = ${idagrupador} AND idconta = ${idconta}
        `
      }
    } catch (error) {
      console.error('Error syncing agrupador to all months:', error)
      throw error
    }
  },

  // Operações de Preços
  async getPrecos(mes = null, ano = null) {
    if (!sql) return []
    
    try {
      let query
      if (mes !== null && ano !== null) {
        query = sql`
          SELECT * FROM precos 
          WHERE mes = ${mes} AND ano = ${ano}
          ORDER BY tipo
        `
      } else {
        query = sql`SELECT * FROM precos ORDER BY tipo, ano DESC, mes DESC`
      }
      
      const result = await query
      return result || []
    } catch (error) {
      console.error('Error fetching precos:', error)
      return []
    }
  },

  async savePreco(tipo, preco, mes, ano) {
    if (!sql) throw new Error('Database not configured')
    
    try {
      const result = await sql`
        INSERT INTO precos (tipo, preco, mes, ano)
        VALUES (${tipo}, ${parseFloat(preco)}, ${mes}, ${ano})
        ON CONFLICT (tipo, mes, ano)
        DO UPDATE SET preco = ${parseFloat(preco)}
        RETURNING *
      `
      return result[0]
    } catch (error) {
      console.error('Error saving preco:', error)
      throw error
    }
  },

  // Funções utilitárias
  async clearAllData() {
    if (!sql) throw new Error('Database not configured')
    
    try {
      // Remove em ordem devido às foreign keys
      await sql`DELETE FROM agrupador_contas`
      await sql`DELETE FROM movimentacoes`
      await sql`DELETE FROM precos`
      await sql`DELETE FROM agrupadores`
      await sql`DELETE FROM contas`
    } catch (error) {
      console.error('Error clearing data:', error)
      throw error
    }
  },

  async getAvailablePeriods() {
    if (!sql) return []
    
    try {
      const result = await sql`
        SELECT DISTINCT mes, ano FROM movimentacoes 
        ORDER BY ano DESC, mes DESC
      `
      return result || []
    } catch (error) {
      console.error('Error fetching available periods:', error)
      return []
    }
  }
}

// Inicializa o banco quando o módulo é carregado (apenas no browser)
if (typeof window !== 'undefined') {
  initializeDatabase().catch(console.error)
}