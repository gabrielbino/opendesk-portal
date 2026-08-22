import { ENV } from "./env";

export type EmailPayload = {
  to: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
};

/**
 * Sends an email through the Manus Email Service API.
 * Returns `true` if the email was sent successfully, `false` if the service is unavailable.
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    console.warn("[Email] Email service not configured");
    return false;
  }

  try {
    const endpoint = new URL(
      "webdevtoken.v1.WebDevService/SendEmail",
      ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`
    ).toString();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify({
        to: payload.to,
        subject: payload.subject,
        htmlContent: payload.htmlContent,
        textContent: payload.textContent || stripHtml(payload.htmlContent),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Email] Failed to send email to ${payload.to} (${response.status} ${response.statusText})${
          detail ? `: ${detail}` : ""
        }`
      );
      return false;
    }

    console.log(`[Email] Successfully sent email to ${payload.to}`);
    return true;
  } catch (error) {
    console.warn(`[Email] Error sending email to ${payload.to}:`, error);
    return false;
  }
}

/**
 * Strips HTML tags from content to create plain text version
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Generates HTML email template for ticket response notification
 */
export function generateTicketResponseEmailTemplate(data: {
  ticketId: string;
  ticketTitle: string;
  responderName: string;
  responseContent: string;
  ticketUrl: string;
}): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #003366; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
          .ticket-info { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #003366; }
          .ticket-info strong { color: #003366; }
          .response-box { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #0059b3; }
          .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; background-color: #003366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          .button:hover { background-color: #004080; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Resposta no Chamado</h1>
          </div>
          
          <div class="content">
            <p>Olá,</p>
            
            <p>Você recebeu uma resposta no seu chamado:</p>
            
            <div class="ticket-info">
              <strong>Chamado:</strong> ${data.ticketId}<br>
              <strong>Título:</strong> ${data.ticketTitle}<br>
              <strong>Respondido por:</strong> ${data.responderName}
            </div>
            
            <div class="response-box">
              <strong>Resposta:</strong><br>
              <p>${escapeHtml(data.responseContent).replace(/\n/g, "<br>")}</p>
            </div>
            
            <p>
              <a href="${data.ticketUrl}" class="button">Ver Chamado Completo</a>
            </p>
            
            <p>
              Acesse o portal OpenDesk para visualizar todos os detalhes do chamado e continuar a conversa.
            </p>
          </div>
          
          <div class="footer">
            <p>Este é um email automático do sistema OpenDesk. Não responda este email.</p>
            <p>&copy; 2026 OpenDesk. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Escapes HTML special characters
 */
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Generates HTML email template for new ticket notification to admins
 */
export function generateNewTicketEmailTemplate(data: {
  ticketId: string;
  ticketTitle: string;
  creatorName: string;
  description: string;
  priority: string;
  ticketUrl: string;
}): string {
  const priorityColor = {
    Baixa: "#28a745",
    Média: "#ffc107",
    Alta: "#dc3545",
  }[data.priority] || "#6c757d";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #003366; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
          .ticket-info { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #003366; }
          .ticket-info strong { color: #003366; }
          .priority-badge { display: inline-block; padding: 5px 10px; border-radius: 3px; color: white; font-weight: bold; }
          .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; background-color: #003366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          .button:hover { background-color: #004080; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Novo Chamado Aberto</h1>
          </div>
          
          <div class="content">
            <p>Um novo chamado foi aberto no sistema OpenDesk:</p>
            
            <div class="ticket-info">
              <strong>Chamado:</strong> ${data.ticketId}<br>
              <strong>Título:</strong> ${data.ticketTitle}<br>
              <strong>Criado por:</strong> ${data.creatorName}<br>
              <strong>Prioridade:</strong> <span class="priority-badge" style="background-color: ${priorityColor};">${data.priority}</span><br>
              <strong>Descrição:</strong><br>
              <p>${escapeHtml(data.description).replace(/\n/g, "<br>")}</p>
            </div>
            
            <p>
              <a href="${data.ticketUrl}" class="button">Atender Chamado</a>
            </p>
          </div>
          
          <div class="footer">
            <p>Este é um email automático do sistema OpenDesk. Não responda este email.</p>
            <p>&copy; 2026 OpenDesk. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}
