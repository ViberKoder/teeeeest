// @ts-nocheck — deploy CLI; @ton/ton v14 types differ from wallet sendTransfer at runtime.
/**
 * Non-interactive mainnet deploy for ton-community/mintless-jetton (TEP-177 reference).
 *
 * Env: ADMIN_PRIVATE_KEY_HEX, ADMIN_WALLET_ADDRESS, ADMIN_WALLET_VERSION=v5r1,
 *      METADATA_URL, MERKLE_ROOT_HEX (optional, default 0),
 *      TON_RPC_API_KEY, TON_RPC_ENDPOINT, DEPLOY_LIBRARIAN=true|false
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { Address, beginCell, Cell, internal, SendMode, toNano } from '@ton/core';
import { keyPairFromSecretKey, keyPairFromSeed } from '@ton/crypto';
import { TonClient, WalletContractV4, WalletContractV5R1 } from '@ton/ton';
import { jettonContentToCell, JettonMinter } from '../wrappers/JettonMinter';
import { jettonWalletCodeFromLibrary } from '../wrappers/ui-utils';
import { Librarian } from '../wrappers/Librarian';
import { Op } from '../wrappers/JettonConstants';

function loadCompiled(name: string): Cell {
  const path = join(__dirname, '..', 'build', `${name}.compiled.json`);
  const { hex } = JSON.parse(readFileSync(path, 'utf8')) as { hex: string };
  return Cell.fromBoc(Buffer.from(hex, 'hex'))[0];
}

function rpcEndpoint(network: string): string {
  const custom = process.env.TON_RPC_ENDPOINT?.trim();
  if (custom) return custom;
  return network === 'mainnet'
    ? 'https://toncenter.com/api/v2/jsonRPC'
    : 'https://testnet.toncenter.com/api/v2/jsonRPC';
}

async function adminKeyPair() {
  const pkHex = process.env.ADMIN_PRIVATE_KEY_HEX?.replace(/^0x/i, '').replace(/\s+/g, '');
  if (!pkHex) throw new Error('ADMIN_PRIVATE_KEY_HEX required');
  const buf = Buffer.from(pkHex, 'hex');
  if (buf.length === 32) return keyPairFromSeed(buf);
  if (buf.length === 64) return keyPairFromSecretKey(buf);
  throw new Error('ADMIN_PRIVATE_KEY_HEX must be 64 or 128 hex characters');
}

async function withRpcRetry<T>(label: string, fn: () => Promise<T>, attempts = 10): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      last = e;
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 429 && i + 1 < attempts) {
        const waitMs = 2500 * (i + 1);
        console.warn(`${label}: 429, retry in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw e;
    }
  }
  throw last;
}

async function main() {
  const network = (process.env.TON_NETWORK || 'mainnet').trim();
  const metadataUrl = process.env.METADATA_URL?.trim();
  if (!metadataUrl) throw new Error('METADATA_URL required');

  const apiKey = process.env.TON_RPC_API_KEY?.trim();
  const client = new TonClient({ endpoint: rpcEndpoint(network), apiKey: apiKey || undefined });

  let merkleRoot = 0n;
  if (process.env.SOURCE_RMJ_MASTER_ADDRESS?.trim()) {
    const old = Address.parse(process.env.SOURCE_RMJ_MASTER_ADDRESS.trim());
    const res = await withRpcRetry('get_merkle_root', () =>
      client.runMethod(old, 'get_merkle_root', []),
    );
    merkleRoot = res.stack.readBigNumber();
    console.log('Copied merkle root from RMJ master:', '0x' + merkleRoot.toString(16));
  } else {
    const merkleRootHex = process.env.MERKLE_ROOT_HEX?.replace(/^0x/i, '').trim() || '0';
    merkleRoot = BigInt(merkleRootHex ? `0x${merkleRootHex}` : '0');
  }

  const adminKp = await adminKeyPair();
  const walletVersion = (process.env.ADMIN_WALLET_VERSION || 'v4').trim();
  const subwallet = Number(process.env.ADMIN_V5R1_SUBWALLET || '0');
  const networkGlobalId = network === 'mainnet' ? -239 : -3;
  const expectedAdmin = process.env.ADMIN_WALLET_ADDRESS?.trim();

  function makeV5(sw: number) {
    return WalletContractV5R1.create({
      publicKey: adminKp.publicKey,
      walletId: {
        networkGlobalId,
        context: { walletVersion: 'v5r1', workChain: 0, subwalletNumber: sw },
      },
    });
  }

  let v5Wallet = makeV5(subwallet);
  if (expectedAdmin && walletVersion === 'v5r1') {
    const expected = Address.parse(expectedAdmin).toString({ bounceable: false, urlSafe: true });
    if (v5Wallet.address.toString({ bounceable: false, urlSafe: true }) !== expected) {
      let found = false;
      for (let sw = 0; sw <= 512 && !found; sw++) {
        const w = makeV5(sw);
        if (w.address.toString({ bounceable: false, urlSafe: true }) === expected) {
          v5Wallet = w;
          console.log('v5r1 subwallet', sw);
          found = true;
        }
      }
      if (!found) throw new Error('ADMIN_WALLET_ADDRESS does not match key');
    }
  }

  const adminWallet =
    walletVersion === 'v5r1'
      ? client.open(v5Wallet)
      : client.open(WalletContractV4.create({ workchain: 0, publicKey: adminKp.publicKey }));

  const jettonWalletCodeRaw = loadCompiled('JettonWallet');
  const jettonWalletCode = jettonWalletCodeFromLibrary(jettonWalletCodeRaw);
  const minterCode = loadCompiled('JettonMinter');

  const deployLibrarian = (process.env.DEPLOY_LIBRARIAN || 'true').toLowerCase() !== 'false';
  if (deployLibrarian) {
    const librarianCode = loadCompiled('Librarian');
    const librarian = client.open(
      Librarian.createFromConfig({ code: jettonWalletCodeRaw }, librarianCode),
    );
    console.log('Librarian (masterchain library):', librarian.address.toString());
    const libTon = toNano(process.env.LIBRARIAN_TON || '0.5');
    const seqLib = await withRpcRetry('librarian seqno', () => adminWallet.getSeqno());
    await withRpcRetry('librarian deploy', () =>
      adminWallet.sendTransfer({
        seqno: seqLib,
        secretKey: adminKp.secretKey,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        messages: [
          internal({
            to: librarian.address,
            value: libTon,
            init: librarian.init,
            bounce: false,
          }),
        ],
      }),
    );
    console.log('Librarian deploy sent, seqno was', seqLib);
    await new Promise((r) => setTimeout(r, 25_000));
  }

  const minter = client.open(
    JettonMinter.createFromConfig(
      {
        admin: adminWallet.address,
        wallet_code: jettonWalletCode,
        merkle_root: merkleRoot,
        jetton_content: jettonContentToCell({ uri: metadataUrl }),
      },
      minterCode,
    ),
  );

  console.log('Network:', network);
  console.log('Admin:', adminWallet.address.toString({ bounceable: false, urlSafe: true }));
  console.log('Merkle root:', '0x' + merkleRoot.toString(16));
  console.log('Minter:', minter.address.toString({ bounceable: false, urlSafe: true }));

  const minterTon = toNano(process.env.DEPLOY_MINTER_TON || '1.5');
  const deployBody = beginCell().storeUint(Op.top_up, 32).storeUint(0, 64).endCell();
  const seqno = await withRpcRetry('seqno', () => adminWallet.getSeqno());
  await withRpcRetry('minter deploy', () =>
    adminWallet.sendTransfer({
      seqno,
      secretKey: adminKp.secretKey,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      messages: [
        internal({
          to: minter.address,
          value: minterTon,
          init: minter.init,
          body: deployBody,
          bounce: false,
        }),
      ],
    }),
  );

  console.log('\nReference mintless minter deploy sent (seqno', seqno, ').');
  console.log('STANDARD_JETTON_MASTER_ADDRESS=' + minter.address.toString({ bounceable: false, urlSafe: true }));
  console.log('Verify code hash on Tonviewer matches github.com/ton-community/mintless-jetton after source upload.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
