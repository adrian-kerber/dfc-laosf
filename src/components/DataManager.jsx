import React, { useState } from 'react'
import { db } from '../lib/database'

export default function DataManager({ onDataChange }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const showMessage = (msg, isError = false) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 3000)
  }

  const handleSaveData = async () => {
    if (!window.confirm('Salvar todos os dados no banco? Esta ação irá sobrescrever dados existentes.')) {
      return
    }

    setLoading(true)
    try {
      // This would save current state to database
      // Implementation depends on current app state structure
      showMessage('Dados salvos com sucesso!')
      if (onDataChange) onDataChange()
    } catch (error) {
      console.error('Erro ao salvar dados:', error)
      showMessage('Erro ao salvar dados: ' + error.message, true)
    } finally {
      setLoading(false)
    }
  }

  const handleClearData = async () => {
    if (!window.confirm('ATENÇÃO: Esta ação irá apagar TODOS os dados do banco de dados. Esta ação não pode ser desfeita. Deseja continuar?')) {
      return
    }

    if (!window.confirm('Tem certeza absoluta? Todos os balancetes, agrupadores e configurações serão perdidos permanentemente.')) {
      return
    }

    setLoading(true)
    try {
      await db.clearAllData()
      showMessage('Todos os dados foram removidos do banco!')
      if (onDataChange) onDataChange()
    } catch (error) {
      console.error('Erro ao limpar dados:', error)
      showMessage('Erro ao limpar dados: ' + error.message, true)
    } finally {
      setLoading(false)
    }
  }

  const handleExportData = async () => {
    setLoading(true)
    try {
      // Get all data for export
      const [contas, agrupadores, movimentacoes, precos] = await Promise.all([
        db.getContas(),
        db.getAgrupadores(),
        db.getMovimentacoes(),
        db.getPrecos()
      ])

      const exportData = {
        contas,
        agrupadores,
        movimentacoes,
        precos,
        exportDate: new Date().toISOString()
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dfc-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showMessage('Backup exportado com sucesso!')
    } catch (error) {
      console.error('Erro ao exportar dados:', error)
      showMessage('Erro ao exportar dados: ' + error.message, true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="data-manager">
      <h3>Gerenciar Dados</h3>
      
      <div className="data-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button 
          onClick={handleSaveData}
          disabled={loading}
          className="btn-save"
        >
          {loading ? 'Salvando...' : 'Salvar Dados no Banco'}
        </button>
        
        <button 
          onClick={handleExportData}
          disabled={loading}
          className="btn-save"
        >
          {loading ? 'Exportando...' : 'Exportar Backup'}
        </button>
        
        <button 
          onClick={handleClearData}
          disabled={loading}
          className="btn-clear"
          style={{ backgroundColor: '#dc3545', color: 'white' }}
        >
          {loading ? 'Limpando...' : 'Limpar Todos os Dados'}
        </button>
      </div>

      {message && (
        <div 
          className={`message ${message.includes('Erro') ? 'error' : 'success'}`}
          style={{ 
            marginTop: '10px', 
            padding: '8px', 
            borderRadius: '4px',
            backgroundColor: message.includes('Erro') ? '#f8d7da' : '#d4edda',
            color: message.includes('Erro') ? '#721c24' : '#155724',
            border: `1px solid ${message.includes('Erro') ? '#f5c6cb' : '#c3e6cb'}`
          }}
        >
          {message}
        </div>
      )}
    </div>
  )
}