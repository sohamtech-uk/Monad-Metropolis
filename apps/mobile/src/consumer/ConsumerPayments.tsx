import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { erc20Abi, formatUnits, getAddress, type Hex } from 'viem';
import {
  amountUnits, bytes32, consumerConfig, executeConsumerAction, GIFT_ABI, newReference,
  parseSignedVoucher, publicConsumerClient, STREAM_ABI, TEST_AUSD, verifyConsumerDeployment,
  vestedAmount, type BroadcastEvidence, type ConsumerAction, type Kind,
} from '@cherry-metropolis/consumer-payments';
import { createMeraLiveAccount, recoverMeraLiveAccount, describeMeraError, type MeraAccountIdentity } from '../mera/account';

type Plan = Extract<ConsumerAction, { type: 'gift' | 'stream' }>;
const money = (value: bigint) => `${formatUnits(value, 6)} test AUSD`;
const utc = (value: bigint) => new Date(Number(value) * 1000).toISOString();

export function ConsumerPayments() {
  const [tab, setTab] = useState<Kind>('stream');
  const [identity, setIdentity] = useState<MeraAccountIdentity | null>(null);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('10.00');
  const [duration, setDuration] = useState('60');
  const [unlock, setUnlock] = useState('');
  const [expires, setExpires] = useState('');
  const [cancellable, setCancellable] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [approvalOk, setApprovalOk] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [details, setDetails] = useState('');
  const [voucher, setVoucher] = useState('');
  const [balances, setBalances] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [last, setLast] = useState<BroadcastEvidence | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [previewStarted, setPreviewStarted] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now());
  const configResult = useMemo(() => {
    try { return { config: consumerConfig({
      enabled: process.env.EXPO_PUBLIC_CONSUMER_PAYMENTS_ENABLED,
      rpcUrl: process.env.EXPO_PUBLIC_MONAD_RPC_URL,
      gifts: process.env.EXPO_PUBLIC_CONSUMER_GIFT_ADDRESS,
      streams: process.env.EXPO_PUBLIC_CONSUMER_STREAM_ADDRESS,
      rewards: process.env.EXPO_PUBLIC_CONSUMER_REWARDS_ADDRESS,
    }), error: '' }; }
    catch (e) { return { config: null, error: e instanceof Error ? e.message : 'Invalid consumer configuration.' }; }
  }, []);
  const config = configResult.config;
  const configured = Boolean(config?.enabled && (tab === 'gift' ? config.gifts : tab === 'stream' ? config.streams : config.rewards));
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);

  async function connect(create: boolean) {
    setBusy(true); setError(''); setNotice('');
    try {
      const live = await (create ? createMeraLiveAccount() : recoverMeraLiveAccount());
      try { setIdentity(live.identity); setPlan(null); setApprovalOk(false); }
      finally { live.end(); }
    } catch(e) { setError(describeMeraError(e)); } finally { setBusy(false); }
  }
  async function refreshBalances() {
    if (!config || !identity) return;
    setBusy(true); setError('');
    try {
      const client = publicConsumerClient(config);
      if (await client.getChainId() !== 10143) throw new Error('Wrong chain.');
      const [mon, ausd] = await Promise.all([client.getBalance({address:identity.address}), client.readContract({address:TEST_AUSD,abi:erc20Abi,functionName:'balanceOf',args:[identity.address]})]);
      setBalances(`${money(ausd)} · ${formatUnits(mon,18)} MON for transaction fees`);
    } catch(e) { setError(describeMeraError(e)); } finally { setBusy(false); }
  }
  function buildPlan(): Plan {
    const to = getAddress(recipient.trim());
    if (!identity || to === getAddress(identity.address)) throw new Error('Choose a different recipient and verify their address separately.');
    const units = amountUnits(amount); const reference = newReference();
    if (tab === 'gift') {
      const u = Date.parse(unlock), e = Date.parse(expires);
      if (!/Z$/.test(unlock) || !/Z$/.test(expires) || !Number.isFinite(u) || !Number.isFinite(e) || u <= Date.now() || e <= u) throw new Error('Enter future UTC dates ending in Z; expiry must follow unlock.');
      return {type:'gift',recipient:to,amount:units,unlockAt:BigInt(Math.floor(u/1000)),expiresAt:BigInt(Math.floor(e/1000)),reference};
    }
    if (!/^\d+$/.test(duration) || Number(duration) < 1 || Number(duration) > 365*86400) throw new Error('Duration must be 1–31,536,000 seconds.');
    return {type:'stream',recipient:to,amount:units,startAt:0n,duration:BigInt(duration),cancellable,reference};
  }
  async function run(action: ConsumerAction): Promise<boolean> {
    if (!config || !identity || busy) return false;
    setBusy(true); setError(''); setNotice(''); setLast(null); setConfirmed(false);
    let live: Awaited<ReturnType<typeof recoverMeraLiveAccount>> | null = null;
    try {
      live = await recoverMeraLiveAccount();
      if (getAddress(live.identity.address) !== getAddress(identity.address)) throw new Error('A different passkey account was selected. Nothing submitted.');
      const result = await executeConsumerAction(config, live.account, action, e => {
        setLast(e); if (e.recordId) setLookupId(e.recordId);
        setNotice('Submitted — waiting for two confirmations. Do not resubmit while status is uncertain.');
      });
      setLast(result); setConfirmed(true); setNotice('Transaction confirmed on Monad testnet. This is not a GBP or payroll-accounting update.');
      return true;
    } catch(e) {
      setError(`${describeMeraError(e)} Check the transaction/record before retrying. A network error does not prove that a transaction failed.`);
      return false;
    } finally { live?.end(); setBusy(false); }
  }
  async function approve() {
    try {
      const next = buildPlan(); setPlan(next); setApprovalOk(false);
      const ok = await run({type:'approve',kind:next.type,amount:next.amount}); setApprovalOk(ok);
    } catch(e) { setError(describeMeraError(e)); }
  }
  async function fund() {
    if (plan && approvalOk && await run(plan)) { setPlan(null); setApprovalOk(false); }
  }
  async function checkTransaction() {
    if (!last || !config) return;
    setBusy(true);setError('');
    try {
      const client = publicConsumerClient(config);
      const r = await client.getTransactionReceipt({hash:last.txHash});
      const head = await client.getBlockNumber({cacheTime:0});
      if (r.status !== 'success') { setNotice('Reverted: inspect the transaction before preparing a new action.'); return; }
      if (head < r.blockNumber + 1n) {setNotice('Still waiting for two confirmations.');return;}
      setConfirmed(true);setNotice('Confirmed on Monad testnet.');
      if (last.action === 'approve') setApprovalOk(true);
      if (last.action === 'gift' || last.action === 'stream') {setPlan(null);setApprovalOk(false);}
    } catch {setNotice('Receipt not available yet. Do not automatically resend.');} finally {setBusy(false);}
  }
  async function loadRecord() {
    if (!config || tab === 'rewards') return;
    setBusy(true);setError('');setDetails('');
    try {
      const id = bytes32(lookupId.trim());const {client,address}=await verifyConsumerDeployment(config,tab);
      const block = await client.getBlock();
      if (tab === 'gift') {
        const g=await client.readContract({address,abi:GIFT_ABI,functionName:'gifts',args:[id]});
        if(g[5]===0) throw new Error('Gift not found.');
        const state=g[5]===2?'Claimed':g[5]===3?'Reclaimed':block.timestamp>=g[4]?'Expired — sender can reclaim':block.timestamp>=g[3]?'Available to claim':'Locked';
        setDetails(`${state}\n${money(g[2])}\nRecipient: ${g[1]}\nUnlock: ${utc(g[3])}\nExpiry: ${utc(g[4])}\nRead at block ${block.number}`);
      } else {
        const s=await client.readContract({address,abi:STREAM_ABI,functionName:'streams',args:[id]});
        if(s[2]===0n) throw new Error('Stream not found.');
        const available=await client.readContract({address,abi:STREAM_ABI,functionName:'withdrawable',args:[id],blockNumber:block.number});
        setDetails(`${s[7]?'Cancelled — earned funds preserved':'Funded earnings stream'}\nTotal funded: ${money(s[2])}\nWithdrawn: ${money(s[3])}\nAvailable at this block: ${money(available)}\nRecipient: ${s[1]}\nStart: ${utc(s[4])}\nEnd: ${utc(s[5])}\nCancellation allowed: ${s[6]?'Yes (unvested only)':'No'}\nRead at block ${block.number}`);
      }
    }catch(e){setError(describeMeraError(e));}finally{setBusy(false);}
  }
  async function recordAction(type:'claimGift'|'reclaimGift'|'withdraw'|'cancel') {
    try {await run({type,id:bytes32(lookupId.trim())});}catch(e){setError(describeMeraError(e));}
  }
  async function claimReward() {
    try {const parsed=parseSignedVoucher(voucher);await run({type:'reward',...parsed});}catch(e){setError(describeMeraError(e));}
  }
  function demoDates(){const u=Date.now()+120000;setUnlock(new Date(u).toISOString());setExpires(new Date(u+86400000).toISOString());}
  const preview = previewStarted === null ? 0n : vestedAmount(60_000000n,BigInt(previewStarted),BigInt(previewStarted+60),BigInt(Math.floor(clock/1000)));
  return <View style={styles.wrap}>
    <Text style={styles.eyebrow}>CHERRY PAY · CONSUMER TESTNET LAB</Text>
    <Text style={styles.title}>Earn, give and get rewarded.</Text>
    <Text style={styles.body}>Test AUSD only. These experimental contracts are not audited. No GBP balance, real payroll or production rewards are enabled.</Text>
    <View style={styles.tabs}>{(['stream','rewards','gift'] as Kind[]).map(k=><Pressable key={k} accessibilityRole="button" disabled={busy||plan!==null} onPress={()=>{setTab(k);setDetails('');setLookupId('');setError('');}} style={[styles.tab,tab===k&&styles.active]}><Text style={tab===k?styles.activeText:styles.tabText}>{k==='stream'?'Earnings':k==='gift'?'Gifts':'Rewards'}</Text></Pressable>)}</View>
    {!configured?<View style={styles.warning}><Text style={styles.body}>{configResult.error||'On-chain actions are disabled until this testnet contract is deployed, configured and explicitly enabled. The preview below moves no funds.'}</Text></View>:null}
    <View style={styles.card}>
      <Text style={styles.heading}>Your passkey account</Text>
      <Text selectable style={styles.code}>{identity?.address||'No account connected. Use your existing Cherry Pay passkey or create a separate test account.'}</Text>
      <View style={styles.actions}><Button label="Use existing passkey" disabled={busy||plan!==null} onPress={()=>void connect(false)}/><Button secondary label="Create test account" disabled={busy||plan!==null} onPress={()=>void connect(true)}/></View>
      {identity?<><Text>{balances||'Refresh to read test AUSD and MON. Fund this account using the existing payment flow.'}</Text><Button secondary label="Refresh balances" disabled={busy} onPress={()=>void refreshBalances()}/></>:null}
    </View>
    {tab==='stream'?<View style={styles.card}>
      <Text style={styles.heading}>Watch earnings become available</Text>
      <Text style={styles.big}>{money(preview)}</Text>
      <Text style={styles.body}>Illustrative preview: 60 test AUSD over 60 seconds. This counter is a simulation, not a wallet balance or a blockchain transaction.</Text>
      <Button secondary label="Restart 60-second preview" disabled={busy} onPress={()=>setPreviewStarted(Math.floor(Date.now()/1000))}/>
    </View>:null}
    {tab!=='rewards'?<View style={styles.card}>
      <Text style={styles.heading}>{tab==='gift'?'Create a date-locked gift':'Create a prefunded earnings stream'}</Text>
      <Text style={styles.body}>Verify the recipient address with its owner. Funding is escrowed by a contract, not held in a Cherry Money bank account.</Text>
      <Field label="Recipient Mera address" value={recipient} set={setRecipient} disabled={busy||plan!==null}/>
      <Field label="Amount (test AUSD)" value={amount} set={setAmount} disabled={busy||plan!==null}/>
      {tab==='gift'?<><Button secondary label="Set demo unlock in 2 minutes" disabled={busy||plan!==null} onPress={demoDates}/><Field label="Unlock time (UTC, for example 2026-10-02T12:00:00Z)" value={unlock} set={setUnlock} disabled={busy||plan!==null}/><Field label="Claim expires (UTC)" value={expires} set={setExpires} disabled={busy||plan!==null}/><Text style={styles.body}>Only the recipient can claim before expiry. After expiry, only the sender can reclaim. Neither action happens automatically.</Text></>:<><Field label="Duration in seconds (60 for a short demo)" value={duration} set={setDuration} disabled={busy||plan!==null}/><Button secondary label={cancellable?'Cancellation: allowed for unearned funds only':'Cancellation: not allowed'} disabled={busy||plan!==null} onPress={()=>setCancellable(!cancellable)}/><Text style={styles.body}>Starts when funded. Accrued funds remain withdrawable even if a cancellable stream is stopped.</Text></>}
      {plan?<Text selectable style={styles.code}>Locked funding plan: {money(plan.amount)} to {plan.recipient}{'\n'}Reference: {plan.reference}</Text>:null}
      <Button label="1. Approve exact test AUSD amount" disabled={!configured||!identity||busy||plan!==null} onPress={()=>void approve()}/>
      <Button label="2. Fund the locked plan" disabled={!configured||!identity||busy||!approvalOk||!plan} onPress={()=>void fund()}/>
      <Button secondary label="Revoke remaining allowance and clear plan" disabled={!configured||!identity||busy} onPress={()=>void(async()=>{if(await run({type:'revoke',kind:tab})){setPlan(null);setApprovalOk(false);}})()}/>
      <Text style={styles.body}>Two separate confirmations: approval does not create the gift/stream. Each action asks for your passkey. Never retry an uncertain funding transaction without checking its reference.</Text>
    </View>:<View style={styles.card}>
      <Text style={styles.heading}>Merchant-funded test rewards</Text>
      <Text style={styles.body}>An enrolled merchant purchase must be independently checked by the designated testnet verifier. A signed reward voucher can then claim from the funded campaign. The amount remains subject to its cap, claim deadline and available budget.</Text>
      <Text style={styles.body}>Cherry Points, GBP cashback and subscription credits remain separate and unchanged. Salary withdrawals, gift claims and cashback payouts do not earn purchase rewards.</Text>
      <Text style={styles.label}>Verifier-signed EIP-712 voucher (not a private key)</Text>
      <TextInput accessibilityLabel="Verifier-signed reward voucher" multiline autoCorrect={false} autoCapitalize="none" style={[styles.input,{minHeight:140}]} value={voucher} onChangeText={setVoucher} editable={!busy}/>
      <Button label="Claim test reward with passkey" disabled={!configured||!identity||busy||!voucher.trim()} onPress={()=>void claimReward()}/>
      <Text style={styles.body}>Raw CRE simulation JSON cannot authorise a reward. Automatic production rewards integration is not enabled by this screen.</Text>
    </View>}
    {tab!=='rewards'?<View style={styles.card}>
      <Text style={styles.heading}>{tab==='gift'?'Open a gift':'Open an earnings stream'}</Text>
      <Field label="Record ID (not a secret)" value={lookupId} set={setLookupId} disabled={busy}/>
      <Button secondary label="Read current on-chain status" disabled={busy||!lookupId||!(tab==='gift'?config?.gifts:config?.streams)} onPress={()=>void loadRecord()}/>
      {details?<Text selectable style={styles.code}>{details}</Text>:null}
      <Button label={tab==='gift'?'Claim gift as recipient':'Withdraw earned amount as recipient'} disabled={!configured||!identity||busy||!lookupId} onPress={()=>void recordAction(tab==='gift'?'claimGift':'withdraw')}/>
      <Button secondary label={tab==='gift'?'Reclaim expired gift as sender':'Cancel unvested remainder as sender'} disabled={!configured||!identity||busy||!lookupId} onPress={()=>void recordAction(tab==='gift'?'reclaimGift':'cancel')}/>
    </View>:null}
    {(error||notice||last)?<View style={styles.card}>
      <Text style={styles.heading}>Transaction evidence</Text>
      {error?<Text style={styles.error}>{error}</Text>:null}{notice?<Text style={styles.body}>{notice}</Text>:null}
      {last?<><Text selectable style={styles.code}>{last.txHash}{'\n'}{last.recordId||''}</Text><Text>{confirmed?'Confirmed':'Submitted / check status'}</Text><Button secondary label="View on Monad testnet explorer" onPress={()=>void Linking.openURL(`https://testnet.monadscan.com/tx/${last.txHash}`)}/><Button secondary label="Check receipt — do not resend" disabled={busy} onPress={()=>void checkTransaction()}/></>:null}
    </View>:null}
  </View>;
}
function Field({label,value,set,disabled}:{label:string;value:string;set:(v:string)=>void;disabled:boolean}){return <View style={{gap:6}}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={set} editable={!disabled} autoCapitalize="none" autoCorrect={false} style={styles.input}/></View>;}
function Button({label,onPress,disabled=false,secondary=false}:{label:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,secondary&&styles.secondary,disabled&&{opacity:0.4}]}><Text style={secondary?styles.tabText:styles.activeText}>{label}</Text></Pressable>;}
const styles=StyleSheet.create({wrap:{gap:18},eyebrow:{fontSize:11,fontWeight:'700',letterSpacing:1,color:'#54606f'},title:{fontSize:30,fontWeight:'700',color:'#142032'},body:{fontSize:14,lineHeight:22,color:'#475569'},tabs:{flexDirection:'row',gap:8,flexWrap:'wrap'},tab:{paddingHorizontal:20,paddingVertical:13,borderRadius:12,backgroundColor:'#e8ecf2'},active:{backgroundColor:'#183127'},tabText:{color:'#172b27',fontWeight:'700'},activeText:{color:'#fff',fontWeight:'700'},card:{backgroundColor:'#fff',padding:22,borderRadius:18,gap:14,borderWidth:1,borderColor:'#e4e8ee'},heading:{fontSize:20,fontWeight:'700',color:'#152b27'},big:{fontSize:32,fontWeight:'700',color:'#17634d'},warning:{padding:16,borderRadius:12,backgroundColor:'#fff5da'},code:{fontFamily:'monospace',fontSize:12,lineHeight:20,color:'#475569'},actions:{flexDirection:'row',flexWrap:'wrap',gap:8},button:{backgroundColor:'#183127',borderRadius:12,padding:14,alignItems:'center'},secondary:{backgroundColor:'#edf4f0'},label:{fontSize:13,fontWeight:'600',color:'#334155'},input:{padding:12,borderRadius:10,borderWidth:1,borderColor:'#c8d1dc',color:'#172b27'},error:{color:'#b91c1c',lineHeight:22}});
