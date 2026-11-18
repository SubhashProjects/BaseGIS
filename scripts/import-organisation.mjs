import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync(new URL('../data/organisation-seed.json',import.meta.url),'utf8'));
console.log(`Prepared ${data.length} organisation rows for review/import.`);
