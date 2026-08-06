// Rate limiting بواجهة موحّدة (checkRateLimit/peekRateLimit) قابلة async الآن.
//
// السلوك:
// - إذا كانت UPSTASH_REDIS_REST_URL و UPSTASH_REDIS_REST_TOKEN معرّفتين في متغيرات
//   البيئة، يُستخدم Redis (Upstash) كمخزن مشترك — يعمل بشكل صحيح وموثوق عبر كل
//   نسخ Vercel Serverless المتعددة (هذا هو المطلوب فعليًا للإنتاج).
// - إذا لم تكونا معرّفتين، يعمل التطبيق بحد In-Memory كخيار احتياطي فقط، **مع تحذير
//   صريح في سجلات الخادم عند كل استدعاء تقريبًا** بأن هذا ليس حماية إنتاجية حقيقية
//   (لن يكون موحّدًا عبر نسخ Serverless المتعددة). هذا اختيار مقصود: نفضّل أن يستمر
//   النظام بالعمل بدل تعطّله بالكامل إن نسي أحد إعداد Upstash، لكن مع تحذير واضح
//   لا يمكن تجاهله بدل فشل صامت يوهم بأن الحماية تعمل.

import { Redis } from '@upstash/redis';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis: Redis | null = UPSTASH_URL && UPSTASH_TOKEN
  ? new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN })
  : null;

let warnedOnce = false;
function warnFallback() {
  if (!warnedOnce) {
    console.warn(
      '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN غير معرّفتين. ' +
      'النظام يعمل بحد In-Memory احتياطي فقط، وهو غير موثوق على Vercel Serverless ' +
      '(كل نسخة/Lambda لها ذاكرتها الخاصة، فالحد لا يكون موحّدًا عبر الطلبات). ' +
      'أضف المتغيرين من Upstash (مجاني) لحماية إنتاجية حقيقية.'
    );
    warnedOnce = true;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// ---- تنفيذ In-Memory (احتياطي فقط) ----
interface Bucket { count: number; resetAt: number; }
const memoryBuckets = new Map<string, Bucket>();

function checkRateLimitMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (!existing || now > existing.resetAt) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

function peekRateLimitMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (!existing || now > existing.resetAt) {
    return { allowed: true, remaining: limit, resetAt: now + windowMs };
  }
  return { allowed: existing.count < limit, remaining: Math.max(0, limit - existing.count), resetAt: existing.resetAt };
}

// ---- تنفيذ Upstash Redis (الموصى به للإنتاج) ----
// نافذة ثابتة (Fixed Window) عبر INCR + PEXPIRE الذرّيين — أبسط وأدق من محاكاة
// نافذة منزلقة يدويًا فوق REST API، وكافٍ تمامًا لمنع القوة الغاشمة والإساءة هنا.
async function checkRateLimitRedis(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  const count = await redis!.incr(redisKey);
  if (count === 1) {
    await redis!.pexpire(redisKey, windowMs);
  }
  const ttl = await redis!.pttl(redisKey);
  const resetAt = Date.now() + (ttl > 0 ? ttl : windowMs);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
}

async function peekRateLimitRedis(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  const count = (await redis!.get<number>(redisKey)) ?? 0;
  const ttl = await redis!.pttl(redisKey);
  const resetAt = Date.now() + (ttl > 0 ? ttl : windowMs);
  return { allowed: count < limit, remaining: Math.max(0, limit - count), resetAt };
}

/**
 * @param key معرّف فريد للعملية + المستخدم/IP، مثال: "login:email:1.2.3.4"
 * @param limit عدد المحاولات المسموحة خلال النافذة الزمنية
 * @param windowMs طول النافذة الزمنية بالميلي ثانية
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  if (redis) {
    try {
      return await checkRateLimitRedis(key, limit, windowMs);
    } catch (err) {
      console.error('[rate-limit] Upstash Redis error, falling back to in-memory for this request:', err);
      return checkRateLimitMemory(key, limit, windowMs);
    }
  }
  warnFallback();
  return checkRateLimitMemory(key, limit, windowMs);
}

/** يفحص الحد الحالي دون زيادة العداد — يُستخدم للتحقق المسبق قبل تنفيذ عملية حساسة. */
export async function peekRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  if (redis) {
    try {
      return await peekRateLimitRedis(key, limit, windowMs);
    } catch (err) {
      console.error('[rate-limit] Upstash Redis error, falling back to in-memory for this request:', err);
      return peekRateLimitMemory(key, limit, windowMs);
    }
  }
  warnFallback();
  return peekRateLimitMemory(key, limit, windowMs);
}

// حدود موصى بها لكل عملية (حسب متطلبات الأمان):
export const RATE_LIMITS = {
  login: { limit: 5, windowMs: 5 * 60 * 1000 }, // 5 محاولات كل 5 دقائق لكل بريد+IP
  loginPerIp: { limit: 20, windowMs: 5 * 60 * 1000 }, // حد أوسع لكل IP بمفرده، يمنع تجربة عدة بريدات من نفس المصدر (تعداد حسابات)
  passwordReset: { limit: 3, windowMs: 15 * 60 * 1000 },
  fileUpload: { limit: 20, windowMs: 5 * 60 * 1000 },
  recordCreate: { limit: 30, windowMs: 60 * 1000 },
  search: { limit: 60, windowMs: 60 * 1000 },
  userCreate: { limit: 10, windowMs: 60 * 60 * 1000 },
};

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}
