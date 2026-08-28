import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDateShort } from './scheduleGenerator'
import { extremeMonths, niceScale, MONTH_LABELS as MONTHS } from './attendanceStats'

// Paleta clara validada para impresión: emerald-600 y blue-600 sobre blanco
const C_PRESENCIAL = [5, 150, 105]
const C_ZOOM       = [37, 99, 235]
const C_GRID       = [226, 232, 240]
const C_AXIS       = [148, 163, 184]
const C_INK        = [30, 41, 59]

/** Barra con el extremo superior redondeado y la base recta. */
function barTopRounded(doc, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, h / 2, w / 2))
  if (rr <= 0) { doc.rect(x, y, w, h, 'F'); return }
  doc.roundedRect(x, y, w, h, rr, rr, 'F')
  doc.rect(x, y + rr, w, h - rr, 'F') // recuadra la base
}

/**
 * Columnas apiladas con la media mensual del año.
 * Presencial abajo, Zoom encima, separados por un hueco en blanco.
 */
function drawYearChart(doc, summary, x, y, w, h) {
  const { yMax, ticks } = niceScale(Math.max(...summary.map(m => m.total), 0))
  const band = w / 12
  const barW = Math.min(9, band * 0.5) // la barra no llena su hueco, igual que en la app
  const gap = 0.7
  const base = y + h
  const scale = v => (v / yMax) * h
  const { top, bottom } = extremeMonths(summary)

  // Rejilla horizontal, fina y en segundo plano
  doc.setLineWidth(0.2)
  doc.setFontSize(7)
  ticks.forEach(value => {
    const ly = base - scale(value)
    doc.setDrawColor(...C_GRID)
    doc.line(x, ly, x + w, ly)
    doc.setTextColor(...C_AXIS)
    doc.text(String(value), x - 1.5, ly + 1, { align: 'right' })
  })

  summary.forEach((m, i) => {
    const cx = x + band * i + band / 2
    const bx = cx - barW / 2

    if (m.hasData) {
      const presH = m.presencial > 0 ? Math.max(0.6, scale(m.presencial)) : 0
      const zoomH = m.zoom > 0 ? Math.max(0.6, scale(m.zoom)) : 0
      const presY = base - presH
      const zoomY = presY - (presH > 0 ? gap : 0) - zoomH

      if (presH > 0) {
        doc.setFillColor(...C_PRESENCIAL)
        if (zoomH > 0) doc.rect(bx, presY, barW, presH, 'F')
        else barTopRounded(doc, bx, presY, barW, presH, 1.4)
      }
      if (zoomH > 0) {
        doc.setFillColor(...C_ZOOM)
        barTopRounded(doc, bx, zoomY, barW, zoomH, 1.4)
      }

      // Solo se etiquetan los extremos: un número por columna sería ruido
      if (top?.month === m.month || bottom?.month === m.month) {
        doc.setFontSize(7)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...C_INK)
        doc.text(String(m.total), cx, (zoomH > 0 ? zoomY : presY) - 1.5, { align: 'center' })
        doc.setFont('helvetica', 'normal')
      }
    }

    doc.setFontSize(7)
    doc.setTextColor(...C_AXIS)
    doc.text(MONTHS[i].slice(0, 3), cx, base + 4, { align: 'center' })
  })

  doc.setDrawColor(...C_AXIS)
  doc.setLineWidth(0.3)
  doc.line(x, base, x + w, base)

  // Leyenda: la identidad no depende solo del color
  const legendY = base + 10
  let lx = x
  ;[['Presencial', C_PRESENCIAL], ['Zoom', C_ZOOM]].forEach(([label, color]) => {
    doc.setFillColor(...color)
    doc.roundedRect(lx, legendY - 2.4, 3, 3, 0.5, 0.5, 'F')
    doc.setFontSize(8)
    doc.setTextColor(...C_INK)
    doc.text(label, lx + 4.5, legendY)
    lx += doc.getTextWidth(label) + 12
  })

  return legendY + 6
}

/**
 * Segunda página del PDF: el año de un vistazo.
 */
function addYearPage(doc, summary, totals, year) {
  const pageWidth = doc.internal.pageSize.width
  const center = pageWidth / 2

  doc.addPage()
  doc.setFontSize(14)
  doc.setTextColor(30, 64, 175)
  doc.setFont('helvetica', 'bold')
  doc.text(`Resumen del año ${year}`, center, 16, { align: 'center' })

  doc.setFontSize(10)
  doc.setTextColor(71, 85, 105)
  doc.setFont('helvetica', 'normal')
  const meetings = totals?.meetings ?? summary.reduce((a, m) => a + m.meetings, 0)
  doc.text(
    `Media por reunión: ${totals?.total ?? 0} (${totals?.presencial ?? 0} presencial · ${totals?.zoom ?? 0} Zoom) — ${meetings} reuniones contabilizadas`,
    center, 23, { align: 'center' }
  )

  const afterChartY = drawYearChart(doc, summary, 24, 32, pageWidth - 24 - 14, 70)

  autoTable(doc, {
    head: [[
      { content: 'Mes', styles: { halign: 'left' } },
      { content: 'Presencial', styles: { halign: 'center' } },
      { content: 'Zoom', styles: { halign: 'center' } },
      { content: 'Total', styles: { halign: 'center' } },
      { content: 'Reuniones', styles: { halign: 'center' } },
    ]],
    body: summary.map((m, i) => m.hasData
      ? [
          { content: MONTHS[i], styles: { halign: 'left' } },
          { content: String(m.presencial), styles: { halign: 'center' } },
          { content: String(m.zoom), styles: { halign: 'center' } },
          { content: String(m.total), styles: { halign: 'center', fontStyle: 'bold' } },
          { content: String(m.meetings), styles: { halign: 'center', textColor: [148,163,184] } },
        ]
      : [
          { content: MONTHS[i], styles: { halign: 'left' } },
          { content: 'Sin datos', colSpan: 4, styles: { halign: 'center', fontStyle: 'italic', textColor: [148,163,184] } },
        ]
    ),
    startY: afterChartY + 4,
    styles: { fontSize: 9, cellPadding: 2, lineColor: [203,213,225], lineWidth: 0.2 },
    headStyles: { fontStyle: 'bold', fillColor: [220,252,231], textColor: [22,101,52] },
    alternateRowStyles: { fillColor: [248,250,252] },
    margin: { left: 14, right: 14 },
  })

  doc.setFontSize(8)
  doc.setTextColor(148,163,184)
  doc.setFont('helvetica', 'normal')
  doc.text(`Año ${year}`, 14, doc.internal.pageSize.height - 6)
}

/**
 * PDF de contabilidad: una página con el mes y otra con el año entero.
 * rows: [{ date, dayType, presencial, zoom, total, hasData }]
 * averages: { presencial, zoom, total }
 * yearlySummary: 12 entradas de buildYearlySummary (opcional)
 * yearlyTotals: medias del año de yearAverages (opcional)
 */
export function exportAttendancePdf(rows, averages, month, year, yearlySummary = [], yearlyTotals = null) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.width
  const center = pageWidth / 2

  doc.setFontSize(16)
  doc.setTextColor(30, 64, 175)
  doc.setFont('helvetica', 'bold')
  doc.text('Congregación La Barbera', center, 16, { align: 'center' })

  doc.setFontSize(12)
  doc.setTextColor(71, 85, 105)
  doc.setFont('helvetica', 'normal')
  doc.text(`Contabilidad de asistencia — ${MONTHS[month - 1]} ${year}`, center, 23, { align: 'center' })

  const head = [[
    { content: 'Fecha', styles: { halign: 'center' } },
    { content: 'Presencial', styles: { halign: 'center' } },
    { content: 'Zoom', styles: { halign: 'center' } },
    { content: 'Total', styles: { halign: 'center' } },
  ]]

  const body = rows.map(r => {
    const dateStr = `${r.dayType} ${formatDateShort(r.date)}`
    if (!r.hasData) {
      return [
        { content: dateStr, styles: { halign: 'center' } },
        { content: 'Pendiente', colSpan: 3, styles: { halign: 'center', fontStyle: 'italic', textColor: [148,163,184] } },
      ]
    }
    return [
      { content: dateStr, styles: { halign: 'center' } },
      { content: String(r.presencial), styles: { halign: 'center' } },
      { content: String(r.zoom), styles: { halign: 'center' } },
      { content: String(r.total), styles: { halign: 'center', fontStyle: 'bold' } },
    ]
  })

  autoTable(doc, {
    head,
    body,
    startY: 30,
    styles: { fontSize: 10, cellPadding: 3, lineColor: [203,213,225], lineWidth: 0.2, halign: 'center' },
    headStyles: { fontStyle: 'bold', fillColor: [220,252,231], textColor: [22,101,52] },
    alternateRowStyles: { fillColor: [248,250,252] },
    margin: { left: 14, right: 14 },
  })

  // Medias del mes
  const afterTableY = doc.lastAutoTable.finalY + 10
  doc.setFontSize(12)
  doc.setTextColor(30, 41, 59)
  doc.setFont('helvetica', 'bold')
  doc.text('Medias del mes', 14, afterTableY)

  autoTable(doc, {
    body: [
      ['Media presencial', averages.presencial],
      ['Media Zoom', averages.zoom],
      ['Media total', averages.total],
    ],
    startY: afterTableY + 3,
    styles: { fontSize: 11, cellPadding: 3, lineColor: [203,213,225], lineWidth: 0.2 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [71,85,105] },
      1: { halign: 'right', fontStyle: 'bold', textColor: [79,70,229] },
    },
    margin: { left: 14, right: 14 },
    tableWidth: 90,
  })

  doc.setFontSize(8)
  doc.setTextColor(148,163,184)
  doc.setFont('helvetica', 'normal')
  doc.text(`${MONTHS[month-1]} ${year}`, 14, doc.internal.pageSize.height - 6)

  // Segunda página solo si hay algo que graficar
  if (yearlySummary.some(m => m.hasData)) {
    addYearPage(doc, yearlySummary, yearlyTotals, year)
  }

  doc.save(`Asistencia_${MONTHS[month-1]}_${year}.pdf`)
}
