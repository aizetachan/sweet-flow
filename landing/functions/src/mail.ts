import nodemailer from "nodemailer";
import type { ContactInput } from "./validate.js";

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
};

/** Sends a "Habla con nosotros" message to the team inbox. Reply-To is the sender. */
export async function sendContactMail(cfg: SmtpConfig, input: ContactInput): Promise<void> {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  const text = [
    `Nombre: ${input.name}`,
    `Correo: ${input.email}`,
    "",
    input.message,
    "",
    "— Enviado desde el formulario «Habla con nosotros» de la landing de Sweet Flow.",
  ].join("\n");
  await transport.sendMail({
    from: cfg.from,
    to: cfg.to,
    replyTo: `${input.name} <${input.email}>`,
    subject: `Sweet Flow · Mensaje de ${input.name}`,
    text,
  });
}
