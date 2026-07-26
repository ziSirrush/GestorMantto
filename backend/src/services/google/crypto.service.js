const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey() {
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY no está configurada.");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(text) {
  if (text === null || text === undefined || text === "") return null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(String(text), "utf8"),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64")
  ].join(":");
}

function decrypt(payload) {
  if (!payload) return null;

  const [ivB64, tagB64, dataB64] = String(payload).split(":");

  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Token cifrado inválido.");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64")
  );

  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

module.exports = {
  encrypt,
  decrypt
};
