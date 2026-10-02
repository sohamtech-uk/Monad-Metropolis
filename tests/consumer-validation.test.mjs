import test from 'node:test';
import assert from 'node:assert/strict';
import { amountUnits, vestedAmount, parseSignedVoucher, consumerConfig, bytes32 } from '../packages/consumer-payments/src/index.ts';
test('consumer configuration is default-off and rejects insecure RPC',()=>{
 assert.equal(consumerConfig({}).enabled,false);assert.equal(consumerConfig({}).gifts,null);
 assert.throws(()=>consumerConfig({rpcUrl:'http://insecure.invalid'}));
});
test('amount parser rejects floating point, negative, zero, precision loss and overflow',()=>{
 assert.equal(amountUnits('5.000001'),5000001n);
 for (const value of ['0','-1','1e6','0.0000001','1,000','Infinity','NaN','01','340282366920938463463374607431768211455']) assert.throws(()=>amountUnits(value));
});
test('vesting model matches exact integer boundaries and floor arithmetic',()=>{
 assert.equal(vestedAmount(7n,100n,160n,99n),0n);assert.equal(vestedAmount(7n,100n,160n,120n),2n);
 assert.equal(vestedAmount(7n,100n,160n,160n),7n);assert.equal(vestedAmount(7n,100n,160n,200n),7n);
 assert.throws(()=>vestedAmount(7n,100n,100n,110n));
});
test('unsigned CRE evidence and unsafe IDs are never accepted as reward vouchers',()=>{
 assert.throws(()=>parseSignedVoucher(JSON.stringify({status:'ready_for_reconciliation',checks:{all:true}})));
 assert.throws(()=>parseSignedVoucher('x'.repeat(4097)));assert.throws(()=>bytes32('0x00'));assert.throws(()=>bytes32('0x'+'0'.repeat(64)));
});
