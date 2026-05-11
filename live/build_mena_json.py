"""Build MENA static JSON with investor names joined in."""
import pandas as pd, json, os
from pathlib import Path

BASE = Path(__file__).parent.parent
MENA = {'SAU','ARE','EGY','QAT','KWT','BHR','OMN','JOR','LBN','TUN','MAR','DZA',
        'SA','AE','EG','QA','KW','BH','OM','JO','LB','TN','MA','DZ'}

print('Loading objects.csv…')
obj = pd.read_csv(BASE / 'objects.csv', low_memory=False)
id_to_name = dict(zip(obj['id'], obj['name']))

print('Loading funding_rounds.csv…')
fr = pd.read_csv(BASE / 'funding_rounds.csv', low_memory=False)
# Use funding_round_id when available, fallback to id
fr_key = fr['funding_round_id'].fillna(fr['id'])
fr_to_date = dict(zip(fr_key, fr['funded_at']))

print('Loading investments.csv…')
inv = pd.read_csv(BASE / 'investments.csv', low_memory=False)
print(f'  investments columns: {list(inv.columns)}')

inv['funded_object_name'] = inv['funded_object_id'].map(id_to_name)
inv['investor_name']      = inv['investor_object_id'].map(id_to_name)
inv['funded_at']          = inv['funding_round_id'].map(fr_to_date)

# MENA filter
mena_obj = obj[obj['country_code'].isin(MENA)].copy()
mena_ids = set(mena_obj['id'].tolist())
print(f'MENA objects: {len(mena_obj)}')

# Investments where the funded company is MENA
mena_inv = inv[inv['funded_object_id'].isin(mena_ids)].copy()
print(f'MENA investments: {len(mena_inv)}')
print(f'Unique MENA investors: {mena_inv["investor_name"].nunique()}')

# Prepare outputs
mena_obj_out = mena_obj[['id','entity_type','name','category_code','status','country_code',
                          'founded_at','funding_total_usd','funding_rounds','investment_rounds',
                          'invested_companies','first_funding_at','last_funding_at']].fillna('')

mena_inv_out = mena_inv[['funded_object_id','funded_object_name','investor_object_id',
                          'investor_name','funding_round_id','funded_at']].fillna('')

# Acquisitions
try:
    acq = pd.read_csv(BASE / 'acquisitions.csv', low_memory=False)
    mena_acq = acq[acq['acquired_object_id'].isin(mena_ids)].fillna('').to_dict('records')
    print(f'MENA acquisitions: {len(mena_acq)}')
except FileNotFoundError:
    mena_acq = []

# IPOs
try:
    ipos = pd.read_csv(BASE / 'ipos.csv', low_memory=False)
    mena_ipos = ipos[ipos['object_id'].isin(mena_ids)].fillna('').to_dict('records')
    print(f'MENA IPOs: {len(mena_ipos)}')
except FileNotFoundError:
    mena_ipos = []

out = {
    'objects':      mena_obj_out.to_dict('records'),
    'investments':  mena_inv_out.to_dict('records'),
    'acquisitions': mena_acq,
    'ipos':         mena_ipos,
}
out_path = BASE / 'venturegraph-web' / 'public' / 'data' / 'mena_data.json'
out_path.parent.mkdir(parents=True, exist_ok=True)
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(out, f, separators=(',',':'))
print(f'\nSaved {out_path.stat().st_size/1024:.0f} KB to {out_path}')

print('\nTop 10 MENA investors:')
print(mena_inv['investor_name'].value_counts().head(10).to_string())
