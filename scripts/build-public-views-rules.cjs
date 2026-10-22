/* Keep the published gate rules untouched. This produces a separate candidate. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let rules=fs.readFileSync(path.join(root,'docs/public-site/firestore.production-gate.rules'),'utf8');
const fragment=fs.readFileSync(path.join(root,'docs/public-site/public-live-views.rules.fragment'),'utf8');
const pattern=/match \/publicSites\/\{act\}\/views\/\{view\} \{[\s\S]*?\n\}/;
if(!pattern.test(rules))throw Error('Published catalogue match not found.');
rules=rules.replace(pattern,()=>fragment);
fs.writeFileSync(path.join(root,'docs/public-site/firestore.production-views.rules'),rules);
console.log('Generated additive public live/event view candidate. No original read grants revoked.');
