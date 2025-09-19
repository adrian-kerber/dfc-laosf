import { createClient } from '@supabase/supabase-js'

// Database configuration - will be replaced with Neon DB credentials
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'your-project-url'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseKey)

// Database operations
export const db = {
  // Contas operations
  async getContas() {
    const { data, error } = await supabase
      .from('contas')
      .select('*')
      .order('idconta')
    
    if (error) throw error
    return data || []
  },

  async upsertConta(conta) {
    const { data, error } = await supabase
      .from('contas')
      .upsert({
        idconta: conta.id,
        nome: conta.name
      })
      .select()
    
    if (error) throw error
    return data[0]
  },

  // Agrupadores operations
  async getAgrupadores() {
    const { data, error } = await supabase
      .from('agrupadores')
      .select('*')
      .order('nome')
    
    if (error) throw error
    return data || []
  },

  async createAgrupador(nome) {
    const { data, error } = await supabase
      .from('agrupadores')
      .insert({ nome })
      .select()
    
    if (error) throw error
    return data[0]
  },

  async updateAgrupador(id, nome) {
    const { data, error } = await supabase
      .from('agrupadores')
      .update({ nome })
      .eq('idagrupador', id)
      .select()
    
    if (error) throw error
    return data[0]
  },

  async deleteAgrupador(id) {
    // First remove all associations
    await supabase
      .from('agrupador_contas')
      .delete()
      .eq('idagrupador', id)
    
    // Then delete the agrupador
    const { error } = await supabase
      .from('agrupadores')
      .delete()
      .eq('idagrupador', id)
    
    if (error) throw error
  },

  // Movimentações operations
  async getMovimentacoes(mes = null, ano = null) {
    let query = supabase
      .from('movimentacoes')
      .select(`
        *,
        contas (idconta, nome)
      `)
    
    if (mes !== null) query = query.eq('mes', mes)
    if (ano !== null) query = query.eq('ano', ano)
    
    const { data, error } = await query.order('ano', { ascending: false })
                                   .order('mes', { ascending: false })
    
    if (error) throw error
    return data || []
  },

  async saveMovimentacoes(movimentacoes, mes, ano) {
    // Delete existing data for this month/year
    await supabase
      .from('movimentacoes')
      .delete()
      .eq('mes', mes)
      .eq('ano', ano)
    
    // Insert new data
    const dataToInsert = movimentacoes.map(mov => ({
      idconta: mov.idconta,
      mes,
      ano,
      debito: mov.debito || 0,
      credito: mov.credito || 0
    }))
    
    const { data, error } = await supabase
      .from('movimentacoes')
      .insert(dataToInsert)
      .select()
    
    if (error) throw error
    return data
  },

  // Agrupador-Contas associations
  async getAgrupadorContas(mes = null, ano = null) {
    let query = supabase
      .from('agrupador_contas')
      .select(`
        *,
        agrupadores (idagrupador, nome),
        contas (idconta, nome)
      `)
    
    if (mes !== null) query = query.eq('mes', mes)
    if (ano !== null) query = query.eq('ano', ano)
    
    const { data, error } = await query
    
    if (error) throw error
    return data || []
  },

  async saveAgrupadorContas(associations, mes, ano) {
    // Delete existing associations for this month/year
    await supabase
      .from('agrupador_contas')
      .delete()
      .eq('mes', mes)
      .eq('ano', ano)
    
    // Insert new associations
    if (associations.length > 0) {
      const { data, error } = await supabase
        .from('agrupador_contas')
        .insert(associations.map(assoc => ({
          ...assoc,
          mes,
          ano
        })))
        .select()
      
      if (error) throw error
      return data
    }
    
    return []
  },

  async syncAgrupadorToAllMonths(idagrupador, idconta, action = 'add') {
    if (action === 'add') {
      // Get all existing month/year combinations
      const { data: periods } = await supabase
        .from('movimentacoes')
        .select('mes, ano')
        .distinct()
      
      if (periods && periods.length > 0) {
        const associations = periods.map(period => ({
          idagrupador,
          idconta,
          mes: period.mes,
          ano: period.ano
        }))
        
        const { error } = await supabase
          .from('agrupador_contas')
          .upsert(associations)
        
        if (error) throw error
      }
    } else if (action === 'remove') {
      const { error } = await supabase
        .from('agrupador_contas')
        .delete()
        .eq('idagrupador', idagrupador)
        .eq('idconta', idconta)
      
      if (error) throw error
    }
  },

  // Preços operations
  async getPrecos(mes = null, ano = null) {
    let query = supabase
      .from('precos')
      .select('*')
    
    if (mes !== null) query = query.eq('mes', mes)
    if (ano !== null) query = query.eq('ano', ano)
    
    const { data, error } = await query.order('tipo')
    
    if (error) throw error
    return data || []
  },

  async savePreco(tipo, preco, mes, ano) {
    const { data, error } = await supabase
      .from('precos')
      .upsert({
        tipo,
        preco: parseFloat(preco),
        mes,
        ano
      })
      .select()
    
    if (error) throw error
    return data[0]
  },

  // Utility functions
  async clearAllData() {
    // Clear in order due to foreign key constraints
    await supabase.from('agrupador_contas').delete().neq('idagrupador', '')
    await supabase.from('movimentacoes').delete().neq('idmov', '')
    await supabase.from('precos').delete().neq('id', '')
    await supabase.from('agrupadores').delete().neq('idagrupador', '')
    await supabase.from('contas').delete().neq('idconta', '')
  },

  async getAvailablePeriods() {
    const { data, error } = await supabase
      .from('movimentacoes')
      .select('mes, ano')
      .order('ano', { ascending: false })
      .order('mes', { ascending: false })
    
    if (error) throw error
    
    // Remove duplicates
    const unique = []
    const seen = new Set()
    
    for (const period of data || []) {
      const key = `${period.ano}-${period.mes}`
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(period)
      }
    }
    
    return unique
  }
}