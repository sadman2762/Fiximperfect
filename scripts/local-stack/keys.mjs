// Prints local anon/service-role JWTs signed with the local JWT secret.
import crypto from "node:crypto";

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET required");
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const sign = (payload) => {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  return `${head}.${body}.${crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
};
const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
console.log(`NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`);
console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${sign({ iss: "supabase-local", role: "anon", exp })}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY=${sign({ iss: "supabase-local", role: "service_role", exp })}`);
