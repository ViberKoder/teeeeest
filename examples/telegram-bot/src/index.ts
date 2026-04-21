import 'dotenv/config';
import { Bot, InlineKeyboard, Context, InputFile } from 'grammy';
import { RMJClient } from '@rmj/sdk';
import { Address } from '@ton/core';
import { UserAddressMap } from './userMap';

const TELEGRAM_BOT_TOKEN = required('TELEGRAM_BOT_TOKEN');
const RMJ_BACKEND_URL = process.env.RMJ_BACKEND_URL ?? 'http://localhost:3000';
const RMJ_ADMIN_SECRET = process.env.RMJ_ADMIN_SECRET || undefined;
const REWARD_PER_CLICK_NANO = process.env.REWARD_PER_CLICK_NANO || undefined;
const PROJECT_NAME = process.env.PROJECT_NAME ?? 'TapCoin';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

const rmj = new RMJClient({ baseUrl: RMJ_BACKEND_URL, adminSecret: RMJ_ADMIN_SECRET });
const addresses = new UserAddressMap();
const bot = new Bot(TELEGRAM_BOT_TOKEN);

// ---- /start and /help ----

bot.command('start', (ctx) =>
  ctx.reply(
    `Welcome to ${PROJECT_NAME}! 🌱\n\n` +
      `Link your TON wallet with /link <address>, then tap the 💎 button under ` +
      `any message to earn ${PROJECT_NAME} jettons. Rewards accumulate off-chain ` +
      `and automatically materialize in your wallet the next time you swap or ` +
      `transfer them — no claim button needed.\n\n` +
      `Commands:\n` +
      `  /link <EQ… | UQ…>  — attach your wallet\n` +
      `  /balance           — see your pending balance\n` +
      `  /tap               — post a tap button to this chat`,
  ),
);

bot.command('help', (ctx) => ctx.reply('/link <address>, /balance, /tap'));

bot.command('link', async (ctx) => {
  const raw = (ctx.match ?? '').trim();
  if (!raw) return ctx.reply('Usage: /link EQ…');
  try {
    const parsed = Address.parse(raw);
    const canonical = parsed.toString({ urlSafe: true, bounceable: false });
    addresses.link(ctx.from!.id, canonical);
    return ctx.reply(`Linked ✅\nYour rewards will accrue to:\n\`${canonical}\``, {
      parse_mode: 'Markdown',
    });
  } catch {
    return ctx.reply('That does not look like a valid TON address. Paste it again?');
  }
});

bot.command('balance', async (ctx) => {
  const addr = addresses.get(ctx.from!.id);
  if (!addr) return ctx.reply('First link your wallet: /link EQ…');
  try {
    const b = await rmj.getBalance(addr);
    const humanOff = nanoToHuman(b.cumulativeOffchain);
    const humanTree = nanoToHuman(b.cumulativeInTree);
    return ctx.reply(
      `Balance for \`${addr}\`:\n` +
        `  Off-chain live: *${humanOff} ${PROJECT_NAME}*\n` +
        `  In latest root: *${humanTree} ${PROJECT_NAME}* (epoch ${b.epoch})\n\n` +
        `_Both will merge on your next jetton transfer._`,
      { parse_mode: 'Markdown' },
    );
  } catch (e) {
    return ctx.reply(`Couldn't fetch balance: ${(e as Error).message}`);
  }
});

// ---- /tap: post a message with an inline TAP button to the current chat ----

bot.command('tap', async (ctx) => {
  const keyboard = new InlineKeyboard().text(`💎 Tap to earn ${PROJECT_NAME}`, 'rmj-tap');
  await ctx.reply(
    `${PROJECT_NAME} live drop — every click adds jettons to your balance!`,
    { reply_markup: keyboard },
  );
});

// ---- Inline button handler: awards jettons ----

bot.callbackQuery('rmj-tap', async (ctx) => {
  const userId = ctx.from.id;
  const addr = addresses.get(userId);
  if (!addr) {
    return ctx.answerCallbackQuery({
      text: `Link your wallet first: DM @${(await ctx.me).username} with /link EQ…`,
      show_alert: true,
    });
  }

  try {
    const r = await rmj.recordAction({
      address: addr,
      source: 'telegram-inline',
      rewardNano: REWARD_PER_CLICK_NANO,
      meta: {
        telegram_user_id: userId,
        chat_id: ctx.chat?.id,
        message_id: ctx.callbackQuery.message?.message_id,
      },
    });
    if (r.ok) {
      const delta = nanoToHuman(r.delta ?? '0');
      const cumulative = nanoToHuman(r.cumulative ?? '0');
      return ctx.answerCallbackQuery({
        text: `+${delta} ${PROJECT_NAME} (total: ${cumulative})`,
      });
    } else {
      return ctx.answerCallbackQuery({
        text: `Rate limit: ${r.reason}. Try again in a moment.`,
        show_alert: false,
      });
    }
  } catch (e) {
    console.error('tap error', e);
    return ctx.answerCallbackQuery({ text: 'Something went wrong, try again' });
  }
});

function nanoToHuman(nano: string): string {
  const bi = BigInt(nano);
  const whole = bi / 1_000_000_000n;
  const frac = bi % 1_000_000_000n;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(9, '0').replace(/0+$/, '')}`;
}

bot.catch((err) => {
  console.error('bot error', err);
});

console.log(`Starting ${PROJECT_NAME} bot, backend: ${RMJ_BACKEND_URL}`);
bot.start().catch((e) => {
  console.error('bot failed to start', e);
  process.exit(1);
});
