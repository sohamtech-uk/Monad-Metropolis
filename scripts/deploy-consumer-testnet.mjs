// Manual testnet deployment only. Never runs as part of install/build/test.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, defineChain, erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
if (process.argv[2] !== '--confirm-testnet-deploy') throw new Error('Explicit --confirm-testnet-deploy is required.');
const key = process.env.MONAD_DEPLOYER_PRIVATE_KEY;
if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) throw new Error('Set the deployment private key in the secret environment, never in source.');
const rpc = process.env.MONAD_RPC_URL ?? 'https://testnet-rpc.monad.xyz';
if (new URL(rpc).protocol !== 'https:') throw new Error('HTTPS RPC required.');
const token='0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC';
const chain=defineChain({id:10143,name:'Monad Testnet',nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:{default:{http:[rpc]}}});
const client=createPublicClient({chain,transport:http(rpc,{retryCount:0})});
const account=privateKeyToAccount(key);
const wallet=createWalletClient({account,chain,transport:http(rpc,{retryCount:0})});
const output='build/consumer-deployment.json';
if(existsSync(output))throw new Error('Existing deployment journal found. Inspect it; do not blindly redeploy after a timeout.');
if(await client.getChainId()!==10143)throw new Error('Refusing to deploy outside Monad testnet.');
if(await client.readContract({address:token,abi:erc20Abi,functionName:'decimals'})!==6)throw new Error('Unexpected test token.');
const journal={chainId:10143,asset:token,source:process.env.GITHUB_SHA??'local-unrecorded',contracts:{},status:'in_progress'};
const save=()=>writeFileSync(output,JSON.stringify(journal,null,2)+'\n');save();
for(const name of ['CherryGiftEscrow','CherryEarningsStream','CherryRewardCampaigns']){
 const a=JSON.parse(readFileSync(`build/consumer/${name}.json`));
 const hash=await wallet.deployContract({abi:a.abi,bytecode:`0x${a.evm.bytecode.object}`,args:[token]});
 journal.contracts[name]={transactionHash:hash,status:'submitted'};save();
 const receipt=await client.waitForTransactionReceipt({hash,confirmations:2,timeout:120000});
 if(receipt.status!=='success'||!receipt.contractAddress)throw new Error(`${name} deployment did not succeed: ${hash}`);
 const code=await client.getBytecode({address:receipt.contractAddress});if(!code||code==='0x')throw new Error('No deployed bytecode.');
 const asset=await client.readContract({address:receipt.contractAddress,abi:a.abi,functionName:'asset'});
 if(asset.toLowerCase()!==token.toLowerCase())throw new Error('Wrong deployed asset.');
 journal.contracts[name]={transactionHash:hash,address:receipt.contractAddress,blockNumber:String(receipt.blockNumber),status:'verified'};save();
}
journal.status='deployed_testnet_only';save();
console.log(JSON.stringify(journal,null,2));
console.log('No streams/gifts/campaigns funded. No production switch changed. Review addresses before enabling UI.');
