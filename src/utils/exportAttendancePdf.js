import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDateShort } from './scheduleGenerator'

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]

/**
 * PDF mensual de contabilidad de asistencia.
 * rows: [{ date, dayType, presencial, zoom, total, hasData }]
 * averages: { presencial, zoom, total }
 */
export function exportAttendancePdf(rows, averages, month, year) {
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

  doc.save(`Asistencia_${MONTHS[month-1]}_${year}.pdf`)
}
