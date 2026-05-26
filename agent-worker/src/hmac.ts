import crypto from "node:crypto";

const SECRET = process.env.AGENT_WORKER_HMAC_SECRET || "";

export function sign(body: string): string {
  if (!SECRET) throw new Error("AGENT_WORKER_HMAC_SECRET nao configurado");
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

export function verify(body: string, signature: string | undefined): boolean {
  if (!SECRET || !signature) return false;
  const expected = sign(body);
  // timingSafeEqual exige Buffers do mesmo tamanho
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
