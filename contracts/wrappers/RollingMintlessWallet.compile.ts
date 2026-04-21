import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
  lang: 'func',
  targets: ['contracts/rolling_mintless_wallet.fc'],
};
