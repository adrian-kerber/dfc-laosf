import React, { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/database'

export default function PriceManager({ 
  selectedMonth, 
  selectedYear, 
  onPriceChange 
}) {
  const [prices, setPrices] = useState({
    soja: '',
    milho: '',
    suino: ''
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const loadPrices = useCallback(async () => {
    if (!selectedMonth || !selectedYear) return

    try {
      const precos = await db.getPrecos(selectedMonth, selectedYear)
      const priceMap = {}
      
      precos.forEach(preco => {
        priceMap[preco.tipo] = preco.preco.toString()
      })

      setPrices({
        soja: priceMap.soja || '',
        milho: priceMap.milho || '',
        suino: priceMap.suino || ''
      })

      if (onPriceChange) {
        onPriceChange(priceMap)
      }
    } catch (error) {
      console.error('Erro ao carregar preços:', error)
    }
  }, [selectedMonth, selectedYear, onPriceChange])

  useEffect(() => {
    loadPrices()
  }, [loadPrices])

  const handlePriceChange = (tipo, valor) => {
    setPrices(prev => ({ ...prev, [tipo]: valor }))
  }

  const handleSavePrice = async (tipo) => {
    if (!selectedMonth || !selectedYear) {
      setMessage('Selecione mês e ano primeiro')
      return
    }

    if (!prices[tipo] || isNaN(parseFloat(prices[tipo]))) {
      setMessage('Digite um preço válido')
      return
    }

    setLoading(true)
    try {
      await db.savePreco(tipo, prices[tipo], selectedMonth, selectedYear)
      setMessage(`Preço de ${tipo} salvo com sucesso!`)
      
      if (onPriceChange) {
        onPriceChange({ ...prices, [tipo]: prices[tipo] })
      }
    } catch (error) {
      console.error('Erro ao salvar preço:', error)
      setMessage('Erro ao salvar preço: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value) => {
    const num = parseFloat(value)
    return isNaN(num) ? '' : num.toLocaleString('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    })
  }

  if (!selectedMonth || !selectedYear) {
    return (
      <div className="price-manager">
        <h3>Preços para Conversão</h3>
        <p style={{ color: '#666', fontSize: '14px' }}>
          Selecione um mês e ano para configurar os preços
        </p>
      </div>
    )
  }

  return (
    <div className="price-manager">
      <h3>Preços para Conversão</h3>
      <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
        Período: {selectedMonth}/{selectedYear}
      </p>

      <div className="price-inputs" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Soja */}
        <div className="price-input-group">
          <label style={{ fontSize: '14px', fontWeight: 'bold' }}>
            Saca de Soja (60kg):
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="number"
              step="0.01"
              placeholder="Ex: 85.50"
              value={prices.soja}
              onChange={(e) => handlePriceChange('soja', e.target.value)}
              style={{ flex: 1, padding: '4px 8px' }}
            />
            <button 
              onClick={() => handleSavePrice('soja')}
              disabled={loading}
              className="btn-save"
              style={{ padding: '4px 8px', fontSize: '12px' }}
            >
              Salvar
            </button>
          </div>
          {prices.soja && (
            <span style={{ fontSize: '12px', color: '#666' }}>
              {formatCurrency(prices.soja)} por saca
            </span>
          )}
        </div>

        {/* Milho */}
        <div className="price-input-group">
          <label style={{ fontSize: '14px', fontWeight: 'bold' }}>
            Saca de Milho (60kg):
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="number"
              step="0.01"
              placeholder="Ex: 45.30"
              value={prices.milho}
              onChange={(e) => handlePriceChange('milho', e.target.value)}
              style={{ flex: 1, padding: '4px 8px' }}
            />
            <button 
              onClick={() => handleSavePrice('milho')}
              disabled={loading}
              className="btn-save"
              style={{ padding: '4px 8px', fontSize: '12px' }}
            >
              Salvar
            </button>
          </div>
          {prices.milho && (
            <span style={{ fontSize: '12px', color: '#666' }}>
              {formatCurrency(prices.milho)} por saca
            </span>
          )}
        </div>

        {/* Suíno */}
        <div className="price-input-group">
          <label style={{ fontSize: '14px', fontWeight: 'bold' }}>
            Kg de Suíno:
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="number"
              step="0.01"
              placeholder="Ex: 6.80"
              value={prices.suino}
              onChange={(e) => handlePriceChange('suino', e.target.value)}
              style={{ flex: 1, padding: '4px 8px' }}
            />
            <button 
              onClick={() => handleSavePrice('suino')}
              disabled={loading}
              className="btn-save"
              style={{ padding: '4px 8px', fontSize: '12px' }}
            >
              Salvar
            </button>
          </div>
          {prices.suino && (
            <span style={{ fontSize: '12px', color: '#666' }}>
              {formatCurrency(prices.suino)} por kg
            </span>
          )}
        </div>
      </div>

      {message && (
        <div 
          className="message"
          style={{ 
            marginTop: '10px', 
            padding: '6px', 
            borderRadius: '4px',
            backgroundColor: message.includes('Erro') ? '#f8d7da' : '#d4edda',
            color: message.includes('Erro') ? '#721c24' : '#155724',
            fontSize: '12px'
          }}
        >
          {message}
        </div>
      )}
    </div>
  )
}