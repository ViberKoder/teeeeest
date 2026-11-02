// WalletTg (Telegram's wallet contract): its address from a public key, and signed "send one message" requests.
import { fromBase64, fromHex } from './bytes.js';
import { Builder, fromBoc, toBoc } from './cell.js';
import { sign } from './ed25519.js';
import { WALLET_CODE_B64 } from './walletcode.js';

export const SUBWALLET = { testnet: 0x7fff7ffd, mainnet: 0x7fff7f11 };
const OP_SEND_ONE_EXTERNAL = 0x63896e75;
let code = null;
const walletCode = () => (code ??= fromBoc(fromBase64(WALLET_CODE_B64)));

/** raw address "0:<hash>" of the WalletTg owned by `publicKey` */
export async function walletAddress(publicKey, subwalletId) {
  const data = new Builder().uint(0, 8).uint(0, 32).uint(subwalletId, 32).bytes(publicKey).build();
  const init = new Builder().bit(0).bit(0).bit(1).bit(1).bit(0).ref(walletCode()).ref(data).build();
  const h = await init.hash();
  return '0:' + Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** internal message the wallet will send (body in a reference) */
function internalMessage({ to, value, bounce, body }) {
  return new Builder()
    .bit(0).bit(1).bit(bounce).bit(0).uint(0, 2).address(to)
    .coins(value).bit(0).coins(0).coins(0).uint(0, 64).uint(0, 32)
    .bit(0).bit(1).ref(body).build();
}

/** The BoC of an external message that makes `wallet` (at `seqno`) send one internal message. */
export async function externalSend({ wallet, seed, subwalletId, seqno, validUntil, to, value, body, bounce = true }) {
  const request = new Builder()
    .uint(OP_SEND_ONE_EXTERNAL, 32).uint(subwalletId, 32).uint(validUntil, 32).uint(seqno, 32)
    .uint(3, 8) // PAY_GAS_SEPARATELY | IGNORE_ERRORS
    .ref(internalMessage({ to, value, bounce, body })).build();
  const signature = await sign(await request.hash(), seed);
  const signed = new Builder().bytes(signature);
  for (const b of request.bits) signed.bit(b);
  for (const r of request.refs) signed.ref(r);
  const ext = new Builder().uint(2, 2).uint(0, 2).address(wallet).coins(0).bit(0).bit(1).ref(signed.build()).build();
  return toBoc(ext);
}
export { fromHex };
