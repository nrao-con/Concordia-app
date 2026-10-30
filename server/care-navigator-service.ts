import { db } from "./db";
import { conditionExplainerCache } from "@shared/schema";
import { eq } from "drizzle-orm";

export const EXPLAINER_DISCLAIMER =
  "This information is for general educational purposes only and is not a substitute for professional medical advice. Always consult your doctor or pharmacist before making health decisions.";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildCacheKey(conditionName: string, icd10Code?: string | null): string {
  return `${slugify(conditionName)}_${icd10Code ? slugify(icd10Code) : "none"}`;
}

export interface ConditionExplainer {
  plainSummary: string;
  commonTreatments: string[];
  lifestyleTips: string[];
  doctorQuestions: string[];
  aiGenerated: true;
  disclaimer: string;
  generatedAt: string;
}

export async function getConditionExplainer(
  conditionName: string,
  icd10Code: string | null | undefined,
  userId: string,
  conditionId: number
): Promise<ConditionExplainer> {
  const cacheKey = buildCacheKey(conditionName, icd10Code);
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [cached] = await db
    .select()
    .from(conditionExplainerCache)
    .where(eq(conditionExplainerCache.conditionKey, cacheKey));

  if (cached && cached.generatedAt > cutoff) {
    return {
      ...(cached.responseJson as Omit<ConditionExplainer, "generatedAt">),
      generatedAt: cached.generatedAt.toISOString(),
    };
  }

  const now = new Date();
  const fresh: Omit<ConditionExplainer, "generatedAt"> = {
    plainSummary: `${conditionName} is a medical condition. Please speak with your pharmacist or doctor for personalized information about your diagnosis and treatment options.`,
    commonTreatments: [],
    lifestyleTips: [],
    doctorQuestions: [],
    aiGenerated: true,
    disclaimer: EXPLAINER_DISCLAIMER,
  };

  await db
    .insert(conditionExplainerCache)
    .values({ conditionKey: cacheKey, responseJson: fresh, generatedAt: now })
    .onConflictDoUpdate({
      target: conditionExplainerCache.conditionKey,
      set: { responseJson: fresh, generatedAt: now },
    });

  return { ...fresh, generatedAt: now.toISOString() };
}

// Condition keyword -> OTC product category mapping (lowercase)
export const CONDITION_PRODUCT_MAP: Record<string, string[]> = {
  hypertension: ["heart health", "monitoring", "vitamins"],
  "high blood pressure": ["heart health", "monitoring", "vitamins"],
  "blood pressure": ["heart health", "monitoring"],
  diabetes: ["diabetic care", "monitoring", "vitamins"],
  diabetic: ["diabetic care", "monitoring", "vitamins"],
  "blood sugar": ["diabetic care", "monitoring"],
  arthritis: ["pain relief", "joint health", "vitamins"],
  "joint pain": ["pain relief", "joint health"],
  "rheumatoid": ["pain relief", "joint health", "vitamins"],
  asthma: ["respiratory", "allergy", "vitamins"],
  copd: ["respiratory", "vitamins"],
  respiratory: ["respiratory", "vitamins", "cough & cold"],
  allergy: ["allergy", "vitamins"],
  allergies: ["allergy", "vitamins"],
  cholesterol: ["heart health", "vitamins"],
  cardiovascular: ["heart health", "monitoring", "vitamins"],
  cardiac: ["heart health", "monitoring", "vitamins"],
  "heart disease": ["heart health", "monitoring", "vitamins"],
  depression: ["vitamins", "sleep aid"],
  anxiety: ["vitamins", "sleep aid"],
  insomnia: ["sleep aid", "vitamins"],
  sleep: ["sleep aid", "vitamins"],
  osteoporosis: ["vitamins", "joint health"],
  "acid reflux": ["digestive health"],
  gerd: ["digestive health"],
  digestive: ["digestive health", "vitamins"],
  thyroid: ["vitamins"],
  anemia: ["vitamins"],
  migraine: ["pain relief", "vitamins"],
  headache: ["pain relief"],
  "chronic pain": ["pain relief", "joint health"],
  skin: ["skin care", "vitamins"],
  eczema: ["skin care", "vitamins"],
  psoriasis: ["skin care", "vitamins"],
  dental: ["dental", "vitamins"],
  "cold and flu": ["cough & cold", "vitamins"],
  flu: ["cough & cold", "vitamins"],
};

export function getProductCategoriesForCondition(conditionName: string): string[] {
  const name = conditionName.toLowerCase();
  const matched = new Set<string>();
  for (const [keyword, categories] of Object.entries(CONDITION_PRODUCT_MAP)) {
    if (name.includes(keyword)) {
      categories.forEach((c) => matched.add(c.toLowerCase()));
    }
  }
  return Array.from(matched);
}

export interface NextStepCta {
  action: string;
  label: string;
  url: string;
  description: string;
}

export function getNextStepsForCondition(conditionName: string): NextStepCta[] {
  const categories = getProductCategoriesForCondition(conditionName);
  const name = conditionName.toLowerCase();
  const steps: NextStepCta[] = [];

  steps.push({
    action: "medication_reminders",
    label: "Set up medication reminders",
    url: "/reminders",
    description: "Never miss a dose with scheduled medication reminders.",
  });

  const isCardiovascular =
    categories.some((c) => c.includes("heart") || c.includes("monitoring")) ||
    name.includes("cardiovascular") ||
    name.includes("hypertension") ||
    name.includes("blood pressure") ||
    name.includes("cardiac");

  if (isCardiovascular) {
    steps.push({
      action: "blister_pack",
      label: "Ask about blister pack service",
      url: "/blister-packs",
      description: "Organized weekly pill packs make it easier to stay on track with heart medications.",
    });
  }

  const needsMonitoring =
    categories.some((c) => c.includes("monitoring")) ||
    name.includes("diabetes") ||
    name.includes("blood pressure");

  if (needsMonitoring) {
    steps.push({
      action: "shop_monitoring",
      label: "Browse monitoring supplies",
      url: "/shop",
      description: "Blood pressure monitors, glucose meters, and diabetic care supplies.",
    });
  }

  const isRespiratory =
    name.includes("respiratory") ||
    name.includes("asthma") ||
    name.includes("allergy") ||
    name.includes("copd") ||
    name.includes("flu");

  if (isRespiratory) {
    steps.push({
      action: "flu_shot",
      label: "Schedule a flu shot",
      url: "/pharmacy-chat",
      description: "Respiratory conditions make annual flu vaccination especially important.",
    });
  }

  steps.push({
    action: "prescription_transfer",
    label: "Transfer prescriptions to ConcordiaCare",
    url: "/pharmacy-chat",
    description: "Get all your medications managed in one convenient place.",
  });

  return steps;
}
