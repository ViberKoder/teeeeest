import { tickSafe } from '../lib/publisher.js';

// Nudges the publisher (confirm what is in flight, send what is new). Kept apart from `me` so that opening the wallet never waits for it.
export default async function () {
  return { status: await tickSafe() };
}
