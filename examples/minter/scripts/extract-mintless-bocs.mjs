#!/usr/bin/env node
/**
 * Regenerate MINTLESS_*_BOC_BASE64 in constants.ts from ton-community/mintless-jetton.
 *
 *   git clone https://github.com/ton-community/mintless-jetton /tmp/mintless-jetton
 *   node examples/minter/scripts/extract-mintless-bocs.mjs /tmp/mintless-jetton
 */
import fs from 'fs';
import path from 'path';
import { Cell } from '@ton/core';

const repo = process.argv[2] ?? '/tmp/mintless-jetton';
const buildDir = path.join(repo, 'build');

function bocBase64(name) {
  const j = JSON.parse(fs.readFileSync(path.join(buildDir, `${name}.compiled.json`), 'utf8'));
  const c = Cell.fromBoc(Buffer.from(j.hex, 'hex'))[0];
  return c.toBoc().toString('base64');
}

const master = bocBase64('JettonMinter');
const wallet = bocBase64('JettonWallet');
console.log('MINTLESS_MASTER_BOC_BASE64=', master);
console.log('MINTLESS_WALLET_RAW_BOC_BASE64=', wallet);
