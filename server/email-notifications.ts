import { ReplitConnectors } from "@replit/connectors-sdk";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/schema";

const connectors = new ReplitConnectors();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!);
}

export async function sendPatientUpdateEmail(
  userId: string,
  subject: string,
  message = "There is an update to your pharmacy order. Sign in to ConcordiaCare to review it.",
): Promise<boolean> {
  const from = process.env.EMAIL_FROM_ADDRESS?.trim();
  if (!from) {
    console.warn("[Email] EMAIL_FROM_ADDRESS is not configured; update email skipped");
    return false;
  }

  const [user] = await db
    .select({ email: users.email, enabled: users.emailNotificationsEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.email || !user.enabled) return false;

  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [user.email],
      subject: `ConcordiaCare: ${subject}`,
      text: `${message}\n\nFor your privacy, medication details are available only after you sign in to ConcordiaCare.`,
      html: `<p>${escapeHtml(message)}</p><p>For your privacy, medication details are available only after you sign in to ConcordiaCare.</p>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend returned ${response.status}: ${body.slice(0, 200)}`);
  }
  return true;
}