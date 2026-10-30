-- Create nutrition_chat_messages table for persisting Health Chat / Nutrition Advisor history per user
CREATE TABLE IF NOT EXISTS "nutrition_chat_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "products" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_nutrition_chat_user" ON "nutrition_chat_messages" ("user_id");
