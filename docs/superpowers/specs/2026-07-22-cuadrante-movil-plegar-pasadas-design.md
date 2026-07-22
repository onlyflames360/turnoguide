# Vista móvil del cuadrante: plegar fechas pasadas

Fecha: 2026-07-22

## Problema

En la vista móvil de `ScheduleTable` todas las tarjetas del mes se pintan
expandidas, con los 8 puestos cada una. Para llegar al turno que toca hay que
desplazarse por encima de todas las reuniones ya celebradas.

## Solución

Solo en la vista móvil (`lg:hidden`). La tabla de escritorio no cambia.

1. Se calcula el índice del turno actual: la primera entrada de `schedules` con
   fecha ≥ hoy, comparando solo el día (sin hora). Si no existe ninguna, todas
   las fechas son pasadas.
2. Las tarjetas anteriores a ese índice se muestran plegadas: solo la barra con
   el día y la fecha, sin la rejilla de puestos.
3. Una tarjeta plegada es pulsable. Al tocar la barra se despliega; al volver a
   tocarla se pliega. Muestra una flecha `▸` / `▾` que indica que se puede abrir.
4. El turno actual y los futuros se muestran siempre completos y no son
   pulsables: no llevan flecha ni responden al toque.
5. Los botones de coordinador de la barra (Asam. / Super / Especial) no disparan
   el plegado; detienen la propagación del evento.
6. No hay scroll automático a ninguna tarjeta.

## Estado

Qué fechas pasadas están abiertas se guarda en estado local del componente
(`useState` con un `Set` de ids). Se pierde al recargar, que es el
comportamiento esperado.

## Fuera de alcance

- La vista de escritorio.
- Plegar el turno actual o los futuros.
- Persistir el estado de plegado entre sesiones.
