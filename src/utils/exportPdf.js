import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ROLES, formatDateShort } from './scheduleGenerator'

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]

export function exportSchedulePdf(schedules, people, month, year) {
  const personName = (id) => people.find(p => p.id === id)?.name ?? '—'

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Título
  doc.setFontSize(16)
  doc.setTextColor(30, 64, 175) // blue-800
  doc.setFont('helvetica', 'bold')
  doc.text('Congregación La Barbera', 148, 14, { align: 'center' })

  doc.setFontSize(12)
  doc.setTextColor(71, 85, 105) // slate-500
  doc.setFont('helvetica', 'normal')
  doc.text(`Asignaciones de ${MONTHS[month - 1]} ${year}`, 148, 21, { align: 'center' })

  doc.setFontSize(9)
  doc.setTextColor(239, 68, 68) // red-500
  doc.setFont('helvetica', 'bold')
  doc.text('IMPORTANTE: Por favor llegar 30 min antes de empezar la reunión', 148, 27, { align: 'center' })

  // Tabla
  const head = [
    [
      { content: 'Fecha', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fillColor: [226,232,240], textColor: [30,41,59] } },
      { content: 'Audio y Video', colSpan: 5, styles: { halign: 'center', fillColor: [219,234,254], textColor: [30,64,175] } },
      { content: 'Acomodadores', colSpan: 2, styles: { halign: 'center', fillColor: [220,252,231], textColor: [22,101,52] } },
      { content: 'Parking', colSpan: 1, styles: { halign: 'center', fillColor: [254,243,199], textColor: [180,83,9] } },
    ],
    [
      ...['Audio','Video','Micro 1','Micro 2','Plataforma'].map(l => ({
        content: l, styles: { halign: 'center', fillColor: [239,246,255], fontSize: 8, textColor: [30,64,175] }
      })),
      ...['Auditorio','Entrada'].map(l => ({
        content: l, styles: { halign: 'center', fillColor: [240,253,244], fontSize: 8, textColor: [22,101,52] }
      })),
      { content: 'Vehículos', styles: { halign: 'center', fillColor: [255,251,235], fontSize: 8, textColor: [180,83,9] } },
    ]
  ]

  const body = schedules.map(s => {
    const d = new Date(s.date)
    const dateStr = `${s.dayType}\n${formatDateShort(s.date)}`
    const isSunday = s.dayType === 'Domingo'

    if (s.isAssamblea) {
      return [
        { content: dateStr, styles: { fontStyle: isSunday ? 'bold' : 'normal', halign: 'center' } },
        { content: 'Asamblea', colSpan: 8, styles: { halign: 'center', fontStyle: 'italic', textColor: [100,116,139] } },
      ]
    }

    const roleKeys = ['audio','video','micro1','micro2','plataforma','auditorio','entrada','parking']
    return [
      { content: dateStr, styles: { fontStyle: isSunday ? 'bold' : 'normal', halign: 'center', textColor: isSunday ? [30,64,175] : [30,41,59] } },
      ...roleKeys.map(r => ({
        content: personName(s.assignments?.[r]),
        styles: { halign: 'center', fontSize: 8 }
      }))
    ]
  })

  autoTable(doc, {
    head,
    body,
    startY: 32,
    styles: { fontSize: 9, cellPadding: 2.5, lineColor: [203,213,225], lineWidth: 0.2 },
    headStyles: { fontSize: 9, fontStyle: 'bold', textColor: [30,41,59] },
    alternateRowStyles: { fillColor: [248,250,252] },
    margin: { left: 10, right: 10 },
    columnStyles: { 0: { cellWidth: 22 } },
  })

  // Pie de página
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(148,163,184)
    doc.setFont('helvetica', 'normal')
    doc.text(`${MONTHS[month-1]} ${year}`, 10, doc.internal.pageSize.height - 5)
    doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 10, doc.internal.pageSize.height - 5, { align: 'right' })
  }

  doc.save(`Horario_${MONTHS[month-1]}_${year}.pdf`)
}
