import solc from 'solc';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const sources = {};
for (const folder of ['contracts/consumer', 'contracts/test']) {
  for (const name of readdirSync(folder).filter(n => n.endsWith('.sol'))) {
    const path = `${folder}/${name}`;
    sources[path] = { content: readFileSync(path, 'utf8') };
  }
}
const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources,
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'shanghai', viaIR: true,
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } }
}), { import: path => {
  try { return { contents: readFileSync(resolve('node_modules', path), 'utf8') }; }
  catch { return { error: `Import not found: ${path}` }; }
} }));
for (const e of output.errors ?? []) console[e.severity === 'error' ? 'error' : 'warn'](e.formattedMessage);
if ((output.errors ?? []).some(e => e.severity === 'error')) process.exit(1);
mkdirSync('build/consumer', { recursive: true });
for (const contracts of Object.values(output.contracts)) for (const [name, artifact] of Object.entries(contracts)) {
  if (artifact.evm.bytecode.object) writeFileSync(`build/consumer/${name}.json`, JSON.stringify(artifact, null, 2));
}
console.log('Compiled consumer escrows and rewards contracts (Shanghai EVM, local/testnet only).');
