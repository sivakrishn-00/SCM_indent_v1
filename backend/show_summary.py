import json
d = json.load(open('paravet_report.json', 'r', encoding='utf-8'))
print(f"TOTAL PARAVETS: {d['total_paravets']}")
print(f"TOTAL MANAGERS: {len(d['managers'])}")
for m in d['managers']:
    print(f"  {m['paravet_count']:3d} paravets under {m['manager_name']} ({m['manager_code']}) - Role: {m['manager_role']}")
