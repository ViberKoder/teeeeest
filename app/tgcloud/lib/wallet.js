// WalletTg (Telegram's wallet contract): its address from a public key, and signed "send one message" requests.
import { fromBase64, fromHex } from './bytes.js';
import { Builder, fromBoc, toBoc } from './cell.js';
import { sign } from './ed25519.js';
import { WALLET_CODE_B64 } from './walletcode.js';

export const SUBWALLET = { testnet: 0x7fff7ffd, mainnet: 0x7fff7f11 };
const OP_SEND_ONE_EXTERNAL = 0x63896e75;
let code = null;
const walletCode = () => (code ??= fromBoc(fromBase64(WALLET_CODE_B64)));

/** StateInit of the WalletTg owned by `publicKey` (revision 0, seqno 0) */
export function stateInit(publicKey, subwalletId) {
  const data = new Builder().uint(0, 8).uint(0, 32).uint(subwalletId, 32).bytes(publicKey).build();
  return new Builder().bit(0).bit(0).bit(1).bit(1).bit(0).ref(walletCode()).ref(data).build();
}

/** raw address "0:<hash>" of the WalletTg owned by `publicKey` */
export async function walletAddress(publicKey, subwalletId) {
  const h = await stateInit(publicKey, subwalletId).hash();
  return '0:' + Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** internal message the wallet will send (body in a reference) */
function internalMessage({ to, value, bounce, body }) {
  const b = new Builder()
    .bit(0).bit(1).bit(bounce).bit(0).uint(0, 2).address(to)
    .coins(value).bit(0).coins(0).coins(0).uint(0, 64).uint(0, 32)
    .bit(0); // no StateInit
  if (!body) return b.bit(0).build(); // empty inline body
  return b.bit(1).ref(body).build();
}

/** The BoC of an external message that makes `wallet` (at `seqno`) send one internal message. */
export async function externalSend({ wallet, seed, subwalletId, seqno, validUntil, to, value, body, bounce = true, init = null }) {
  const request = new Builder()
    .uint(OP_SEND_ONE_EXTERNAL, 32).uint(subwalletId, 32).uint(validUntil, 32).uint(seqno, 32)
    .uint(3, 8) // PAY_GAS_SEPARATELY | IGNORE_ERRORS
    .ref(internalMessage({ to, value, bounce, body })).build();
  return signedExternal({ wallet, seed, request, init });
}

async function signedExternal({ wallet, seed, request, init }) {
  const signature = await sign(await request.hash(), seed);
  const signed = new Builder().bytes(signature);
  for (const b of request.bits) signed.bit(b);
  for (const r of request.refs) signed.ref(r);
  const ext = new Builder().uint(2, 2).uint(0, 2).address(wallet).coins(0);
  if (init) ext.bit(1).bit(1).ref(init); else ext.bit(0);
  ext.bit(1).ref(signed.build());
  return toBoc(ext.build());
}

const OP_CHANGE_KEY_EXTERNAL = 0xfbba99c8;
/**
 * Moves a wallet to a new key: signed by the CURRENT key here, and proven by the NEW key (`rotationSignature`, made by whoever
 * holds the new key). `init` is attached while the wallet is not deployed yet.
 */
export async function changeKeyExternal({ wallet, seed, subwalletId, seqno, validUntil, newPublicKey, rotationSignature, init = null }) {
  const request = new Builder()
    .uint(OP_CHANGE_KEY_EXTERNAL, 32).uint(subwalletId, 32).uint(validUntil, 32).uint(seqno, 32)
    .bytes(newPublicKey)
    .ref(new Builder().bytes(rotationSignature).build())
    .ref(new Builder().bytes(new Uint8Array(32)).build()) // "encrypted old key": nobody needs the old key of a prepared wallet
    .build();
  return signedExternal({ wallet, seed, request, init });
}

const ROTATION_TAG = 0x4b45595f524f544154494f4en;
/** the cell the NEW key must sign to take over `wallet` (same as the SDK's rotation proof) */
export function rotationProof(wallet) {
  const b = new Builder().uint(ROTATION_TAG, 96).int(Number(wallet.split(':')[0]), 8);
  for (let i = 0; i < 64; i += 2) b.uint(parseInt(wallet.split(':')[1].slice(i, i + 2), 16), 8);
  return b.build();
}
export { fromHex };
