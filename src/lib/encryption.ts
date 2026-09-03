import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "melomania-secret-encryption-key-32b!"; // 32 characters fallback
const IV_LENGTH = 16;

if (
  process.env.NODE_ENV === "production" &&
  (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32)
) {
  console.warn("[encryption] ENCRYPTION_KEY missing or too short — OAuth tokens are not safely encrypted.");
}

/**
 * Encrypts sensitive strings (e.g. OAuth tokens) before storing in DB
 */
export function encryptToken(text: string): string {
  if (!text) return "";
  try {
    const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return `${iv.toString("hex")}:${encrypted}`;
  } catch (err) {
    console.error("Encryption error:", err);
    return Buffer.from(text).toString("base64");
  }
}

/**
 * Decrypts server-side stored tokens
 */
export function decryptToken(encryptedText: string): string {
  if (!encryptedText) return "";
  try {
    const [ivHex, encrypted] = encryptedText.split(":");
    if (!ivHex || !encrypted) {
      return Buffer.from(encryptedText, "base64").toString("utf8");
    }
    const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Decryption error:", err);
    return "";
  }
}
