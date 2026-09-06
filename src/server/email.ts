import nodemailer from "nodemailer";

export type AccountEmailKind = "reactivate" | "password_reset" | "pro_reward";

type EmailMessage = { subject: string; html: string; text: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

export function accountEmailTemplate(input: { kind: AccountEmailKind; displayName: string; link: string; expiresText?: string; note?: string }) {
  const title = input.kind === "reactivate" ? "你的 StudyNova 帳號已重新啟動" : input.kind === "password_reset" ? "StudyNova 密碼重設通知" : "你獲得了 StudyNova Pro 資格";
  const intro = input.kind === "reactivate" ? "恭喜你！你的 StudyNova 帳號已完成重新啟動，現在可以重新登入並繼續學習。" : input.kind === "password_reset" ? "我們收到密碼重設要求，請點擊下方按鈕設定新密碼。" : "恭喜你！你已獲得 StudyNova Nova Pro 資格，點擊下方按鈕即可啟用。";
  const note = input.note ? `<p style="color:#526173;line-height:1.8">${escapeHtml(input.note)}</p>` : "";
  const expires = input.expiresText ? `<p style="color:#7b8794;font-size:13px">請注意：此連結將在 ${escapeHtml(input.expiresText)} 後失效，逾期後必須重新申請。</p>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f4ebdd;font-family:Arial,'Noto Sans TC',sans-serif;color:#102940"><div style="max-width:620px;margin:32px auto;padding:12px"><div style="background:#fffdf9;border:1px solid #e4d8c7;border-radius:24px;overflow:hidden"><div style="padding:28px 32px;background:#102940;color:white"><div style="font-size:24px;font-weight:800">Study<span style="color:#2cb9b0">Nova</span></div><div style="margin-top:8px;color:#b8dfe0;font-size:13px">讓學習更聰明，讓進步看得見</div></div><div style="padding:32px"><p style="font-size:18px;font-weight:700">${escapeHtml(input.displayName)}，您好：</p><p style="color:#526173;line-height:1.8">${intro}</p>${note}<div style="text-align:center;margin:28px 0"><a href="${escapeHtml(input.link)}" style="display:inline-block;padding:14px 24px;background:#19aaa7;color:white;text-decoration:none;border-radius:12px;font-weight:700">${input.kind === "reactivate" ? "重新啟動帳號" : input.kind === "password_reset" ? "設定新密碼" : "啟用 Pro 資格"}</a></div>${expires}<p style="color:#7b8794;font-size:13px;line-height:1.7">若按鈕無法使用，請將下方連結貼到瀏覽器：<br>${escapeHtml(input.link)}</p></div><div style="padding:18px 32px;border-top:1px solid #eee5d8;color:#7b8794;font-size:12px">此信由 StudyNova 系統發送，請勿直接回覆。</div></div></div></body></html>`;
  return { subject: `${title}｜StudyNova`, html, text: `${input.displayName}，您好：\n\n${intro}\n\n連結：${input.link}\n${input.expiresText ? `請注意：此連結將在 ${input.expiresText} 後失效，逾期後必須重新申請。` : ""}` };
}

export function systemAnnouncementEmailTemplate(input: { displayName: string; title: string; body: string; link: string; category?: string; tags?: string[] }) {
  const tags = input.tags?.length ? `<div style="margin:18px 0">${input.tags.map((tag) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:999px;background:#e4f5f2;color:#127d78;font-size:12px">#${escapeHtml(tag)}</span>`).join("")}</div>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f4ebdd;font-family:Arial,'Noto Sans TC',sans-serif;color:#102940"><div style="max-width:620px;margin:32px auto;padding:12px"><div style="background:#fffdf9;border:1px solid #e4d8c7;border-radius:24px;overflow:hidden"><div style="padding:28px 32px;background:#102940;color:white"><div style="font-size:24px;font-weight:800">Study<span style="color:#2cb9b0">Nova</span></div><div style="margin-top:8px;color:#b8dfe0;font-size:13px">${escapeHtml(input.category ?? "系統公告")}</div></div><div style="padding:32px"><p style="font-size:14px;color:#526173">${escapeHtml(input.displayName)}，您好：</p><h1 style="font-size:26px;line-height:1.35;color:#102940">${escapeHtml(input.title)}</h1>${tags}<p style="color:#526173;line-height:2;white-space:pre-line">${escapeHtml(input.body)}</p><div style="text-align:center;margin:30px 0"><a href="${escapeHtml(input.link)}" style="display:inline-block;padding:14px 26px;background:#19aaa7;color:white;text-decoration:none;border-radius:12px;font-weight:700">立即查看公告</a></div><p style="color:#7b8794;font-size:13px">如果按鈕無法使用，請將下方連結貼到瀏覽器：<br>${escapeHtml(input.link)}</p></div><div style="padding:18px 32px;border-top:1px solid #eee5d8;color:#7b8794;font-size:12px">此信由 StudyNova 系統發送，請勿直接回覆。</div></div></div></body></html>`;
  return { subject: `📢 ${input.title}｜StudyNova`, html, text: `${input.displayName}，您好：\n\n${input.title}\n\n${input.body}\n\n立即查看：${input.link}\n\nStudyNova 敬上` };
}

export function accountLinkCopy(input: { kind: "password_reset" | "appeal" | "reactivate" | "pro_reward" | "nova_reward"; link: string; value?: number; expiresText?: string; reason?: string }) {
  const message = input.kind === "pro_reward"
    ? `恭喜你！你已獲得 Nova Pro ${input.value ?? 30} 天。\n原因：${input.reason ?? "StudyNova 學習獎勵"}`
    : input.kind === "nova_reward"
      ? `恭喜你！你已獲得 ${input.value ?? 100} Nova 點數。\n原因：${input.reason ?? "StudyNova 學習獎勵"}`
      : input.kind === "reactivate"
        ? `恭喜你！你的 StudyNova 帳號已重新啟動。\n原因：${input.reason ?? "申訴審核通過"}`
        : input.kind === "appeal"
          ? "如果你認為帳號遭到誤封，可以透過以下連結提交正式申訴。"
          : "請透過以下連結重設你的 StudyNova 密碼。";
  return `${message}\n\n連結：${input.link}${input.expiresText ? `\n請注意：此連結將在 ${input.expiresText} 後失效，逾期後必須重新申請。` : ""}\n\nStudyNova 敬上`;
}

function smtpConfig() {
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.replace(/\s/g, "");
  if (!user || !password) return null;
  const port = Number(process.env.SMTP_PORT ?? "465");
  return {
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE !== "false" : port === 465,
    auth: { user, pass: password },
    from: process.env.EMAIL_FROM ?? `StudyNova <${user}>`,
  };
}

export function smtpConfigured() {
  return Boolean(smtpConfig());
}

export async function sendAccountEmail(to: string, email: EmailMessage) {
  const config = smtpConfig();
  if (!config) return { sent: false, configured: false, reason: "尚未設定 Gmail SMTP：SMTP_USER 與 SMTP_PASSWORD" };
  try {
    const transporter = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: config.auth });
    const result = await transporter.sendMail({ from: config.from, to, subject: email.subject, html: email.html, text: email.text });
    return { sent: true, configured: true, id: result.messageId };
  } catch (error) {
    console.error("[email] Gmail SMTP send failed", error);
    return { sent: false, configured: true, reason: "Gmail SMTP 寄信失敗，請確認帳號、應用程式密碼與 Vercel 環境變數" };
  }
}

export async function sendPasswordResetEmail(input: { to: string; displayName: string; link: string; expiresText: string }) {
  return sendAccountEmail(input.to, accountEmailTemplate({ kind: "password_reset", displayName: input.displayName, link: input.link, expiresText: input.expiresText }));
}
