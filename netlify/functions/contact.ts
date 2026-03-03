import type { Handler } from "@netlify/functions";
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
    const submittedAt = Number(payload.submittedAt || 0);

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

    await db.collection("leads").add({
      name,
      email,
      service,
      message,
      createdAt: new Date().toISOString(),
      source: "landing-page-corporativa",
      metadata: {
        userAgent: event.headers["user-agent"] ?? "",
        ip: event.headers["x-nf-client-connection-ip"] ?? ""
      }
    });

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
