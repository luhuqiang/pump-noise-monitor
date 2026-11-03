const LICENSE_KEY = "pump-noise-license-v1";

const PUBLIC_JWK: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "3S2cA4BgbyleIbx-hVD-yr7ACmOrRaMr8wMWNcCT3XM",
  y: "8CT-uCjl85wh9QzZ_rF9LpwjcMdk0z70JRU_icyDDiQ",
};

export type LicenseAction = "none" | "valid" | "expired" | "invalid" | "error";

export type LicenseState = {
  status: LicenseAction;
  machine: string;
  source: "native" | "web";
  expiry: number | null;
  remainingDays: number;
  message: string;
};

type LicenseRecord = {
  code: string;
  machine: string;
  days: number;
  issued: number;
  activatedAt: number;
  expiry: number;
  lastSeen: number;
  /** 本机已使用过的授权码内容段，用于阻止同一份授权重复累加。 */
  used?: string[];
};

const CODE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type NativeBridge = {
  getMachineCode?: () => string;
  shareText?: (title: string, text: string) => void;
};

declare global {
  interface Window {
    NativeBridge?: NativeBridge;
  }
}

function hex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function groupMachine(code: string) {
  return code.replace(/([0-9A-F]{4})([0-9A-F]{4})([0-9A-F]{4})([0-9A-F]{4})/, "$1-$2-$3-$4");
}

export function ungroupMachine(input: string) {
  return input.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 16);
}

/** 机器码：优先取 Android 原生桥（硬件 + ANDROID_ID），网页环境退化为设备指纹。 */
export async function getMachineId(): Promise<{ code: string; source: "native" | "web" }> {
  const native = window.NativeBridge?.getMachineCode?.();
  if (typeof native === "string") {
    const code = ungroupMachine(native);
    if (code.length === 16) return { code, source: "native" };
  }
  const raw = [
    navigator.userAgent,
    navigator.language,
    String(navigator.hardwareConcurrency ?? 0),
    String(screen.width),
    String(screen.height),
    String(Math.round((screen as Screen & { colorDepth?: number }).colorDepth ?? 0)),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join("|");
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`PUMP-WEB|${raw}`));
    return { code: hex(digest).slice(0, 16), source: "web" };
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return { code: h.toString(16).toUpperCase().padStart(8, "0").repeat(2).slice(0, 16), source: "web" };
}

function toBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const bin = atob(padded + "=".repeat(pad));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodePayload(payload: string) {
  try {
    return new TextDecoder().decode(toBytes(payload));
  } catch {
    return null;
  }
}

async function verifySignature(text: string, signature: string) {
  if (!globalThis.crypto?.subtle) return false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      PUBLIC_JWK,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      toBytes(signature),
      new TextEncoder().encode(text),
    );
  } catch {
    return false;
  }
}

function readRecord(): LicenseRecord | null {
  try {
    const raw = localStorage.getItem(LICENSE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LicenseRecord>;
    if (
      typeof parsed.code !== "string" ||
      typeof parsed.machine !== "string" ||
      typeof parsed.days !== "number" ||
      typeof parsed.issued !== "number" ||
      typeof parsed.activatedAt !== "number" ||
      typeof parsed.expiry !== "number"
    ) {
      return null;
    }
    return {
      code: parsed.code,
      machine: parsed.machine,
      days: parsed.days,
      issued: parsed.issued,
      activatedAt: parsed.activatedAt,
      expiry: parsed.expiry,
      lastSeen: typeof parsed.lastSeen === "number" ? parsed.lastSeen : 0,
      used: Array.isArray(parsed.used)
        ? parsed.used.filter((item): item is string => typeof item === "string").slice(0, 40)
        : [],
    };
  } catch {
    return null;
  }
}

function writeRecord(record: LicenseRecord) {
  try {
    localStorage.setItem(LICENSE_KEY, JSON.stringify(record));
  } catch {
    /* 存储失败只影响下次启动 */
  }
}

function remaining(expiry: number, now: number) {
  return Math.max(0, Math.ceil((expiry - now) / DAY_MS));
}

export async function inspectLicense(): Promise<LicenseState> {
  const { code: machine, source } = await getMachineId();
  const record = readRecord();
  if (!record) {
    return { status: "none", machine, source, expiry: null, remainingDays: 0, message: "" };
  }
  const now = Math.max(Date.now(), record.lastSeen);
  const [payload, signature] = record.code.split(".");
  if (!payload || !signature) {
    return { status: "invalid", machine, source, expiry: null, remainingDays: 0, message: "本机授权记录损坏，请重新输入授权码。" };
  }
  const verified = await verifySignature(
    decodePayload(payload) ?? "",
    signature,
  );
  const text = decodePayload(payload);
  if (!text) {
    return { status: "invalid", machine, source, expiry: null, remainingDays: 0, message: "本机授权记录损坏，请重新输入授权码。" };
  }
  const parts = text.split("|");
  if (!verified || parts[0] !== "PN1" || parts.length !== 4) {
    return { status: "invalid", machine, source, expiry: null, remainingDays: 0, message: "授权校验失败，请检查授权码是否完整。" };
  }
  if (parts[1] !== machine) {
    return {
      status: "invalid",
      machine,
      source,
      expiry: null,
      remainingDays: 0,
      message: "这份授权不属于当前设备，请联系作者重新签发。",
    };
  }
  if (now > record.expiry) {
    return {
      status: "expired",
      machine,
      source,
      expiry: record.expiry,
      remainingDays: 0,
      message: `授权已于 ${new Date(record.expiry).toLocaleString("zh-CN", { hour12: false })} 到期。`,
    };
  }
  const next = { ...record, lastSeen: Math.max(record.lastSeen, now) };
  writeRecord(next);
  return {
    status: "valid",
    machine,
    source,
    expiry: record.expiry,
    remainingDays: remaining(record.expiry, now),
    message: `已授权，剩余 ${remaining(record.expiry, now)} 天。`,
  };
}

export async function activateLicense(input: string): Promise<LicenseState> {
  const { code: machine, source } = await getMachineId();
  const code = input.trim().replace(/\s+/g, "");
  const previous = readRecord();
  const now = Math.max(Date.now(), previous?.lastSeen ?? 0);
  const fail = (message: string): LicenseState => ({
    status: "error",
    machine,
    source,
    expiry: previous?.expiry ?? null,
    remainingDays: previous ? remaining(previous.expiry, now) : 0,
    message,
  });
  const [payload, signature] = code.split(".");
  if (!payload || !signature) {
    return fail("授权码格式不正确，应为“内容.签名”的完整字符串。");
  }
  if (!(await verifySignature(decodePayload(payload) ?? "", signature))) {
    return fail("授权码校验失败，请确认复制完整、未改动。");
  }
  const text = decodePayload(payload);
  if (!text) {
    return fail("授权码内容无法解析。");
  }
  const parts = text.split("|");
  if (parts[0] !== "PN1" || parts.length !== 4) {
    return fail("授权码版本不正确。");
  }
  const [, mid, daysText, issuedText] = parts;
  const days = Number(daysText);
  const issued = Number(issuedText);
  if (![7, 30, 365, 3650].includes(days) || !Number.isFinite(issued)) {
    return fail("授权时长或签发时间无效。");
  }
  if (mid !== machine) {
    return fail("这份授权不属于当前设备，请联系作者重新签发。");
  }
  if (now > issued * 1000 + CODE_WINDOW_MS) {
    return fail("授权码只有 1 天激活窗口，已过期，请联系作者重新生成。");
  }
  let base = now;
  let used: string[] = [];
  if (previous && previous.machine === machine) {
    used = Array.isArray(previous.used) ? previous.used : [];
    const prevPayload = previous.code.split(".")[0] ?? "";
    if (prevPayload && !used.includes(prevPayload)) used.push(prevPayload);
    const prevText = decodePayload(prevPayload);
    const prevSignature = previous.code.split(".")[1] ?? "";
    if (prevText && (await verifySignature(prevText, prevSignature))) {
      const prevParts = prevText.split("|");
      if (prevParts[0] === "PN1" && prevParts[1] === machine && Number.isFinite(previous.expiry)) {
        base = Math.max(now, previous.expiry);
      }
    }
  }
  if (used.includes(payload)) {
    return {
      status: "error",
      machine,
      source,
      expiry: previous?.expiry ?? null,
      remainingDays: previous ? remaining(previous.expiry, now) : 0,
      message: "该授权码已在本机使用过，不会重复累加。续期请让作者重新签发一份新的授权码。",
    };
  }
  used = [payload, ...used.filter((item) => item !== payload)].slice(0, 40);
  const expiry = base + days * DAY_MS;
  const record: LicenseRecord = {
    code,
    machine,
    days,
    issued,
    activatedAt: now,
    expiry,
    lastSeen: now,
    used,
  };
  writeRecord(record);
  return {
    status: "valid",
    machine,
    source,
    expiry: record.expiry,
    remainingDays: remaining(record.expiry, now),
    message:
      base > now
        ? `续期成功：本次累加 ${days} 天，新到期 ${new Date(expiry).toLocaleString("zh-CN", { hour12: false })}。`
        : `激活成功，授权 ${days} 天。`,
  };
}

export function shareOrCopy(text: string) {
  const bridge = window.NativeBridge;
  if (bridge?.shareText) {
    bridge.shareText("泵噪监测台", text);
    return true;
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    void navigator.share({ title: "泵噪监测台", text }).catch(() => {
      /* 用户取消分享 */
    });
    return true;
  }
  return false;
}
