# TurnoGuide

Aplicación PWA para la gestión de turnos de Audio/Vídeo y Acomodadores de la **Congregación Villajoyosa**.

## Características

- **Generador de turnos** — rotación automática y justa basada en habilidades
- **Cambios manuales e inteligentes** — sugerencias por rol y disponibilidad
- **Roles**: Coordinador, Ayudante y Usuario
- **Push notifications** — avisos con el móvil bloqueado vía FCM + Cloud Functions
- **Botones Puedo / No puedo** — los usuarios responden y el coordinador recibe push inmediato
- **Exportar PDF** — horario mensual con cabeceras a color
- **PWA instalable** — funciona como app nativa en Android, iOS y escritorio
- **Sin Firebase Auth** — acceso con nombre + PIN

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite + Tailwind CSS v3 |
| Base de datos | Firebase Firestore |
| Push | Firebase Cloud Messaging (FCM) |
| Backend | Firebase Cloud Functions v2 |
| Hosting | Firebase Hosting |
| PDF | jsPDF + jspdf-autotable |

## Roles

| Rol | Acceso | Notificaciones |
|---|---|---|
| `coordinador` | Dashboard completo (horario, personas, usuarios, notificaciones) | Recibe "No puedo" de usuarios |
| `ayudante` | Dashboard de usuario | Recibe "No puedo" igual que coordinador |
| `usuario` | Sus próximas asignaciones + Puedo/No puedo | Recordatorio día anterior |

## Instalación local

```bash
git clone https://github.com/onlyflames360/turnoguide.git
cd turnoguide
npm install
cp .env.example .env   # rellena con tus credenciales Firebase
npm run dev
```

## Variables de entorno

Crea un archivo `.env` en la raíz con las siguientes variables (ver `.env.example`):

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_VAPID_KEY=
```

> Las claves nunca se suben a git. El service worker recibe los valores en tiempo de build mediante un plugin Vite.

## Despliegue

```bash
npm run build
firebase deploy --only hosting
```

Para desplegar también las Cloud Functions:

```bash
firebase deploy --only hosting,functions
```

## Cloud Functions

| Función | Trigger | Descripción |
|---|---|---|
| `onNoPuedo` | Firestore `responses/{id}` creado | Push inmediato a coordinadores y ayudantes |
| `dailyReminders` | Cron diario 10:00 (Europe/Madrid) | Recordatorio a cada usuario con turno al día siguiente |

## Estructura del proyecto

```
src/
├── components/
│   ├── ChangeModal.jsx        # Modal de cambio manual/inteligente
│   ├── Header.jsx             # Cabecera con estado push y logout
│   ├── NotificationsTab.jsx   # Pestaña de respuestas "No puedo"
│   ├── PeopleManager.jsx      # CRUD de personas con habilidades
│   ├── ScheduleGenerator.jsx  # Generador y previsualización de turnos
│   ├── ScheduleTable.jsx      # Tabla/tarjetas del horario
│   └── UserManager.jsx        # CRUD de usuarios con roles y PINs
├── contexts/
│   └── AuthContext.jsx        # Auth personalizada (nombre + PIN)
├── firebase/
│   ├── config.js              # Inicialización Firebase
│   └── messaging.js           # Registro token FCM
├── pages/
│   ├── CoordinatorDashboard.jsx
│   ├── Login.jsx
│   └── UserDashboard.jsx
└── utils/
    ├── exportPdf.js           # Exportación PDF landscape A4
    ├── notifications.js       # Helpers Notification API
    └── scheduleGenerator.js   # Algoritmo de rotación justa
functions/
└── index.js                   # Cloud Functions v2
public/
└── firebase-messaging-sw.js   # Service worker FCM (placeholders)
```

## Notas

- En iOS las notificaciones push solo funcionan con la app instalada en el home screen (limitación de Apple).
- El horario en PDF se genera en formato A4 horizontal con grupos de color por sección.
- **Importante**: los asignados deben llegar **30 minutos antes** de la reunión.
