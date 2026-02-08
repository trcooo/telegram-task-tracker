import crypto from "crypto";

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

export type TelegramInitData = {
  query_id?: string;
  user?: TelegramWebAppUser;
  auth_date: number;
};

function hmacSha256(key: Buffer | string, data: string) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

export function validateInitData(initDataRaw: string, botToken: string, maxAgeSeconds = 86400): TelegramInitData {
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get("hash");
  if (!hash) throw new Error("initData: missing hash");
  params.delete("hash");

  params.sort();
  const pairs: string[] = [];
  for (const [k, v] of params.entries()) pairs.push(`${k}=${v}`);
  const dataCheckString = pairs.join("\n");

  const secretKey = hmacSha256("WebAppData", botToken);
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (computedHash !== hash) throw new Error("initData: bad hash");

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) throw new Error("initData: bad auth_date");
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > maxAgeSeconds) throw new Error("initData: expired");

  const userStr = params.get("user");
  const user = userStr ? (JSON.parse(userStr) as TelegramWebAppUser) : undefined;

  return { query_id: params.get("query_id") ?? undefined, user, auth_date: authDate };
}
