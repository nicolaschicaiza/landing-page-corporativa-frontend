# Landing Frontend (Astro)

Frontend de la landing page corporativa desplegable en Netlify.

## Requisitos

- Node.js 20+
- Cuenta de Netlify
- Proyecto Firebase con Firestore habilitado

## Desarrollo local

```bash
npm install
npm run dev
```

## Variables de entorno

Copiar `.env.example` a `.env` y completar:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `ALLOWED_ORIGIN` (opcional en local)

Opcional para notificaciones por correo de nuevos leads:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `NOTIFY_EMAIL_FROM` (ej: `Leads Intellia <no-reply@intellia.dev>`)
- `NOTIFY_EMAIL_TO` (correo destino interno)

## Endpoint de leads

- URL: `/.netlify/functions/contact`
- Metodo: `POST`
- Body JSON:

```json
{
  "name": "Nombre",
  "email": "correo@dominio.com",
  "service": "desarrollo",
  "message": "Necesito una landing",
  "company": "",
  "submittedAt": "1700000000000"
}
```
