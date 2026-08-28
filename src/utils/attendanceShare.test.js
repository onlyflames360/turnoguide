import { describe, it, expect } from 'vitest'
import { buildAttendanceMessage, whatsappUrl } from './attendanceShare'

describe('buildAttendanceMessage', () => {
  it('reproduce exactamente el formato pedido', () => {
    // Comparación literal: cualquier cambio de espacios o puntos rompe aquí.
    // El ejemplo original decía "Total: 99", pero 68 + 29 son 97: el total
    // se calcula, nunca se copia.
    expect(buildAttendanceMessage(new Date(2026, 7, 26), 68, 29)).toBe(
      'Asistencia 26/8/26:\n\nPresencial:68.\nZoom:29.\n\nTotal: 97.'
    )
  })

  it('no pone cero delante en día ni mes', () => {
    expect(buildAttendanceMessage(new Date(2026, 8, 5), 10, 2)).toContain('Asistencia 5/9/26:')
  })

  it('deja el año a dos cifras al cambiar de siglo', () => {
    expect(buildAttendanceMessage(new Date(2100, 0, 1), 1, 1)).toContain('Asistencia 1/1/00:')
  })

  it('acepta los valores como texto, que es como vienen del formulario', () => {
    expect(buildAttendanceMessage(new Date(2026, 7, 26), '68', '29')).toBe(
      'Asistencia 26/8/26:\n\nPresencial:68.\nZoom:29.\n\nTotal: 97.'
    )
  })

  it('trata los campos vacíos como cero', () => {
    expect(buildAttendanceMessage(new Date(2026, 7, 26), '', '')).toBe(
      'Asistencia 26/8/26:\n\nPresencial:0.\nZoom:0.\n\nTotal: 0.'
    )
  })

  it('suma el total en vez de concatenar los textos', () => {
    // Con concatenación saldría "6829"
    expect(buildAttendanceMessage(new Date(2026, 7, 26), '68', '29')).toContain('Total: 97.')
  })

  it('acepta una fecha ISO, que es como se guardan los turnos', () => {
    const iso = new Date(2026, 7, 26).toISOString()
    expect(buildAttendanceMessage(iso, 68, 29)).toContain('Asistencia 26/8/26:')
  })
})

describe('whatsappUrl', () => {
  it('codifica los saltos de línea y no fija destinatario', () => {
    const url = whatsappUrl(buildAttendanceMessage(new Date(2026, 7, 26), 68, 29))
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    expect(url).toContain('%0A')       // saltos de línea codificados
    expect(url).not.toContain(' ')     // nada sin codificar
    expect(decodeURIComponent(url.split('text=')[1])).toContain('Total: 97.')
  })
})
