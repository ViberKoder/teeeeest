// A tiny authenticated endpoint: proves that the platform verified the caller's Telegram init data.
export default async function (_input, ctx) {
  return { ok: true, user: ctx.initData?.user?.id ?? null };
}
