import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertPaymentRecipient, requireGasBudget, checkContractGas, formatMon } from '../apps/mobile/src/mera/transactionPreflight.ts';

const payer = '0x4b5d0b19c223d271799fa6515334786008f144c5';
const recipient = '0x9079ab49f4d72c07f96b0a454ed94036b082c81e';
const config = {
  ausdAddress: '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC',
  ausdFaucetAddress: '0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C',
  settlementRegistryAddress: '0xdcB418C6e719C40c8e1F9B446cD850330219EEFf',
};
const fees = { maxFeePerGas: 182400000000n, maxPriorityFeePerGas: 2000000000n };
const gas = 113465n;
const required = 20696016000000000n;
const checkedFields = { gas, ...fees, type: 'eip1559', gasPrice: undefined,
  blobs: undefined, blobVersionedHashes: undefined, maxFeePerBlobGas: undefined,
  kzg: undefined, authorizationList: undefined };

test('the submitted faucet transaction needs 0.020696016 MON at its fee cap', () => {
  assert.equal(gas * fees.maxFeePerGas, required);
  assert.throws(() => requireGasBudget(2958314000000000n, gas, fees, 'request test AUSD', payer), error => {
    assert.match(error.message, /Available: 0\.002958314 MON/);
    assert.match(error.message, /0\.020696016 MON/);
    assert.match(error.message, /shortfall: 0\.017737702 MON/);
    assert.match(error.message, /AUSD cannot pay this gas fee/);
    assert.ok(!error.message.includes('eth_sendRawTransaction'));
    return true;
  });
});

test('zero and one-wei-short balances fail; the exact maximum budget passes', () => {
  for (const balance of [0n, required - 1n]) {
    assert.throws(() => requireGasBudget(balance, gas, fees, 'send AUSD', payer), /Not enough MON/);
  }
  const checked = requireGasBudget(required, gas, fees, 'send AUSD', payer);
  assert.deepEqual(checked, checkedFields);
  assert.equal(Object.isFrozen(checked), true);
});

test('invalid estimates fail closed without fee or gas clamping', () => {
  for (const [g, f] of [
    [0n, fees], [-1n, fees], [gas, { ...fees, maxFeePerGas: 0n }],
    [gas, { ...fees, maxPriorityFeePerGas: -1n }],
    [gas, { ...fees, maxPriorityFeePerGas: fees.maxFeePerGas + 1n }],
  ]) assert.throws(() => requireGasBudget(required, g, f, 'send AUSD', payer), /valid MON/);
});

test('every configured infrastructure address is rejected as a recipient in either case', () => {
  for (const address of Object.values(config)) {
    for (const variant of [address, address.toLowerCase(), '0x'+address.slice(2).toUpperCase()]) {
      assert.throws(() => assertPaymentRecipient(variant, config), /not your payee's wallet/);
    }
  }
});

test('malformed and zero recipients fail, unrelated addresses and contract wallets remain allowed', () => {
  for (const value of ['', '0x1234', '0x'+'0'.repeat(40)]) {
    assert.throws(() => assertPaymentRecipient(value, config));
  }
  assert.doesNotThrow(() => assertPaymentRecipient(recipient, config));
  assert.doesNotThrow(() => assertPaymentRecipient('0x'+'9'.repeat(40), { ausdAddress: config.ausdAddress }));
});

test('MON formatting keeps all precision and avoids floating-point rounding', () => {
  assert.equal(formatMon(0n), '0');
  assert.equal(formatMon(1n), '0.000000000000000001');
  assert.equal(formatMon(10n ** 18n), '1');
  assert.equal(formatMon(required), '0.020696016');
  assert.throws(() => formatMon(-1n));
});

test('read-only preflight returns exactly the checked type-2 fee parameters', async () => {
  const calls = [];
  const checked = await checkContractGas({
    estimateGas: async () => { calls.push('gas'); return gas; },
    estimateFees: async () => { calls.push('fees'); return fees; },
    getBalance: async () => { calls.push('balance'); return required; },
    action: 'send AUSD', payer,
  });
  assert.deepEqual(checked, checkedFields);
  assert.deepEqual(calls, ['gas', 'fees', 'balance']);
  const write = { type: 'legacy', gasPrice: 1n, authorizationList: [{ address: recipient }], ...checked };
  assert.equal(write.type, 'eip1559');
  assert.equal(write.gasPrice, undefined);
  assert.equal(write.authorizationList, undefined);
});

test('insufficient balance prevents a later sign/send callback being reached', async () => {
  let signed = false;
  await assert.rejects(async () => {
    await checkContractGas({ estimateGas: async () => gas, estimateFees: async () => fees,
      getBalance: async () => required - 1n, action: 'send AUSD', payer });
    signed = true;
  }, /Not enough MON/);
  assert.equal(signed, false);
});

test('nested RPC insufficient-balance errors become actionable without dumping raw payloads', async () => {
  await assert.rejects(() => checkContractGas({
    estimateGas: async () => { throw { message: 'Missing or invalid parameters', cause: { details: 'Signer had insufficient balance', message: 'raw-payload-do-not-display' } }; },
    estimateFees: async () => fees, getBalance: async () => required,
    action: 'request test AUSD', payer,
  }), error => {
    assert.match(error.message, /Not enough native MON/);
    assert.match(error.message, /faucet also requires MON/);
    assert.ok(!error.message.includes('raw-payload-do-not-display'));
    return true;
  });
});

test('unrelated simulation errors are preserved rather than mislabeled as a gas shortage', async () => {
  const original = new Error('Faucet cooldown has not elapsed.');
  await assert.rejects(() => checkContractGas({
    estimateGas: async () => { throw original; }, estimateFees: async () => fees,
    getBalance: async () => required, action: 'request test AUSD', payer,
  }), error => error === original);
});

test('payment, registry and faucet all use the checked budget and retain the duplicate guard', () => {
  const source = readFileSync(new URL('../apps/mobile/src/mera/scopedSession.ts', import.meta.url), 'utf8');
  assert.equal((source.match(/await checkContractGas\(/g) ?? []).length, 3);
  assert.equal((source.match(/\.\.\.gasBudget/g) ?? []).length, 3);
  assert.ok(source.indexOf('assertPaymentRecipient(request.recipient, config)') < source.indexOf('const hash = await walletClient.writeContract'));
  assert.ok(source.indexOf('if (alreadyCorrelated)') < source.indexOf('const hash = await walletClient.writeContract'));
  assert.match(source, /Do not pay it again/);
  assert.match(source, /this\.validateRequest\(request, Date\.now\(\)\)/);
});
