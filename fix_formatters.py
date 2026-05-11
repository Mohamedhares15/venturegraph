import os
import re

files = [
    'app/modules/network-navigator/page.tsx',
    'app/modules/tps-engine/page.tsx',
    'app/modules/link-prediction/page.tsx',
    'app/modules/multi-sector-dashboard/page.tsx',
    'app/modules/derived-signals/page.tsx',
    'app/modules/mena-pulse/page.tsx'
]

for f in files:
    path = os.path.join('venturegraph-web', f)
    with open(path, 'r', encoding='utf-8') as file:
        content = file.read()
    
    content = content.replace('from "recharts"', 'from "@/components/ui/Charts"')
    
    if 'export const dynamic' not in content:
        content = re.sub(r'(export const metadata)', r'export const dynamic = "force-dynamic";\n\1', content)
        
    content = re.sub(r'\s*tickFormatter=\{[^\}]+\}', '', content)
    content = re.sub(r'\s*formatter=\{[^\}]+\}', '', content)
    content = re.sub(r'\s*labelFormatter=\{[^\}]+\}', '', content)
    
    with open(path, 'w', encoding='utf-8') as file:
        file.write(content)
    print('Fixed ' + path)
