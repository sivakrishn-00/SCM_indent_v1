import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from app.api.v1.utils import get_hierarchy_maps
from collections import defaultdict

emp, parent_map, subs = get_hierarchy_maps()

paravets = []
for code, d in emp.items():
    if 'paravet' in d['role'].lower():
        parent_code = parent_map.get(code, 'NO_PARENT')
        parent_name = emp.get(parent_code, {}).get('name', parent_code) if parent_code != 'NO_PARENT' else 'N/A'
        parent_role = emp.get(parent_code, {}).get('role', '?') if parent_code != 'NO_PARENT' else 'N/A'
        paravets.append({
            "code": code,
            "name": d['name'],
            "office": d.get('office_name','N/A'),
            "manager_code": parent_code,
            "manager_name": parent_name,
            "manager_role": parent_role
        })

by_manager = defaultdict(list)
for p in paravets:
    by_manager[p["manager_code"]].append(p)

result = {
    "total_paravets": len(paravets),
    "managers": []
}
for mc, sub_list in sorted(by_manager.items(), key=lambda x: len(x[1]), reverse=True):
    mn = sub_list[0]["manager_name"]
    mr = sub_list[0]["manager_role"]
    result["managers"].append({
        "manager_code": mc,
        "manager_name": mn,
        "manager_role": mr,
        "paravet_count": len(sub_list),
        "paravets": [{"code": s["code"], "name": s["name"], "office": s["office"]} for s in sub_list]
    })

with open("paravet_report.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print("DONE")
