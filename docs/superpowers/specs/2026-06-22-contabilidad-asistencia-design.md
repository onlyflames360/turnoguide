# Contabilidad de asistencia — Diseño

Fecha: 2026-06-22

## Objetivo

El ayudante acomodador necesita llevar la contabilidad de asistencia de cada
reunión (presencial + Zoom), ver la media mensual y poder exportar un PDF del
mes. El recuento lo introduce la persona asignada al rol **Auditorio** en cada
reunión, que puede rectificar si se equivoca.

## Decisiones (confirmadas con el usuario)

- **Datos por reunión:** dos números — `presencial` y `zoom`. El total se calcula.
- **Formulario:** aparece para quien tenga Auditorio en "Mis turnos", lista
  **todas** sus reuniones de Auditorio (pasadas y próximas), editable siempre.
- **Media:** tres medias separadas — presencial, Zoom y total.
- **Acceso a la pestaña Contabilidad + PDF:** solo `ayudante_ac`.

## Modelo de datos

Colección **`asistencia`**, un documento por reunión con **id = scheduleId**.
Usar el scheduleId como id hace que rellenar y rectificar sea sobrescribir el
mismo documento (`setDoc` con `merge`), sin duplicados.

```
asistencia/{scheduleId} = {
  scheduleId: string,
  scheduleDate: string (ISO),
  dayType: string,
  presencial: number,
  zoom: number,
  filledByName: string,
  filledByPersonId: string,
  updatedAt: serverTimestamp,
}
```

El total (`presencial + zoom`) se calcula en cliente, no se persiste.

Las reglas de Firestore están abiertas (`allow read, write: if true`) → no se
tocan.

## Componentes

### `AttendanceForm.jsx` — formulario del de Auditorio
- Props: `schedules`, `myPersonId`, `userName`.
- Selecciona schedules con `assignments.auditorio === myPersonId` y
  `!isAssamblea`, ordenados por fecha descendente.
- Suscripción a la colección `asistencia` para precargar valores existentes.
- Por reunión: inputs numéricos Presencial y Zoom, total calculado, botón
  Guardar (`setDoc(doc(db,'asistencia',scheduleId), {...}, {merge:true})`).
  Indica "guardado" y permite rectificar.
- Se renderiza en la zona "Mis turnos" de `UserDashboard` (visible para
  cualquier rol que tenga Auditorio asignado: usuario o ayudante).

### `AttendanceTab.jsx` — contabilidad del ayudante_ac
- Solo se monta para `roleSection === 'ac'`.
- Navegación por mes (mismo patrón que el resto del dashboard).
- Lista las reuniones del mes (no asambleas), uniendo schedule + registro de
  `asistencia`; las que no tienen registro se marcan "pendiente".
- Calcula y muestra 3 medias (presencial, Zoom, total) sobre las reuniones con
  datos.
- Botón "⬇️ Descargar PDF" → `exportAttendancePdf`.

### `exportAttendancePdf.js` — PDF mensual
- Mismo estilo visual que `exportPdf.js`.
- Cabecera congregación + "Contabilidad de asistencia — [Mes Año]".
- Tabla: Fecha · Presencial · Zoom · Total.
- Pie con las 3 medias del mes.

## Integración en `UserDashboard.jsx`

- `AYUDANTE_TABS` pasa a ser dinámico: para `ac` incluye `'contabilidad'`
  (4 pestañas), para `av` se queda en 3.
- El indicador de `segmented-tabs` (hoy con `/3` fijo) se generaliza a
  `AYUDANTE_TABS.length` para que no se descuadre con 4 pestañas. El ayudante_av
  queda idéntico.
- Botón + bloque de contenido de la pestaña Contabilidad solo si
  `roleSection === 'ac'`.
- `AttendanceForm` se añade al principio de la zona "Mis turnos".

## Fuera de alcance

- No se cambia el flujo de push ni las pestañas existentes.
- No se añade la pestaña Contabilidad al coordinador (solo ayudante_ac, según
  lo pedido).
