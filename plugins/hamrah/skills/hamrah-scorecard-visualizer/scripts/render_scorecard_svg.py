#!/usr/bin/env python3
import argparse
import html
import json
from pathlib import Path

try:
    from jsonschema import Draft202012Validator
except ImportError:
    Draft202012Validator = None

parser = argparse.ArgumentParser()
parser.add_argument("input")
parser.add_argument("output", nargs="?")
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
schema = json.loads((root / "references/scorecard_visual_schema.json").read_text())
data = json.loads(Path(args.input).read_text())
errors = []
required_root = {"schema_version", "title", "case_label", "generated_at", "routes", "next_steps", "disclaimer"}
if not isinstance(data, dict):
    errors.append("root must be an object")
else:
    for field in sorted(required_root - set(data)):
        errors.append(f"root: missing {field}")
    routes = data.get("routes")
    if not isinstance(routes, list) or not 1 <= len(routes) <= 3:
        errors.append("routes must contain 1 to 3 items")
    else:
        allowed_statuses = {"PASS", "POSSIBLE", "FAIL", "UNKNOWN"}
        allowed_adjustments = {0, -5, -10, -15, -20}
        for index, route in enumerate(routes):
            if route.get("official_status") not in allowed_statuses:
                errors.append(f"routes.{index}.official_status is invalid")
            if route.get("community_adjustment") not in allowed_adjustments:
                errors.append(f"routes.{index}.community_adjustment is invalid")
            for field in ("base_fit", "practical_fit"):
                value = route.get(field)
                if value is not None and (not isinstance(value, (int, float)) or not 0 <= value <= 100):
                    errors.append(f"routes.{index}.{field} must be null or 0..100")
if Draft202012Validator:
    errors.extend(sorted(Draft202012Validator(schema).iter_errors(data), key=lambda error: list(error.path)))
if errors:
    for error in errors:
        if isinstance(error, str):
            print(error)
        else:
            location = ".".join(map(str, error.path)) or "root"
            print(f"{location}: {error.message}")
    raise SystemExit(1)
if args.check:
    print("Scorecard visual model is valid.")
    raise SystemExit(0)
if not args.output:
    parser.error("output is required unless --check is used")

def esc(value):
    return html.escape(str(value))

def wrap(value, width=62):
    result, current = [], ""
    for word in str(value).split():
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > width:
            result.append(current)
            current = word
        else:
            current = candidate
    if current:
        result.append(current)
    return result[:3]

colors = {"PASS": "#198754", "POSSIBLE": "#B7791F", "FAIL": "#C43D3D", "UNKNOWN": "#64748B"}
parts = [f'''<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2000" viewBox="0 0 1600 2000">
<rect width="1600" height="2000" fill="#F4F7FB"/>
<rect x="80" y="70" width="1440" height="210" rx="36" fill="#123B66"/>
<text x="1460" y="145" text-anchor="end" direction="rtl" font-family="Vazirmatn,Tahoma,Arial" font-size="52" font-weight="700" fill="white">{esc(data['title'])}</text>
<text x="1460" y="215" text-anchor="end" direction="rtl" font-family="Vazirmatn,Tahoma,Arial" font-size="28" fill="#DCEBFA">پرونده: {esc(data['case_label'])} · {esc(data['generated_at'])}</text>''']
y = 330
for index, route in enumerate(data["routes"], 1):
    status = route["official_status"]
    color = colors[status]
    base = "—" if route["base_fit"] is None else f"{route['base_fit']}/100"
    practical = "—" if route["practical_fit"] is None else f"{route['practical_fit']}/100"
    parts.append(f'''<rect x="80" y="{y}" width="1440" height="390" rx="30" fill="white" stroke="#D9E3EE" stroke-width="2"/>
<circle cx="135" cy="390" r="32" fill="{color}"/><text x="135" y="401" text-anchor="middle" font-family="Arial" font-size="28" font-weight="700" fill="white">{index}</text>
<text x="1460" y="400" text-anchor="end" direction="rtl" font-family="Vazirmatn,Tahoma,Arial" font-size="34" font-weight="700" fill="#102A43">{esc(route['country'])} — {esc(route['route'])}</text>
<text x="1460" y="460" text-anchor="end" direction="rtl" font-family="Vazirmatn,Tahoma,Arial" font-size="25" fill="{color}">وضعیت رسمی: {status}</text>
<text x="100" y="460" font-family="Arial" font-size="25" fill="#334E68">Base {base} | Community {route['community_adjustment']} | Practical {practical} | Confidence {route['confidence']}</text>''')
    text_y = y + 190
    for reason in route["reasons"]:
        for line in wrap(reason):
            parts.append(f'<text x="1460" y="{text_y}" text-anchor="end" direction="rtl" font-family="Vazirmatn,Tahoma,Arial" font-size="24" fill="#334E68">• {esc(line)}</text>')
            text_y += 34
    if route["blocker"]:
        parts.append(f'<text x="1460" y="{y + 305}" text-anchor="end" direction="rtl" font-family="Vazirmatn,Tahoma,Arial" font-size="23" fill="#A23B3B">نکته مهم: {esc(route["blocker"])}</text>')
    parts.append(f'<text x="1460" y="{y + 355}" text-anchor="end" direction="rtl" font-family="Vazirmatn,Tahoma,Arial" font-size="23" fill="#176B55">قدم بعدی: {esc(route["next_action"])}</text>')
    y += 430
parts.append(f'<rect x="80" y="{y}" width="1440" height="220" rx="30" fill="#E8F1FA"/><text x="1460" y="{y + 55}" text-anchor="end" direction="rtl" font-family="Vazirmatn,Tahoma,Arial" font-size="30" font-weight="700" fill="#123B66">قدم‌های بعدی</text>')
text_y = y + 105
for step in data["next_steps"]:
    parts.append(f'<text x="1460" y="{text_y}" text-anchor="end" direction="rtl" font-family="Vazirmatn,Tahoma,Arial" font-size="24" fill="#334E68">• {esc(step)}</text>')
    text_y += 42
parts.append(f'<text x="800" y="1940" text-anchor="middle" direction="rtl" font-family="Vazirmatn,Tahoma,Arial" font-size="20" fill="#627D98">{esc(data["disclaimer"])}</text></svg>')
Path(args.output).write_text("".join(parts))
print(f"Wrote {args.output}")
