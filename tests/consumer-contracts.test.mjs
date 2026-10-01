import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ganache from 'ganache';
import { createPublicClient, createWalletClient, custom, defineChain, keccak256, toBytes, encodeFunctionData, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { rewardDomain, VOUCHER_TYPES, parseSignedVoucher } from '../packages/consumer-payments/src/index.ts';
import { verifyRewardPurchase, signRewardVoucher } from '../packages/consumer-payments/src/rewards.ts';
const artifacts = Object.fromEntries(['ConsumerTestToken', 'CherryGiftEscrow', 'CherryEarningsStream', 'CherryRewardCampaigns'].map(name => [name, JSON.parse(readFileSync(`build/consumer/${name}.json`))]));
const U = 1000000n;
const ref = value => keccak256(toBytes(value));
const chain = defineChain({ id:31337, name:'Local test', nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['http://127.0.0.1']}} });
let provider, client, accounts, wallets, token, gift, stream, rewards, t0;
const send = async (who, address, name, functionName, args=[]) => {
 const sim = await client.simulateContract({account:accounts[who],address,abi:artifacts[name].abi,functionName,args});
 const hash = await wallets[who].writeContract(sim.request);
 const receipt = await client.waitForTransactionReceipt({hash});
 assert.equal(receipt.status,'success'); return receipt;
};
const read = (address,name,functionName,args=[]) => client.readContract({address,abi:artifacts[name].abi,functionName,args});
const balance = address => read(token,'ConsumerTestToken','balanceOf',[address]);
const warp = async t => { await provider.request({method:'evm_setTime',params:[Number(t * 1000n)]}); await provider.request({method:'evm_mine',params:[]}); };
const deploy = async(name,args=[]) => {
 const hash = await wallets[0].deployContract({abi:artifacts[name].abi,bytecode:`0x${artifacts[name].evm.bytecode.object}`,args});
 return (await client.waitForTransactionReceipt({hash})).contractAddress;
};
beforeEach(async () => {
 provider = ganache.provider({logging:{quiet:true},chain:{chainId:31337,hardfork:'shanghai'},miner:{timestampIncrement:0},wallet:{deterministic:true,totalAccounts:5}});
 accounts = Object.values(provider.getInitialAccounts()).map(a => privateKeyToAccount(a.secretKey));
 client = createPublicClient({chain,transport:custom(provider),cacheTime:0});
 wallets = accounts.map(account => createWalletClient({chain,account,transport:custom(provider)}));
 token = await deploy('ConsumerTestToken'); gift = await deploy('CherryGiftEscrow',[token]);
 stream = await deploy('CherryEarningsStream',[token]); rewards = await deploy('CherryRewardCampaigns',[token]);
 await send(0,token,'ConsumerTestToken','mint',[accounts[0].address,1000000n*U]);
 for (const contract of [gift,stream,rewards]) await send(0,token,'ConsumerTestToken','approve',[contract,1000000n*U]);
 t0 = (await client.getBlock()).timestamp;
});
afterEach(async () => { await provider.disconnect(); });
const makeGift = async (name='gift', amount=10n*U, unlock=t0+60n, expiry=t0+120n) => {
 const r = ref(name); const id = await read(gift,'CherryGiftEscrow','recordId',[accounts[0].address,r]);
 await send(0,gift,'CherryGiftEscrow','createGift',[accounts[1].address,amount,unlock,expiry,r]); return id;
};
const makeStream = async (name='stream', total=60n*U, start=t0, duration=60n, cancellable=true) => {
 const r=ref(name);const id=await read(stream,'CherryEarningsStream','recordId',[accounts[0].address,r]);
 await send(0,stream,'CherryEarningsStream','createStream',[accounts[1].address,total,start,duration,cancellable,r]);return id;
};
const makeCampaign = async (name='campaign', budget=10n*U, max=3) => {
 const r=ref(name);const id=await read(rewards,'CherryRewardCampaigns','recordId',[accounts[0].address,r]);
 await send(0,rewards,'CherryRewardCampaigns','createCampaign',[accounts[2].address,budget,U,U,500,max,t0+10n,t0+100n,t0+200n,r]);return id;
};
const voucher = id => ({campaignId:id,paymentTxHash:ref('payment'),logIndex:0,payer:accounts[1].address,purchaseAmount:10n*U,paidAt:t0+20n,validUntil:t0+150n});
const sign = (v, account=accounts[2], address=rewards,chainId=31337) => account.signTypedData({domain:rewardDomain(address,chainId),types:VOUCHER_TYPES,primaryType:'RewardVoucher',message:v});

test('gift locks funds until exact unlock, recipient claims once, liability goes to zero',async()=>{
 const id=await makeGift();assert.equal(await balance(gift),10n*U);
 await assert.rejects(send(1,gift,'CherryGiftEscrow','claim',[id]));
 await warp(t0+60n);await send(1,gift,'CherryGiftEscrow','claim',[id]);
 assert.equal(await balance(accounts[1].address),10n*U);assert.equal(await read(gift,'CherryGiftEscrow','totalLiability'),0n);
 await assert.rejects(send(1,gift,'CherryGiftEscrow','claim',[id]));
});
test('gift link/ID never permits another recipient or sender to claim',async()=>{
 const id=await makeGift();await warp(t0+60n);
 await assert.rejects(send(2,gift,'CherryGiftEscrow','claim',[id]));await assert.rejects(send(0,gift,'CherryGiftEscrow','claim',[id]));
});
test('expiry is exclusive for claim and inclusive for sender reclaim',async()=>{
 const id=await makeGift();await assert.rejects(send(0,gift,'CherryGiftEscrow','reclaim',[id]));await warp(t0+120n);
 await assert.rejects(send(1,gift,'CherryGiftEscrow','claim',[id]));await assert.rejects(send(2,gift,'CherryGiftEscrow','reclaim',[id]));
 await send(0,gift,'CherryGiftEscrow','reclaim',[id]);assert.equal(await balance(gift),0n);
 await assert.rejects(send(0,gift,'CherryGiftEscrow','reclaim',[id]));
});
test('duplicate funding reference is rejected without debiting twice',async()=>{
 await makeGift();const before=await balance(accounts[0].address);await assert.rejects(makeGift());assert.equal(await balance(accounts[0].address),before);
});
test('gift rejects zero/self recipients, zero amounts and invalid schedules',async()=>{
 for (const args of [[zeroAddress,1n,t0,t0+100n,ref('a')],[accounts[0].address,1n,t0,t0+100n,ref('b')],
  [accounts[1].address,0n,t0,t0+100n,ref('c')],[accounts[1].address,1n,t0-1n,t0+100n,ref('d')],[accounts[1].address,1n,t0+100n,t0+100n,ref('e')]])
  await assert.rejects(send(0,gift,'CherryGiftEscrow','createGift',args));
});
test('insufficient allowance and balance cannot create unfunded liabilities',async()=>{
 await send(0,token,'ConsumerTestToken','approve',[gift,0n]);await assert.rejects(makeGift());assert.equal(await read(gift,'CherryGiftEscrow','totalLiability'),0n);
 await assert.rejects(makeStream('too-much',2000000n*U));assert.equal(await read(stream,'CherryEarningsStream','totalLiability'),0n);
});
test('fee-on-transfer and false-return tokens fail atomically',async()=>{
 await send(0,token,'ConsumerTestToken','setFee',[true]);const b=await balance(accounts[0].address);
 await assert.rejects(makeGift());assert.equal(await balance(accounts[0].address),b);
 await send(0,token,'ConsumerTestToken','setFee',[false]);await send(0,token,'ConsumerTestToken','setFail',[true]);await assert.rejects(makeGift());
 await send(0,token,'ConsumerTestToken','setFail',[false]);await makeGift();
});
test('reentrant token callback cannot enter escrow funding',async()=>{
 const data=encodeFunctionData({abi:artifacts.CherryGiftEscrow.abi,functionName:'claim',args:[ref('missing')]});
 await send(0,token,'ConsumerTestToken','setCallback',[gift,data]);await makeGift();
 assert.equal(await read(token,'ConsumerTestToken','callbackError'),keccak256(toBytes('ReentrancyGuardReentrantCall()')).slice(0,10));
});
test('stream releases linear earnings and never sends one transaction per second',async()=>{
 const id=await makeStream();assert.equal(await read(stream,'CherryEarningsStream','withdrawable',[id]),0n);
 await warp(t0+20n);assert.equal(await read(stream,'CherryEarningsStream','withdrawable',[id]),20n*U);
 await send(1,stream,'CherryEarningsStream','withdraw',[id]);assert.equal(await balance(accounts[1].address),20n*U);
 await assert.rejects(send(1,stream,'CherryEarningsStream','withdraw',[id]));await warp(t0+60n);await send(1,stream,'CherryEarningsStream','withdraw',[id]);
 assert.equal(await balance(accounts[1].address),60n*U);assert.equal(await balance(stream),0n);
});
test('stream cancellation preserves vested earnings and refunds only unvested amount',async()=>{
 const id=await makeStream();await warp(t0+20n);await send(1,stream,'CherryEarningsStream','withdraw',[id]);
 await warp(t0+30n);await send(0,stream,'CherryEarningsStream','cancel',[id]);await warp(t0+100n);
 assert.equal(await read(stream,'CherryEarningsStream','withdrawable',[id]),10n*U);
 await send(1,stream,'CherryEarningsStream','withdraw',[id]);assert.equal(await balance(accounts[1].address),30n*U);assert.equal(await balance(stream),0n);
 await assert.rejects(send(0,stream,'CherryEarningsStream','cancel',[id]));
});
test('noncancellable stream cannot be revoked; other users cannot withdraw/cancel',async()=>{
 const id=await makeStream('fixed',60n*U,t0,60n,false);await warp(t0+20n);
 await assert.rejects(send(0,stream,'CherryEarningsStream','cancel',[id]));await assert.rejects(send(2,stream,'CherryEarningsStream','cancel',[id]));
 await assert.rejects(send(2,stream,'CherryEarningsStream','withdraw',[id]));
});
test('stream rounding remainder is released at end; future cancellation refunds all',async()=>{
 const id=await makeStream('rounding',7n,t0,60n);await warp(t0+20n);await send(1,stream,'CherryEarningsStream','withdraw',[id]);
 assert.equal(await balance(accounts[1].address),2n);await warp(t0+60n);await send(1,stream,'CherryEarningsStream','withdraw',[id]);assert.equal(await balance(accounts[1].address),7n);
 const future=await makeStream('future',20n,t0+200n,60n);await send(0,stream,'CherryEarningsStream','cancel',[future]);assert.equal(await read(stream,'CherryEarningsStream','withdrawable',[future]),0n);
});
test('stream rejects duplicate ref, zero duration and unsupported schedule',async()=>{
 await makeStream();await assert.rejects(makeStream());await assert.rejects(makeStream('zero',1n,t0,0n));await assert.rejects(makeStream('long',1n,t0,366n*86400n));
});
test('isolated concurrent streams conserve deposited funds under varied cancellations',async()=>{
 const ids=[];let deposited=0n;
 for(let i=1;i<=12;i++){const amount=BigInt(i*17+3);ids.push({id:await makeStream(`s${i}`,amount,t0,60n),amount});deposited+=amount;}
 await warp(t0+17n);let recipientPaid=0n,refunds=0n;
 for(let i=0;i<ids.length;i++){const s=ids[i];const earned=s.amount*17n/60n;await send(1,stream,'CherryEarningsStream','withdraw',[s.id]);recipientPaid+=earned;
 if(i%2===0){await send(0,stream,'CherryEarningsStream','cancel',[s.id]);refunds+=s.amount-earned;}}
 await warp(t0+60n);for(let i=1;i<ids.length;i+=2){await send(1,stream,'CherryEarningsStream','withdraw',[ids[i].id]);recipientPaid+=ids[i].amount-ids[i].amount*17n/60n;}
 assert.equal(recipientPaid+refunds,deposited);assert.equal(await balance(accounts[1].address),recipientPaid);assert.equal(await balance(stream),0n);assert.equal(await read(stream,'CherryEarningsStream','totalLiability'),0n);
});
test('signed reward is paid from merchant-funded budget once',async()=>{
 const id=await makeCampaign();await warp(t0+20n);const v=voucher(id);await send(1,rewards,'CherryRewardCampaigns','claim',[v,await sign(v)]);
 assert.equal(await balance(accounts[1].address),U/2n);assert.equal(await read(rewards,'CherryRewardCampaigns','totalLiability'),10n*U-U/2n);
 await assert.rejects(send(1,rewards,'CherryRewardCampaigns','claim',[v,await sign(v)]));
});
test('reward rejects unsigned/forged vouchers, wrong chain/domain and different payer',async()=>{
 const id=await makeCampaign();await warp(t0+20n);const v=voucher(id);
 for(const sig of ['0x',await sign(v,accounts[3]),await sign(v,accounts[2],rewards,1),await sign(v,accounts[2],gift)])
  await assert.rejects(send(1,rewards,'CherryRewardCampaigns','claim',[v,sig]));
 await assert.rejects(send(3,rewards,'CherryRewardCampaigns','claim',[v,await sign(v)]));
 const sig=await sign(v);await assert.rejects(send(1,rewards,'CherryRewardCampaigns','claim',[{...v,purchaseAmount:100n*U},sig]));
});
test('reward rejects expired/future/out-of-window and below-minimum purchase',async()=>{
 const id=await makeCampaign();await warp(t0+20n);
 for (const patch of [{validUntil:t0+20n},{validUntil:t0+201n},{paidAt:t0+30n},{paidAt:t0+1n},{purchaseAmount:1n}]) {
 const v={...voucher(id),...patch};await assert.rejects(send(1,rewards,'CherryRewardCampaigns','claim',[v,await sign(v)]));}
});
test('reward per-payer cap and remaining campaign budget are enforced',async()=>{
 const id=await makeCampaign('small',U,1);await warp(t0+20n);const v=voucher(id);await send(1,rewards,'CherryRewardCampaigns','claim',[v,await sign(v)]);
 const next={...v,paymentTxHash:ref('payment2')};await assert.rejects(send(1,rewards,'CherryRewardCampaigns','claim',[next,await sign(next)]));
 const large={...next,payer:accounts[3].address,purchaseAmount:100n*U};await assert.rejects(send(3,rewards,'CherryRewardCampaigns','claim',[large,await sign(large)]));
});
test('one purchase event cannot claim against two campaigns',async()=>{
 const one=await makeCampaign('one');const two=await makeCampaign('two');await warp(t0+20n);
 const v=voucher(one);await send(1,rewards,'CherryRewardCampaigns','claim',[v,await sign(v)]);
 const other={...v,campaignId:two};await assert.rejects(send(1,rewards,'CherryRewardCampaigns','claim',[other,await sign(other)]));
});
test('merchant may reclaim unused campaign budget only after claim window',async()=>{
 const id=await makeCampaign();await assert.rejects(send(0,rewards,'CherryRewardCampaigns','closeCampaign',[id]));await warp(t0+200n);
 await assert.rejects(send(1,rewards,'CherryRewardCampaigns','closeCampaign',[id]));await send(0,rewards,'CherryRewardCampaigns','closeCampaign',[id]);
 assert.equal(await balance(rewards),0n);await assert.rejects(send(0,rewards,'CherryRewardCampaigns','closeCampaign',[id]));
});
test('server adapter verifies actual purchase receipt, then signed voucher pays correct payer',async()=>{
 const id=await makeCampaign();await send(0,token,'ConsumerTestToken','mint',[accounts[1].address,10n*U]);await warp(t0+20n);
 const receipt=await send(1,token,'ConsumerTestToken','transfer',[accounts[0].address,10n*U]);await provider.request({method:'evm_mine',params:[]});
 const intent={id:'trusted-intent-1',mode:'sandbox',purpose:'merchant_purchase',payerAccountId:'payer-1',payerCompanyId:null,merchantCompanyId:'merchant-1',payer:accounts[1].address,merchant:accounts[0].address,token,amount:10n*U,campaignId:id,campaignContract:rewards};
 const v=await verifyRewardPurchase(client,intent,receipt.transactionHash,receipt.logs[0].logIndex,t0+20n,31337);
 const signed=await signRewardVoucher(client,accounts[2],rewards,v,31337);const parsed=parseSignedVoucher(signed);
 await send(1,rewards,'CherryRewardCampaigns','claim',[parsed.voucher,parsed.signature]);assert.equal(await balance(accounts[1].address),U/2n);
 for (const patch of [{purpose:'salary'},{purpose:'gift'},{purpose:'cashback'},{mode:'live'},{payerCompanyId:'merchant-1'},{payerAccountId:''},{amount:11n*U},{token:gift}])
  await assert.rejects(verifyRewardPurchase(client,{...intent,...patch},receipt.transactionHash,receipt.logs[0].logIndex,t0+20n,31337));
});
