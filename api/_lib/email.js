const DEFAULT_FROM = "33Doctor <no-reply@33doctor.app.br>";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function emailLayout({ preview, eyebrow, title, body, actionLabel, actionUrl, footer }) {
  const safeActionUrl = escapeHtml(actionUrl);
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(preview)}</title>
  </head>
  <body style="margin:0;background:#f4f6f8;color:#151a22;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e6eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#101821;padding:22px 32px;color:#ffffff;">
                <div style="font-size:26px;font-weight:800;line-height:1;">+33<span style="color:#ef101b;">doctor</span></div>
                <div style="margin-top:8px;color:#cfd6df;font-size:11px;font-weight:700;text-transform:uppercase;">Plataforma de gestão do franqueado</div>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px;">
                <div style="color:#df0712;font-size:12px;font-weight:800;text-transform:uppercase;">${escapeHtml(eyebrow)}</div>
                <h1 style="margin:10px 0 16px;font-size:28px;line-height:1.2;">${escapeHtml(title)}</h1>
                <div style="color:#5e6875;font-size:16px;line-height:1.65;">${body}</div>
                <div style="margin:30px 0;">
                  <a href="${safeActionUrl}" style="display:inline-block;background:#ed0712;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;padding:15px 24px;border-radius:8px;">${escapeHtml(actionLabel)}</a>
                </div>
                <div style="color:#7a8491;font-size:13px;line-height:1.6;">${footer}</div>
              </td>
            </tr>
          </table>
          <div style="max-width:600px;padding:18px 8px;color:#8a939f;font-size:12px;line-height:1.5;">33Doctor App · Desenvolvido pela Nexa</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendEmail({ to, subject, html, text, idempotencyKey }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) throw new Error("Resend não configurado no servidor.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) {
    const error = new Error("O provedor de e-mail recusou o envio.");
    error.code = `resend_${response.status}`;
    throw error;
  }
  return payload;
}

async function sendPasswordRecoveryEmail({ to, name, actionUrl, requestId }) {
  const displayName = escapeHtml(name || "usuário");
  const html = emailLayout({
    preview: "Recupere seu acesso ao 33Doctor App",
    eyebrow: "Recuperação de acesso",
    title: "Crie uma nova senha",
    body: `<p style="margin:0 0 14px;">Olá, ${displayName}.</p><p style="margin:0;">Recebemos uma solicitação para redefinir sua senha no 33Doctor App. Use o botão abaixo para continuar com segurança.</p>`,
    actionLabel: "Redefinir minha senha",
    actionUrl,
    footer: "O link é temporário e só pode ser utilizado no fluxo seguro de recuperação. Se você não solicitou esta alteração, ignore este e-mail e sua senha permanecerá a mesma.",
  });

  return sendEmail({
    to,
    subject: "Recuperação de senha · 33Doctor App",
    html,
    text: `Olá, ${name || "usuário"}. Redefina sua senha do 33Doctor App acessando: ${actionUrl}`,
    idempotencyKey: requestId ? `password-recovery/${requestId}` : undefined,
  });
}

async function sendOverdueNotificationEmail({ to, name, unitName, overdueCount, actionUrl, reference }) {
  const count = Math.max(1, Number(overdueCount) || 1);
  const html = emailLayout({
    preview: `${unitName} possui ${count} pendência(s) em atraso`,
    eyebrow: "Atenção necessária",
    title: `${count} pendência(s) em atraso`,
    body: `<p style="margin:0 0 14px;">Olá, ${escapeHtml(name || "responsável pela unidade")}.</p><p style="margin:0;">A unidade <strong>${escapeHtml(unitName)}</strong> possui atividades fora do prazo. Acesse a implantação para revisar responsáveis, datas e observações.</p>`,
    actionLabel: "Ver pendências da unidade",
    actionUrl,
    footer: "Este aviso é enviado para ajudar a unidade a manter o cronograma de implantação atualizado.",
  });

  return sendEmail({
    to,
    subject: `Pendências em atraso · ${unitName}`,
    html,
    text: `${unitName} possui ${count} pendência(s) em atraso. Acesse: ${actionUrl}`,
    idempotencyKey: reference ? `overdue-notice/${reference}` : undefined,
  });
}

module.exports = {
  sendEmail,
  sendOverdueNotificationEmail,
  sendPasswordRecoveryEmail,
};
