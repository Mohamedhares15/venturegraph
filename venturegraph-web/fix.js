const fs = require('fs');
const path = require('path');

const pages = [
  'app/modules/network-navigator/page.tsx',
  'app/modules/tps-engine/page.tsx',
  'app/modules/link-prediction/page.tsx',
  'app/modules/multi-sector-dashboard/page.tsx',
  'app/modules/derived-signals/page.tsx',
  'app/modules/mena-pulse/page.tsx'
];

for (const p of pages) {
  const fullPath = path.join(__dirname, p);
  if (!fs.existsSync(fullPath)) {
    console.log('Skipping', fullPath);
    continue;
  }
  let content = fs.readFileSync(fullPath, 'utf8');

  // Skip if already converted
  if (content.includes('"use client"')) {
    console.log('Already converted', p);
    continue;
  }

  // 1. Add use client and useMemo
  content = content.replace(/import type \{ Metadata \} from "next";\r?\n/, '"use client";\nimport { useMemo } from "react";\n');
  
  // 2. Remove metadata export
  content = content.replace(/export const metadata: Metadata = \{[\s\S]*?\};\r?\n/, '');
  
  // 3. Remove dynamic export
  content = content.replace(/export const dynamic = "force-dynamic";\r?\n/, '');

  // 4. Update data imports
  content = content.replace(/import \{([\s\S]*?)\} from "@\/lib\/data";/, (match, group) => {
    return 'import { useMultiData } from "@/lib/useData";\n' + match;
  });

  // 5. Change export default async function
  content = content.replace(/export default async function (\w+)\(\) \{/, 'export default function $1() {');

  // 6. Fix data fetching
  const promiseAllRegex = /const \[([\s\S]*?)\] = await Promise\.all\(\[\s*([\s\S]*?)\s*\]\);/;
  const match = content.match(promiseAllRegex);
  
  if (match) {
    const vars = match[1].split(',').map(s => s.trim()).filter(Boolean);
    const calls = match[2].split(',').map(s => s.trim()).filter(Boolean);
    
    const dataKeys = calls.map(c => {
      let key = c.replace('load', '').replace('()', '').toLowerCase();
      if (key === 'sms') return 'sms';
      if (key === 'smscorr') return 'sms_corr';
      if (key === 'tps') return 'tps';
      if (key === 'tpspanel') return 'tps_panel';
      if (key === 'eventpanel') return 'event_panel';
      if (key === 'communities') return 'communities';
      if (key === 'partition') return 'partition';
      if (key === 'centrality') return 'centrality';
      if (key === 'edges') return 'edges';
      if (key === 'invpanel') return 'inv_panel';
      if (key === 'alphas') return 'alphas';
      if (key === 'acquisitions') return 'acquisitions';
      if (key === 'ipos') return 'ipos';
      if (key === 'objects') return 'objects';
      return key;
    });

    const useDataCall = `const { data, loading } = useMultiData<any>([${dataKeys.map(k => '"'+k+'"').join(', ')}]);\n` + 
                        vars.map((v, i) => `  const ${v} = (data.${dataKeys[i]} ?? []) as any;`).join('\n') +
                        `\n\n  if (loading) return <div className="sov-fade-up p-12 text-center text-ink-500">Loading data...</div>;`;

    content = content.replace(promiseAllRegex, useDataCall);
  }

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log('Fixed', p);
}
