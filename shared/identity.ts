export class IdentityValidationError extends Error {
  constructor(public readonly field: "email" | "phone", message: string) {
    super(message);
    this.name = "IdentityValidationError";
  }
}

export function normalizeEmail(value: string): string {
  if (typeof value !== "string") throw new IdentityValidationError("email", "Email must be a string.");
  const normalized = value.trim().normalize("NFKC").toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new IdentityValidationError("email", "Please provide a valid email address.");
  }
  return normalized;
}

export function normalizePhone(value: string): string {
  if (typeof value !== "string") throw new IdentityValidationError("phone", "Phone number must be a string.");
  if (!/^[\d\s()+\-./]+$/.test(value.trim())) {
    throw new IdentityValidationError("phone", "Phone number contains invalid characters.");
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  throw new IdentityValidationError("phone", "Phone number must contain 10 digits or 1 followed by 10 digits.");
}