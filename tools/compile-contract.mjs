import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

const root = process.cwd();
const contractPath = path.join(root, 'contracts', 'SciconRecords.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const findImports = (importPath) => {
  const resolved = importPath.startsWith('@')
    ? path.join(root, 'node_modules', importPath)
    : path.join(path.dirname(contractPath), importPath);
  try {
    return { contents: fs.readFileSync(resolved, 'utf8') };
  } catch (error) {
    return { error: `Unable to resolve ${importPath}: ${error.message}` };
  }
};

const input = {
  language: 'Solidity',
  sources: { 'contracts/SciconRecords.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (output.errors || []).filter((entry) => entry.severity === 'error');
if (errors.length > 0) {
  for (const error of errors) console.error(error.formattedMessage);
  process.exit(1);
}

const compiled = output.contracts['contracts/SciconRecords.sol'].SciconRecords;
const outDir = path.join(root, 'contracts', 'out');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'SciconRecords.json'), JSON.stringify(compiled, null, 2));
console.log(`SciconRecords compiled: ${compiled.evm.bytecode.object.length / 2} byte bytecode`);
