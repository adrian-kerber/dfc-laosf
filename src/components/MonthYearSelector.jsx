import React from 'react'

const MONTHS = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' }
]

export default function MonthYearSelector({ 
  selectedMonth, 
  selectedYear, 
  onMonthChange, 
  onYearChange,
  showAllOption = false,
  label = "Período"
}) {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i + 5)

  return (
    <div className="month-year-selector">
      <h3>{label}</h3>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <select 
          value={selectedMonth || ''} 
          onChange={(e) => onMonthChange(e.target.value ? parseInt(e.target.value) : null)}
        >
          {showAllOption && <option value="">Todos os meses</option>}
          {MONTHS.map(month => (
            <option key={month.value} value={month.value}>
              {month.label}
            </option>
          ))}
        </select>
        
        <select 
          value={selectedYear || ''} 
          onChange={(e) => onYearChange(e.target.value ? parseInt(e.target.value) : null)}
        >
          <option value="">Selecione o ano</option>
          {years.map(year => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}