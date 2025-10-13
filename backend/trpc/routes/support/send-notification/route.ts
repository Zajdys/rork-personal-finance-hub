import { z } from "zod";
import { protectedProcedure } from "../../../create-context";

export const sendSupportNotificationProcedure = protectedProcedure
  .input(
    z.object({
      userName: z.string(),
      userEmail: z.string().email().optional(),
      issue: z.string(),
      conversationHistory: z.array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
          timestamp: z.string(),
        })
      ),
    })
  )
  .mutation(async ({ input }) => {
    const { userName, userEmail, issue, conversationHistory } = input;

    const conversationText = conversationHistory
      .map((msg) => `[${msg.timestamp}] ${msg.role === "user" ? "Uživatel" : "AI"}: ${msg.content}`)
      .join("\n\n");

    const emailBody = `
Nová žádost o podporu z MoneyBuddy

Uživatel: ${userName}
Email: ${userEmail || "Neposkytnut"}

Problém/Stížnost:
${issue}

Historie konverzace:
${conversationText}

---
Toto je automatická notifikace z MoneyBuddy Support Chat.
    `.trim();

    console.log("=== SUPPORT NOTIFICATION ===");
    console.log("To: moneybuddy@email.cz");
    console.log("Subject: Nová žádost o podporu - MoneyBuddy");
    console.log("Body:", emailBody);
    console.log("============================");

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY || ""}`,
        },
        body: JSON.stringify({
          from: "MoneyBuddy Support <support@moneybuddy.cz>",
          to: ["moneybuddy@email.cz"],
          subject: "Nová žádost o podporu - MoneyBuddy",
          text: emailBody,
        }),
      });

      if (!response.ok) {
        console.error("Failed to send email via Resend:", await response.text());
        return {
          success: false,
          message: "Email se nepodařilo odeslat, ale notifikace byla zalogována.",
        };
      }

      return {
        success: true,
        message: "Notifikace byla úspěšně odeslána na moneybuddy@email.cz",
      };
    } catch (error) {
      console.error("Error sending support notification:", error);
      return {
        success: false,
        message: "Notifikace byla zalogována do konzole.",
      };
    }
  });
