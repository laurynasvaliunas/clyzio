// Shared transactional email: SMTP sender (provider-agnostic) + on-brand layout
// matching supabase/email-templates/* (gradient #006064→#26C6DA header, CLYZIO
// wordmark + #FDD835 dot, footer). Reads SMTP_* + EMAIL_FROM + SALES_EMAIL secrets.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const FROM = Deno.env.get("EMAIL_FROM") ?? "Clyzio <noreply@clyzio.com>";
export const SALES_EMAIL = Deno.env.get("SALES_EMAIL") ?? "info@clyzio.com";

export async function sendMail(opts: {
  to: string; subject: string; html: string; replyTo?: string;
}): Promise<void> {
  const hostname = Deno.env.get("SMTP_HOST");
  const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
  const username = Deno.env.get("SMTP_USER");
  const password = Deno.env.get("SMTP_PASS");
  if (!hostname || !username || !password) {
    throw new Error("smtp_not_configured");
  }
  const client = new SMTPClient({
    connection: { hostname, port, tls: port === 465, auth: { username, password } },
  });
  try {
    await client.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo,
    });
  } finally {
    await client.close();
  }
}

// ── Brand layout ──────────────────────────────────────────────────────────────
function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

export function renderEmail(o: {
  title: string;
  emoji?: string;
  heading: string;
  intro: string;
  ctaText?: string;
  ctaUrl?: string;
  bodyExtraHtml?: string;
  footerNote?: string;
}): string {
  const cta = o.ctaText && o.ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" style="padding:8px 0 28px;">
         <a href="${o.ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#26C6DA,#00ACC1);color:#fff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 40px;border-radius:50px;letter-spacing:0.3px;box-shadow:0 4px 16px rgba(38,198,218,0.35);">${esc(o.ctaText)}</a>
       </td></tr></table>`
    : "";
  const link = o.ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px solid #E0F2F3;padding-top:20px;">
         <p style="margin:0 0 10px;font-size:13px;color:#90A4AE;">Or copy and paste this link into your browser:</p>
         <p style="margin:0;font-size:12px;color:#26C6DA;word-break:break-all;background:#F0FAFB;padding:10px 14px;border-radius:8px;border-left:3px solid #26C6DA;">${esc(o.ctaUrl)}</p>
       </td></tr></table>`
    : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background-color:#EFF8F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#EFF8F9;"><tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,96,100,0.10);">
    <tr><td style="background:linear-gradient(135deg,#006064 0%,#00838F 50%,#26C6DA 100%);padding:32px 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td><span style="font-size:26px;font-weight:800;color:#fff;letter-spacing:1.5px;">CLYZIO</span></td>
          <td style="padding-left:4px;vertical-align:top;padding-top:3px;"><div style="width:8px;height:8px;border-radius:50%;background:#FDD835;"></div></td>
        </tr></table>
        <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.75);">Green Commutes, Together</p></td>
        <td align="right" valign="middle"><div style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.15);text-align:center;line-height:48px;font-size:22px;">${o.emoji ?? "🌿"}</div></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:36px 40px 28px;">
      <h1 style="margin:0 0 10px;font-size:23px;font-weight:700;color:#0F172A;letter-spacing:-0.3px;">${esc(o.heading)}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#546E7A;">${o.intro}</p>
      ${cta}
      ${o.bodyExtraHtml ?? ""}
      ${link}
    </td></tr>
    <tr><td style="background:#F5FAFA;padding:20px 40px;border-top:1px solid #E0F2F3;">
      <p style="margin:0;font-size:12px;color:#90A4AE;line-height:1.6;">&copy; 2026 Clyzio. All rights reserved.<br/>${o.footerNote ?? `Questions? Reach us at <a href="mailto:info@clyzio.com" style="color:#26C6DA;text-decoration:none;">info@clyzio.com</a>.`}</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

// ── Typed renderers ───────────────────────────────────────────────────────────
type Rendered = { subject: string; html: string };

export function demoAck(d: { name?: string; company?: string }): Rendered {
  return {
    subject: "Thanks for your interest in Clyzio",
    html: renderEmail({
      title: "Thanks for your interest in Clyzio",
      emoji: "👋",
      heading: `Thanks${d.name ? `, ${esc(d.name)}` : ""}!`,
      intro: `We received your request${d.company ? ` for <strong>${esc(d.company)}</strong>` : ""}. A Clyzio specialist will reach out shortly to set up your free pilot and walk you through CSRD-ready commuting-emissions reporting.`,
      bodyExtraHtml: `<p style="margin:0 0 8px;font-size:14px;color:#546E7A;">In the meantime, you can explore how Clyzio helps you measure, report, and reduce Scope 3 employee-commuting emissions.</p>`,
    }),
  };
}

export function demoNotify(d: {
  type: string; name?: string; email: string; company?: string; employees?: string; message?: string;
}): Rendered {
  return {
    subject: `New ${d.type === "contact" ? "contact" : "demo"} request — ${d.company || d.email}`,
    html: renderEmail({
      title: "New lead",
      emoji: "📨",
      heading: `New ${d.type === "contact" ? "contact" : "demo / pilot"} request`,
      intro: `A new ${esc(d.type)} request came in from the website.`,
      bodyExtraHtml: `<table role="presentation" width="100%" style="font-size:14px;color:#0F172A;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#90A4AE;width:120px;">Name</td><td>${esc(d.name || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#90A4AE;">Email</td><td>${esc(d.email)}</td></tr>
        <tr><td style="padding:6px 0;color:#90A4AE;">Company</td><td>${esc(d.company || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#90A4AE;">Employees</td><td>${esc(d.employees || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#90A4AE;vertical-align:top;">Message</td><td>${esc(d.message || "—")}</td></tr>
      </table>`,
    }),
  };
}

export function inviteEmail(d: { company: string; joinUrl: string; inviterName?: string }): Rendered {
  return {
    subject: `You're invited to join ${d.company} on Clyzio`,
    html: renderEmail({
      title: "You're invited to Clyzio",
      emoji: "🚶",
      heading: `Join ${esc(d.company)} on Clyzio`,
      intro: `${d.inviterName ? `${esc(d.inviterName)} invited you` : "You've been invited"} to join <strong>${esc(d.company)}</strong>'s commuting team on Clyzio — log greener commutes, find carpools, and help hit your company's sustainability goals.`,
      ctaText: "Accept invitation",
      ctaUrl: d.joinUrl,
      footerNote: `This invitation expires in 14 days. If you weren't expecting it, you can ignore this email.`,
    }),
  };
}

export function esgReadyEmail(d: { company: string; period: string; reportUrl: string }): Rendered {
  return {
    subject: `Your Clyzio ESG report is ready — ${d.period}`,
    html: renderEmail({
      title: "Your ESG report is ready",
      emoji: "📊",
      heading: "Your ESG report is ready",
      intro: `The Scope 3 employee-commuting report for <strong>${esc(d.company)}</strong> (${esc(d.period)}) has finished generating and is ready to download.`,
      ctaText: "View report",
      ctaUrl: d.reportUrl,
    }),
  };
}

export function welcomeEmail(d: { firstName?: string; appUrl?: string }): Rendered {
  return {
    subject: "Welcome to Clyzio 🌿",
    html: renderEmail({
      title: "Welcome to Clyzio",
      emoji: "🌿",
      heading: `Welcome${d.firstName ? `, ${esc(d.firstName)}` : ""}!`,
      intro: `You're all set. Log your commutes in under 30 seconds, see your CO₂ impact, and match with colleagues for carpools. Set your home & work locations to get personalized green-commute suggestions.`,
      ctaText: d.appUrl ? "Open Clyzio" : undefined,
      ctaUrl: d.appUrl,
    }),
  };
}
