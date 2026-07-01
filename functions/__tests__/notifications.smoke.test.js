'use strict'
/**
 * Smoke test: Aislamiento de notificaciones push
 *
 * Verifica que cada usuario recibe SOLO sus propias notificaciones:
 *  - Roles AV (audio/video/micro1/micro2/plataforma) → ayudante_av únicamente
 *  - Roles AC (auditorio/entrada/parking)            → ayudante_ac únicamente
 *  - Solicitud de sustitución                        → solo el candidato nombrado
 *  - Cambios de estado inválidos                     → ningún push
 */

// ─── Mutable state per test ──────────────────────────────────────────────────
let queryResults   // Map<key, docs[]>
const mockSend = jest.fn().mockResolvedValue('msg-id')

// ─── MockQuery — imita el API de Firestore con chained where/limit/doc ───────
class MockQuery {
  constructor (coll) {
    this._coll  = coll
    this._conds = []
    this._lim   = null
  }

  where (field, op, value) {
    const q     = new MockQuery(this._coll)
    q._conds    = [...this._conds, `${field}${op}${String(value)}`]
    q._lim      = this._lim
    return q
  }

  limit (n) {
    const q     = new MockQuery(this._coll)
    q._conds    = [...this._conds]
    q._lim      = n
    return q
  }

  _key () {
    const cond = this._conds.join('&')
    return cond ? `${this._coll}:${cond}` : this._coll
  }

  get () {
    let docs = queryResults.get(this._key()) ?? queryResults.get(this._coll) ?? []
    if (this._lim !== null) docs = docs.slice(0, this._lim)
    return Promise.resolve({ docs, empty: docs.length === 0 })
  }

  doc (id) {
    const key = `${this._coll}/${id}`
    return {
      get:    () => {
        const data = queryResults.get(key) ?? null
        return Promise.resolve({ data: () => data, exists: data !== null })
      },
      update: jest.fn().mockResolvedValue({}),
    }
  }

  add () { return Promise.resolve({ id: 'new-doc' }) }
}

// ─── Firebase mocks ──────────────────────────────────────────────────────────
jest.mock('firebase-admin/app',       () => ({ initializeApp: jest.fn() }))
jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: (name) => new MockQuery(name) }),
  FieldValue:   { serverTimestamp: () => 'ts' },
}))
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ send: mockSend }),
}))

// Cloud Functions v2: devuelve el handler directamente para poder llamarlo en tests
jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_, handler) => handler,
  onDocumentUpdated: (_, handler) => handler,
}))
jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_, handler) => handler,
}))
jest.mock('firebase-functions/v2/https', () => ({
  onRequest: (_, handler) => handler,
  onCall:    (_, handler) => handler,
  HttpsError: class HttpsError extends Error { constructor(code, msg){ super(msg); this.code = code } },
}))

// ─── Módulo bajo test ────────────────────────────────────────────────────────
const fns = require('../index.js')

// ─── Helpers ─────────────────────────────────────────────────────────────────
const mkDoc = (id, data) => ({ id, data: () => data })

/**
 * Carga usuarios en queryResults simulando las queries que hace index.js:
 *   - users:role==ayudante_av  ← getSectionTokens para roles AV
 *   - users:role==ayudante_ac  ← getSectionTokens para roles AC
 *   - users:name==<nombre>     ← getTokenByName
 */
function setUsers ({ av = [], ac = [], byName = {} } = {}) {
  queryResults.set('users:role==ayudante_av', av.map(u => mkDoc(u.id, u)))
  queryResults.set('users:role==ayudante_ac', ac.map(u => mkDoc(u.id, u)))
  for (const [name, user] of Object.entries(byName)) {
    queryResults.set(`users:name==${name}`, [mkDoc(user.id, user)])
  }
}

// ─── Suite principal ─────────────────────────────────────────────────────────
describe('Push notification isolation — smoke tests', () => {
  beforeEach(() => {
    mockSend.mockClear()
    queryResults = new Map()
    // autoSubstitute=false por defecto para que autoAssignSubstitute salga enseguida
    queryResults.set('settings/global', { autoSubstitute: false })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 1. onPuedo
  // ──────────────────────────────────────────────────────────────────────────
  describe('onPuedo — confirmación de disponibilidad', () => {
    const BASE = { scheduleDate: '2026-06-10T22:00:00.000Z', dayType: 'Entre semana', personName: 'Test' }

    test('response=nopuedo → no dispara ningún push', async () => {
      await fns.onPuedo({
        data:   mkDoc('r0', { ...BASE, response: 'nopuedo', roleKey: 'audio' }),
        params: { responseId: 'r0' },
      })
      expect(mockSend).not.toHaveBeenCalled()
    })

    describe('Roles AV (audio · video · micro1 · micro2 · plataforma)', () => {
      for (const role of ['audio', 'video', 'micro1', 'micro2', 'plataforma']) {
        test(`"${role}" → TOKEN_AV recibe, TOKEN_AC NO recibe`, async () => {
          setUsers({
            av: [{ id: 'u1', fcmToken: 'TOKEN_AV' }],
            ac: [{ id: 'u2', fcmToken: 'TOKEN_AC' }],
          })
          await fns.onPuedo({
            data:   mkDoc('r1', { ...BASE, response: 'puedo', roleKey: role }),
            params: { responseId: 'r1' },
          })
          const tokens = mockSend.mock.calls.map(c => c[0].token)
          expect(tokens).toContain('TOKEN_AV')
          expect(tokens).not.toContain('TOKEN_AC')
        })
      }
    })

    describe('Roles AC (auditorio · entrada · parking)', () => {
      for (const role of ['auditorio', 'entrada', 'parking']) {
        test(`"${role}" → TOKEN_AC recibe, TOKEN_AV NO recibe`, async () => {
          setUsers({
            av: [{ id: 'u1', fcmToken: 'TOKEN_AV' }],
            ac: [{ id: 'u2', fcmToken: 'TOKEN_AC' }],
          })
          await fns.onPuedo({
            data:   mkDoc('r2', { ...BASE, response: 'puedo', roleKey: role }),
            params: { responseId: 'r2' },
          })
          const tokens = mockSend.mock.calls.map(c => c[0].token)
          expect(tokens).toContain('TOKEN_AC')
          expect(tokens).not.toContain('TOKEN_AV')
        })
      }
    })

    test('Múltiples ayudantes AV → todos reciben el push del mismo rol AV', async () => {
      setUsers({ av: [
        { id: 'u1', fcmToken: 'TOKEN_AV_1' },
        { id: 'u2', fcmToken: 'TOKEN_AV_2' },
      ], ac: [{ id: 'u3', fcmToken: 'TOKEN_AC' }] })

      await fns.onPuedo({
        data:   mkDoc('r3', { ...BASE, response: 'puedo', roleKey: 'audio' }),
        params: { responseId: 'r3' },
      })
      const tokens = mockSend.mock.calls.map(c => c[0].token)
      expect(tokens).toContain('TOKEN_AV_1')
      expect(tokens).toContain('TOKEN_AV_2')
      expect(tokens).not.toContain('TOKEN_AC')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 2. onNoPuedo
  // ──────────────────────────────────────────────────────────────────────────
  describe('onNoPuedo — rechazo de disponibilidad', () => {
    const BASE = { scheduleDate: '2026-06-10T22:00:00.000Z', dayType: 'Entre semana', personName: 'Test', scheduleId: 'sched1' }

    test('response=puedo → no dispara ningún push', async () => {
      await fns.onNoPuedo({
        data:   mkDoc('r0', { ...BASE, response: 'puedo', roleKey: 'audio' }),
        params: { responseId: 'r0' },
      })
      expect(mockSend).not.toHaveBeenCalled()
    })

    test('Rol AV (micro1) → TOKEN_AV recibe, TOKEN_AC NO recibe', async () => {
      setUsers({
        av: [{ id: 'u1', fcmToken: 'TOKEN_AV' }],
        ac: [{ id: 'u2', fcmToken: 'TOKEN_AC' }],
      })
      await fns.onNoPuedo({
        data:   mkDoc('r4', { ...BASE, response: 'nopuedo', roleKey: 'micro1' }),
        params: { responseId: 'r4' },
      })
      const tokens = mockSend.mock.calls.map(c => c[0].token)
      expect(tokens).toContain('TOKEN_AV')
      expect(tokens).not.toContain('TOKEN_AC')
    })

    test('Rol AC (parking) → TOKEN_AC recibe, TOKEN_AV NO recibe', async () => {
      setUsers({
        av: [{ id: 'u1', fcmToken: 'TOKEN_AV' }],
        ac: [{ id: 'u2', fcmToken: 'TOKEN_AC' }],
      })
      await fns.onNoPuedo({
        data:   mkDoc('r5', { ...BASE, response: 'nopuedo', roleKey: 'parking' }),
        params: { responseId: 'r5' },
      })
      const tokens = mockSend.mock.calls.map(c => c[0].token)
      expect(tokens).toContain('TOKEN_AC')
      expect(tokens).not.toContain('TOKEN_AV')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 3. onSolicitudCreada — push SOLO al candidato específico
  // ──────────────────────────────────────────────────────────────────────────
  describe('onSolicitudCreada — solicitud de sustitución', () => {
    const BASE = { scheduleDate: '2026-06-10T22:00:00.000Z', dayType: 'Entre semana', roleLabel: 'Audio', requestedByName: 'Coord' }

    test('status != pending → no envía ningún push', async () => {
      await fns.onSolicitudCreada({
        data:   mkDoc('s0', { ...BASE, status: 'accepted', requestedPersonName: 'Carlos' }),
        params: { solicitudId: 's0' },
      })
      expect(mockSend).not.toHaveBeenCalled()
    })

    test('Solo el candidato nombrado recibe el push — otros usuarios NO', async () => {
      setUsers({ byName: {
        'Carlos': { id: 'u3', name: 'Carlos', fcmToken: 'TOKEN_CARLOS' },
        'María':  { id: 'u4', name: 'María',  fcmToken: 'TOKEN_MARIA'  },
      }})

      await fns.onSolicitudCreada({
        data:   mkDoc('s1', { ...BASE, status: 'pending', requestedPersonName: 'Carlos' }),
        params: { solicitudId: 's1' },
      })

      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSend.mock.calls[0][0].token).toBe('TOKEN_CARLOS')
    })

    test('Candidato sin token FCM → send() no se llama', async () => {
      setUsers({ byName: {
        'SinToken': { id: 'u9', name: 'SinToken', fcmToken: null },
      }})

      await fns.onSolicitudCreada({
        data:   mkDoc('s2', { ...BASE, status: 'pending', requestedPersonName: 'SinToken' }),
        params: { solicitudId: 's2' },
      })
      expect(mockSend).not.toHaveBeenCalled()
    })

    test('Candidato no encontrado en users → send() no se llama', async () => {
      // No hay nada en queryResults para el nombre buscado

      await fns.onSolicitudCreada({
        data:   mkDoc('s3', { ...BASE, status: 'pending', requestedPersonName: 'Desconocido' }),
        params: { solicitudId: 's3' },
      })
      expect(mockSend).not.toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 4. onSolicitudRespondida — push a la sección correcta
  // ──────────────────────────────────────────────────────────────────────────
  describe('onSolicitudRespondida — respuesta al candidato', () => {
    const mkEvent = (before, after) => ({
      data:   { before: { data: () => before }, after: { data: () => after } },
      params: { solicitudId: 'sol1' },
    })
    const BASE_AFTER = { requestedPersonName: 'Luis', scheduleDate: '2026-06-10T22:00:00.000Z', dayType: 'EW', responseId: 'r_old', scheduleId: 'sched1' }

    test('before.status != pending → no envía push', async () => {
      await fns.onSolicitudRespondida(mkEvent(
        { status: 'accepted' },
        { ...BASE_AFTER, status: 'accepted', roleKey: 'audio', roleLabel: 'Audio' },
      ))
      expect(mockSend).not.toHaveBeenCalled()
    })

    test('after.status=invalid → no envía push', async () => {
      await fns.onSolicitudRespondida(mkEvent(
        { status: 'pending' },
        { ...BASE_AFTER, status: 'pending', roleKey: 'audio', roleLabel: 'Audio' },
      ))
      expect(mockSend).not.toHaveBeenCalled()
    })

    describe('Accepted — push a la sección del rol', () => {
      for (const [role, section] of [
        ['audio',     'AV'], ['video',    'AV'], ['micro1',    'AV'],
        ['micro2',    'AV'], ['plataforma','AV'],
        ['auditorio', 'AC'], ['entrada',  'AC'], ['parking',   'AC'],
      ]) {
        test(`"${role}" (${section}) → solo TOKEN_${section}`, async () => {
          setUsers({
            av: [{ id: 'av1', fcmToken: 'TOKEN_AV' }],
            ac: [{ id: 'ac1', fcmToken: 'TOKEN_AC' }],
          })

          await fns.onSolicitudRespondida(mkEvent(
            { status: 'pending' },
            { ...BASE_AFTER, status: 'accepted', roleKey: role, roleLabel: role },
          ))

          const tokens = mockSend.mock.calls.map(c => c[0].token)
          expect(tokens).toContain(`TOKEN_${section}`)
          expect(tokens).not.toContain(`TOKEN_${section === 'AV' ? 'AC' : 'AV'}`)
        })
      }
    })

    describe('Rejected — push a la sección del rol', () => {
      for (const [role, section] of [
        ['plataforma', 'AV'], ['auditorio', 'AC'],
      ]) {
        test(`"${role}" (${section}) rejected → solo TOKEN_${section}`, async () => {
          setUsers({
            av: [{ id: 'av1', fcmToken: 'TOKEN_AV' }],
            ac: [{ id: 'ac1', fcmToken: 'TOKEN_AC' }],
          })

          await fns.onSolicitudRespondida(mkEvent(
            { status: 'pending' },
            { ...BASE_AFTER, status: 'rejected', roleKey: role, roleLabel: role },
          ))

          const tokens = mockSend.mock.calls.map(c => c[0].token)
          expect(tokens).toContain(`TOKEN_${section}`)
          expect(tokens).not.toContain(`TOKEN_${section === 'AV' ? 'AC' : 'AV'}`)
        })
      }
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Cross-contamination: dos ayudantes de secciones distintas
  //    nunca reciben el push del otro
  // ──────────────────────────────────────────────────────────────────────────
  describe('Cross-contamination global', () => {
    test('AV y AC con múltiples ayudantes — nunca se mezclan tokens entre secciones', async () => {
      setUsers({
        av: [
          { id: 'av1', fcmToken: 'TOKEN_AV_A' },
          { id: 'av2', fcmToken: 'TOKEN_AV_B' },
        ],
        ac: [
          { id: 'ac1', fcmToken: 'TOKEN_AC_A' },
          { id: 'ac2', fcmToken: 'TOKEN_AC_B' },
        ],
      })

      // Push AV
      await fns.onPuedo({
        data:   mkDoc('rAV', { response: 'puedo', roleKey: 'audio', personName: 'X', scheduleDate: '2026-06-10T22:00:00.000Z', dayType: 'EW' }),
        params: { responseId: 'rAV' },
      })
      let tokens = mockSend.mock.calls.map(c => c[0].token)
      expect(tokens).toEqual(expect.arrayContaining(['TOKEN_AV_A', 'TOKEN_AV_B']))
      expect(tokens).not.toContain('TOKEN_AC_A')
      expect(tokens).not.toContain('TOKEN_AC_B')

      mockSend.mockClear()

      // Push AC
      await fns.onPuedo({
        data:   mkDoc('rAC', { response: 'puedo', roleKey: 'auditorio', personName: 'Y', scheduleDate: '2026-06-10T22:00:00.000Z', dayType: 'EW' }),
        params: { responseId: 'rAC' },
      })
      tokens = mockSend.mock.calls.map(c => c[0].token)
      expect(tokens).toEqual(expect.arrayContaining(['TOKEN_AC_A', 'TOKEN_AC_B']))
      expect(tokens).not.toContain('TOKEN_AV_A')
      expect(tokens).not.toContain('TOKEN_AV_B')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 6. sameDayReminders — recordatorio del mismo día, excluyendo "No puedo"
  // ──────────────────────────────────────────────────────────────────────────
  describe('sameDayReminders — recordatorio mismo día', () => {
    function setupDay ({ responses = [] } = {}) {
      // Reunión de hoy con dos roles asignados
      queryResults.set('schedules', [
        mkDoc('sD', {
          date: '2026-06-10T22:00:00.000Z',
          dayType: 'Miércoles',
          isAssamblea: false,
          assignments: { audio: 'pAna', entrada: 'pBea' },
        }),
      ])
      queryResults.set('people', [
        mkDoc('pAna', { name: 'Ana' }),
        mkDoc('pBea', { name: 'Bea' }),
      ])
      queryResults.set('users', [
        mkDoc('uAna', { name: 'Ana', fcmToken: 'TOKEN_ANA' }),
        mkDoc('uBea', { name: 'Bea', fcmToken: 'TOKEN_BEA' }),
      ])
      queryResults.set('responses', responses.map((r, i) => mkDoc(`resp${i}`, r)))
    }

    test('sin respuestas → ambos asignados reciben recordatorio', async () => {
      setupDay()
      await fns.sameDayReminders()
      const tokens = mockSend.mock.calls.map(c => c[0].token)
      expect(tokens).toEqual(expect.arrayContaining(['TOKEN_ANA', 'TOKEN_BEA']))
    })

    test('quien marcó "No puedo" queda excluido; el otro sí recibe', async () => {
      setupDay({ responses: [
        { scheduleId: 'sD', roleKey: 'entrada', response: 'nopuedo', createdAt: { toMillis: () => 1000 } },
      ] })
      await fns.sameDayReminders()
      const tokens = mockSend.mock.calls.map(c => c[0].token)
      expect(tokens).toContain('TOKEN_ANA')
      expect(tokens).not.toContain('TOKEN_BEA')
    })

    test('última respuesta manda: "No puedo" y luego "Puedo" → sí recibe', async () => {
      setupDay({ responses: [
        { scheduleId: 'sD', roleKey: 'entrada', response: 'nopuedo', createdAt: { toMillis: () => 1000 } },
        { scheduleId: 'sD', roleKey: 'entrada', response: 'puedo',   createdAt: { toMillis: () => 2000 } },
      ] })
      await fns.sameDayReminders()
      const tokens = mockSend.mock.calls.map(c => c[0].token)
      expect(tokens).toContain('TOKEN_BEA')
    })
  })
})
