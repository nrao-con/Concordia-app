import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { chatStorage } from "./storage";
import { getCanonicalUserId, isAuthenticated } from "../auth";
import { db } from "../../db";
import { medications } from "@shared/schema";
import { eq } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function requireAuthenticatedUserId(req: Request): string {
  const userId = getCanonicalUserId(req);
  if (!userId) throw new Error("Authenticated user ID missing");
  return userId;
}

const SYSTEM_PROMPT = `You are a knowledgeable and compassionate pharmacy assistant for ConcordiaCare Pharmacy, located at 898 E Tremont Ave, Bronx, NY 10460 (phone: 718-328-2833).

Your role is to help patients — primarily seniors — with general health and medication questions. Communicate clearly using plain, simple language. Avoid medical jargon. Be warm, patient, and thorough.

You can help with:
- General questions about medications (side effects, interactions, how to take them correctly)
- OTC product recommendations (pain relief, vitamins, cold/flu, etc.)
- General health and wellness guidance
- Answering questions about the patient's listed medications

Important guidelines:
- Always recommend the patient consult their pharmacist or doctor for diagnosis, prescription changes, or urgent medical issues
- For emergencies, always direct the patient to call 911 or go to the nearest emergency room
- Never diagnose conditions or recommend changing prescription dosages
- If a patient's medications are provided, use that context to give personalized, relevant answers
- Keep responses concise but complete — seniors appreciate clarity over length
- If asked something outside your scope, politely redirect to the pharmacy at 718-328-2833`;

export function registerChatRoutes(app: Express): void {
  app.get("/api/conversations", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = requireAuthenticatedUserId(req);
      const convos = await chatStorage.getAllConversations(userId);
      res.json(convos);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = requireAuthenticatedUserId(req);
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id, userId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const msgs = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages: msgs });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = requireAuthenticatedUserId(req);
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat", userId);
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.delete("/api/conversations/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = requireAuthenticatedUserId(req);
      const id = parseInt(req.params.id);
      await chatStorage.deleteConversation(id, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  app.post("/api/conversations/:id/messages", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = requireAuthenticatedUserId(req);
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;

      const conversation = await chatStorage.getConversation(conversationId, userId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Save the user message
      await chatStorage.createMessage(conversationId, "user", content);

      // Fetch patient's medication list for context
      const patientMeds = await db
        .select({ name: medications.name, dosage: medications.dosage, frequency: medications.frequency })
        .from(medications)
        .where(eq(medications.userId, userId));

      const medContext =
        patientMeds.length > 0
          ? `\n\nThis patient's current medications:\n${patientMeds
              .map((m) => `- ${m.name} ${m.dosage}, ${m.frequency}`)
              .join("\n")}`
          : "";

      // Build message history for the AI
      const history = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages = history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // Stream response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + medContext },
          ...chatMessages,
        ],
        stream: true,
        max_completion_tokens: 1024,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          fullResponse += delta;
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
      }

      // Save the assistant response
      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Health chat AI error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}
