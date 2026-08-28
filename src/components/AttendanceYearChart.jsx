import { useState, useMemo } from 'react'
import {
  buildYearlySummary,
  yearAverages,
  extremeMonths,
  niceScale,
  MONTH_LABELS,
} from '../utils/attendanceStats'

/* Geometría del SVG. Coordenadas fijas + viewBox = escala sola en móvil. */
const W = 360, H = 200
const PAD = { top: 18, right: 8, bottom: 26, left: 30 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const BAND = PLOT_W / 12
const BAR_W = 13          // la banda respira: la barra no llena su hueco
const SEG_GAP = 2         // separador en color de superficie entre segmentos
const CORNER = 4          // extremo redondeado solo arriba

/** Rectángulo con las dos esquinas de arriba redondeadas y la base recta. */
function topRoundedRect(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, h, w / 2))
  return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y}
          L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr}
          L ${x + w} ${y + h} Z`
}

export default function AttendanceYearChart({ schedules, records, year, onYearChange }) {
  const [hovered, setHovered] = useState(null)
  const [showTable, setShowTable] = useState(false)

  const summary = useMemo(
    () => buildYearlySummary(schedules, records, year),
    [schedules, records, year]
  )
  const totals = useMemo(
    () => yearAverages(schedules, records, year),
    [schedules, records, year]
  )
  const { top, bottom } = useMemo(() => extremeMonths(summary), [summary])

  const maxTotal = Math.max(...summary.map(m => m.total), 0)
  const { yMax, ticks } = niceScale(maxTotal)
  const scaleY = v => PAD.top + PLOT_H - (v / yMax) * PLOT_H
  const bandCenter = i => PAD.left + BAND * i + BAND / 2

  const monthsWithData = summary.filter(m => m.hasData).length
  const hoveredMonth = hovered != null ? summary[hovered] : null

  return (
    <div className="card viz-attendance mt-4">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
            Asistencia del año
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
            Media por reunión, mes a mes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onYearChange(year - 1)}
            aria-label="Año anterior"
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex items-center justify-center text-slate-500 transition-colors active:scale-95"
          >‹</button>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 min-w-14 text-center tabular-nums">
            {year}
          </span>
          <button
            onClick={() => onYearChange(year + 1)}
            aria-label="Año siguiente"
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex items-center justify-center text-slate-500 transition-colors active:scale-95"
          >›</button>
        </div>
      </div>

      {monthsWithData === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <div className="text-3xl mb-2">📈</div>
          <p className="font-medium text-sm">Sin datos de asistencia en {year}</p>
          <p className="text-xs mt-1">Rellena el recuento de alguna reunión para ver el gráfico</p>
        </div>
      ) : (
        <>
          {/* Media del año — texto, para no competir con las tarjetas del mes */}
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Media del año:{' '}
            <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{totals.total}</span>
            {' '}· {totals.presencial} presencial · {totals.zoom} Zoom
            {' '}· <span className="tabular-nums">{totals.meetings}</span> reuniones contabilizadas
          </p>

          {/* Ancho acotado: si el SVG se estira sin límite las barras engordan
              por encima del grosor que pide la guía de gráficos */}
          <div className="relative max-w-[640px] mx-auto">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto select-none"
              role="img"
              aria-label={`Asistencia media por mes en ${year}`}
              onPointerLeave={() => setHovered(null)}
            >
              {/* Rejilla y eje: finos, sólidos, en segundo plano */}
              {ticks.map(t => (
                <g key={t}>
                  <line
                    x1={PAD.left} x2={W - PAD.right} y1={scaleY(t)} y2={scaleY(t)}
                    stroke="var(--viz-grid)" strokeWidth="1"
                  />
                  <text
                    x={PAD.left - 6} y={scaleY(t) + 3} textAnchor="end"
                    fontSize="9" fill="var(--viz-ink-muted)"
                  >
                    {t}
                  </text>
                </g>
              ))}

              {summary.map((m, i) => {
                const cx = bandCenter(i)
                const x = cx - BAR_W / 2
                const isExtreme = top?.month === m.month || bottom?.month === m.month
                const base = PAD.top + PLOT_H

                // Presencial abajo, Zoom encima, separados por 2px de superficie.
                const zoomH = m.zoom > 0 ? Math.max(2, (m.zoom / yMax) * PLOT_H) : 0
                const presH = m.presencial > 0 ? Math.max(2, (m.presencial / yMax) * PLOT_H) : 0
                const presY = base - presH
                const zoomY = presY - (presH > 0 ? SEG_GAP : 0) - zoomH

                return (
                  <g key={m.month}>
                    {m.hasData && presH > 0 && (
                      <path
                        d={zoomH > 0
                          ? `M ${x} ${base} L ${x} ${presY} L ${x + BAR_W} ${presY} L ${x + BAR_W} ${base} Z`
                          : topRoundedRect(x, presY, BAR_W, presH, CORNER)}
                        fill="var(--viz-presencial)"
                      />
                    )}
                    {m.hasData && zoomH > 0 && (
                      <path
                        d={topRoundedRect(x, zoomY, BAR_W, zoomH, CORNER)}
                        fill="var(--viz-zoom)"
                      />
                    )}

                    {/* Etiqueta directa solo en el mes más alto y el más bajo */}
                    {m.hasData && isExtreme && (
                      <text
                        x={cx} y={(zoomH > 0 ? zoomY : presY) - 5} textAnchor="middle"
                        fontSize="9" fontWeight="700" fill="var(--viz-ink)"
                      >
                        {m.total}
                      </text>
                    )}

                    <text
                      x={cx} y={H - 8} textAnchor="middle" fontSize="9"
                      fill={m.hasData ? 'var(--viz-axis)' : 'var(--viz-ink-muted)'}
                      fontWeight={hovered === i ? '700' : '400'}
                    >
                      {m.label}
                    </text>

                    {/* Zona de contacto de banda completa: más grande que la barra */}
                    <rect
                      x={PAD.left + BAND * i} y={PAD.top} width={BAND} height={PLOT_H}
                      fill="transparent" style={{ cursor: m.hasData ? 'pointer' : 'default' }}
                      onPointerEnter={() => setHovered(i)}
                      onPointerDown={() => setHovered(i)}
                    />
                  </g>
                )
              })}

              <line
                x1={PAD.left} x2={W - PAD.right} y1={PAD.top + PLOT_H} y2={PAD.top + PLOT_H}
                stroke="var(--viz-axis)" strokeWidth="1"
              />
            </svg>

            {hoveredMonth?.hasData && (
              <div
                className="absolute -translate-x-1/2 pointer-events-none z-10 rounded-lg px-2.5 py-1.5 shadow-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900"
                style={{
                  left: `${Math.min(88, Math.max(12, (bandCenter(hovered) / W) * 100))}%`,
                  top: 0,
                }}
              >
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  {MONTH_LABELS[hoveredMonth.month - 1]}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: 'var(--viz-presencial)' }} />
                  {hoveredMonth.presencial} presencial
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: 'var(--viz-zoom)' }} />
                  {hoveredMonth.zoom} Zoom
                </p>
                <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap mt-0.5">
                  Total {hoveredMonth.total} · {hoveredMonth.meetings} reunion{hoveredMonth.meetings === 1 ? '' : 'es'}
                </p>
              </div>
            )}
          </div>

          {/* Leyenda: la identidad nunca depende solo del color */}
          <div className="flex items-center justify-between gap-4 mt-3 flex-wrap">
            <div className="flex items-center gap-4">
              {[
                { label: 'Presencial', color: 'var(--viz-presencial)' },
                { label: 'Zoom', color: 'var(--viz-zoom)' },
              ].map(s => (
                <span key={s.label} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
            <button
              onClick={() => setShowTable(v => !v)}
              className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 underline underline-offset-2"
            >
              {showTable ? 'Ocultar tabla' : 'Ver tabla'}
            </button>
          </div>

          {showTable && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400">
                    <th className="text-left font-semibold py-1.5">Mes</th>
                    <th className="text-right font-semibold py-1.5">Presencial</th>
                    <th className="text-right font-semibold py-1.5">Zoom</th>
                    <th className="text-right font-semibold py-1.5">Total</th>
                    <th className="text-right font-semibold py-1.5">Reuniones</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(m => (
                    <tr key={m.month} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="py-1.5 text-slate-700 dark:text-slate-200">{MONTH_LABELS[m.month - 1]}</td>
                      {m.hasData ? (
                        <>
                          <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{m.presencial}</td>
                          <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{m.zoom}</td>
                          <td className="py-1.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">{m.total}</td>
                          <td className="py-1.5 text-right tabular-nums text-slate-500">{m.meetings}</td>
                        </>
                      ) : (
                        <td colSpan={4} className="py-1.5 text-right text-slate-400 italic">Sin datos</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
