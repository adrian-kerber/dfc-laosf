import React, { useState, useEffect } from 'react'
import { db } from '../lib/database'

export default function ReportFilters({ 
  onFilterChange,
  selectedMonth,
  selectedYear,
  onMonthChange,
  onYearChange
}) {
  const [availablePeriods, setAvailablePeriods] = useState([])
  const [viewMode, setViewMode] = useState('specific') // 'specific' or 'yearly'
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadAvailablePeriods()
  }, [])

  useEffect(() => {
    handleFilterChange()
  }, [viewMode, selectedMonth, selectedYear])

  const loadAvailablePeriods = async () => {
    setLoading(true)
    try {
      const periods = await db.getAvailablePeriods()
      setAvailablePeriods(periods)
    } catch (error) {
      console.error('Erro ao carregar períodos:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = () => {
    if (onFilterChange) {
      onFilterChange({
        viewMode,
        month: viewMode === 'specific' ? selectedMonth : null,
        year: selectedYear
      })
    }
  }

  const handleViewModeChange = (mode) => {
    setViewMode(mode)
    if (mode === 'yearly' && onMonthChange) {
      onMonthChange(null) // Clear month selection for yearly view
    }
  }

  const getUniqueYears = () => {
    const years = [...new Set(availablePeriods.map(p => p.ano))]
    return years.sort((a, b) => b - a)
  }

  const getMonthsForYear = (year) => {
    if (!year) return []
    return availablePeriods
      .filter(p => p.ano === year)
      .map(p => p.mes)
      .sort((a, b) => a - b)
  }

  const getMonthName = (month) => {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ]
    return months[month - 1] || month
  }

  if (loading) {
    return (
      <div className="report-filters">
        <h3>Filtros do Relatório</h3>
        <p>Carregando períodos disponíveis...</p>
      </div>
    )
  }

  if (availablePeriods.length === 0) {
    return (
      <div className="report-filters">
        <h3>Filtros do Relatório</h3>
        <p style={{ color: '#666', fontSize: '14px' }}>
          Nenhum dado encontrado. Importe um balancete primeiro.
        </p>
      </div>
    )
  }

  return (
    <div className="report-filters">
      <h3>Filtros do Relatório</h3>
      
      {/* View Mode Selection */}
      <div className="view-mode-selector" style={{ marginBottom: '15px' }}>
        <label style={{ fontSize: '14px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>
          Tipo de Visualização:
        </label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px' }}>
            <input
              type="radio"
              value="specific"
              checked={viewMode === 'specific'}
              onChange={(e) => handleViewModeChange(e.target.value)}
            />
            Mês específico
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px' }}>
            <input
              type="radio"
              value="yearly"
              checked={viewMode === 'yearly'}
              onChange={(e) => handleViewModeChange(e.target.value)}
            />
            Ano completo
          </label>
        </div>
      </div>

      {/* Year Selection */}
      <div className="year-selector" style={{ marginBottom: '15px' }}>
        <label style={{ fontSize: '14px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>
          Ano:
        </label>
        <select 
          value={selectedYear || ''} 
          onChange={(e) => onYearChange(e.target.value ? parseInt(e.target.value) : null)}
          style={{ width: '100%', padding: '4px 8px' }}
        >
          <option value="">Selecione o ano</option>
          {getUniqueYears().map(year => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {/* Month Selection (only for specific view) */}
      {viewMode === 'specific' && (
        <div className="month-selector" style={{ marginBottom: '15px' }}>
          <label style={{ fontSize: '14px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>
            Mês:
          </label>
          <select 
            value={selectedMonth || ''} 
            onChange={(e) => onMonthChange(e.target.value ? parseInt(e.target.value) : null)}
            style={{ width: '100%', padding: '4px 8px' }}
            disabled={!selectedYear}
          >
            <option value="">Selecione o mês</option>
            {selectedYear && getMonthsForYear(selectedYear).map(month => (
              <option key={month} value={month}>
                {getMonthName(month)}
              </option>
            ))}
          </select>
          {selectedYear && getMonthsForYear(selectedYear).length === 0 && (
            <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              Nenhum dado disponível para {selectedYear}
            </p>
          )}
        </div>
      )}

      {/* Available Periods Summary */}
      <div className="periods-summary" style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <h4 style={{ fontSize: '14px', marginBottom: '8px' }}>Períodos Disponíveis:</h4>
        <div style={{ fontSize: '12px', color: '#666' }}>
          {getUniqueYears().map(year => (
            <div key={year} style={{ marginBottom: '4px' }}>
              <strong>{year}:</strong> {getMonthsForYear(year).map(getMonthName).join(', ')}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}