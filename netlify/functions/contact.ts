import type { Handler } from "@netlify/functions";
import nodemailer from "nodemailer";
import { db } from "../../src/lib/firebase-admin";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sanitize = (value: unknown, max = 3000): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, max);
};

const getOrigin = (event: Parameters<Handler>[0]) => {
  return event.headers.origin ?? event.headers.Origin ?? "";
};

const isSmtpConfigured = (): boolean => {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.NOTIFY_EMAIL_TO &&
      process.env.NOTIFY_EMAIL_FROM
  );
};

const isRecaptchaConfigured = (): boolean => {
  return Boolean(process.env.RECAPTCHA_SECRET_KEY);
};

type RecaptchaVerificationResponse = {
  success: boolean;
  "error-codes"?: string[];
};

const verifyRecaptchaToken = async (token: string, remoteIp: string): Promise<boolean> => {
  if (!isRecaptchaConfigured()) {
    return true;
  }

  const body = new URLSearchParams({
    secret: process.env.RECAPTCHA_SECRET_KEY!,
    response: token
  });

  if (remoteIp) {
    body.append("remoteip", remoteIp);
  }

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    return false;
  }

  const result = (await response.json()) as RecaptchaVerificationResponse;
  if (!result.success) {
    console.warn("reCAPTCHA verification failed", result["error-codes"] ?? []);
  }

  return result.success;
};

const sendLeadNotification = async (input: {
  name: string;
  email: string;
  service: string;
  message: string;
  createdAt: string;
}) => {
  if (!isSmtpConfigured()) {
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const subject = `[Nuevo Lead] ${input.service} - ${input.name}`;
  const text = [
    "Nuevo lead recibido desde landing page corporativa",
    `Fecha: ${input.createdAt}`,
    `Nombre: ${input.name}`,
    `Correo: ${input.email}`,
    `Servicio: ${input.service}`,
    "",
    "Mensaje:",
    input.message
  ].join("\n");

  const html = `
    <h2>Nuevo lead recibido</h2>
    <p><strong>Fecha:</strong> ${input.createdAt}</p>
    <p><strong>Nombre:</strong> ${input.name}</p>
    <p><strong>Correo:</strong> ${input.email}</p>
    <p><strong>Servicio:</strong> ${input.service}</p>
    <p><strong>Mensaje:</strong></p>
    <p>${input.message.replace(/\n/g, "<br/>")}</p>
  `;

  await transporter.sendMail({
    from: process.env.NOTIFY_EMAIL_FROM,
    to: process.env.NOTIFY_EMAIL_TO,
    replyTo: input.email,
    subject,
    text,
    html
  });
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ ok: false, message: "Metodo no permitido" }) };
  }

  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  const origin = getOrigin(event);
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return { statusCode: 403, body: JSON.stringify({ ok: false, message: "Origen no permitido" }) };
  }

  try {
    const payload = JSON.parse(event.body || "{}");

    const name = sanitize(payload.name, 140);
    const email = sanitize(payload.email, 180).toLowerCase();
    const service = sanitize(payload.service, 120);
    const message = sanitize(payload.message, 2000);
    const company = sanitize(payload.company, 120);
    const captchaToken = sanitize(payload.captchaToken, 2048);
    const submittedAt = Number(payload.submittedAt || 0);
    const clientIp = sanitize(event.headers["x-nf-client-connection-ip"] ?? "", 120);

    if (company) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, message: "Solicitud invalida" }) };
    }

    const elapsedMs = Date.now() - submittedAt;
    if (!submittedAt || elapsedMs < 2000) {
      return { statusCode: 429, body: JSON.stringify({ ok: false, message: "Envio sospechoso" }) };
    }

    if (!name || !email || !service || !message) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, message: "Campos incompletos" }) };
    }

    if (!emailRegex.test(email)) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, message: "Correo invalido" }) };
    }

    if (isRecaptchaConfigured() && !captchaToken) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, message: "Captcha requerido" }) };
    }

    const captchaValid = await verifyRecaptchaToken(captchaToken, clientIp);
    if (!captchaValid) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, message: "Captcha invalido" }) };
    }

    const createdAt = new Date().toISOString();

    await db.collection("leads").add({
      name,
      email,
      service,
      message,
      createdAt,
      source: "landing-page-corporativa",
      metadata: {
        userAgent: event.headers["user-agent"] ?? "",
        ip: clientIp,
        captchaProtected: isRecaptchaConfigured()
      }
    });

    try {
      await sendLeadNotification({ name, email, service, message, createdAt });
    } catch (notificationError) {
      console.error("Error enviando notificacion de lead", notificationError);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : "Error interno"
      })
    };
  }
};
