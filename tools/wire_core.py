"""Подключает core/kz.js ко всем страницам: убирает разрозненные Firebase SDK
(8.10 / 9.23 / 10.7 / 10.14) и ставит один compat 10.14.1 + ядро.

    python tools/wire_core.py          # идемпотентно, можно запускать повторно
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SDK = "10.14.1"
PAGES = {
    "admin/schedule.html": ("admin", "schedule"),
    "admin/employees.html": ("admin", "employees"),
    "admin/control.html": ("admin", "control"),
    "admin/logs.html": ("admin", "logs"),
    "admin/lookup.html": ("admin", "lookup"),
    "admin/analytics.html": ("admin", "analytics"),
    "admin/panel.html": ("admin", "panel"),
    "admin/pvz.html": ("admin", "pvz"),
    "admin/claims.html": ("admin", "claims"),
    "admin/claims-reports.html": ("admin", "claims"),
    "admin/claims-install.html": ("admin", "claims"),
    "admin/supplies-log.html": ("admin", "supplies-log"),
    "returns_dashboard.html": ("staff", "returns"),
    "battleship.html": ("staff", "battleship"),
    "tests.html": ("staff", "tests"),
    "supplies_staff_2col.html": ("staff", "staff"),
}
MARK = "<!-- kz-core -->"
SDK_TAG = re.compile(r'[ \t]*<script[^>]*src="https://www\.gstatic\.com/firebasejs/[^"]+"[^>]*>\s*</script>[ \t]*\r?\n?', re.I)
IMPORT = re.compile(r'import\s*\{([^}]*)\}\s*from\s*["\']https://www\.gstatic\.com/firebasejs/[^"\']+["\'];?')


def block(role, page, depth):
    pre = "../" * depth
    tags = "".join(
        f'<script src="https://www.gstatic.com/firebasejs/{SDK}/firebase-{m}-compat.js"></script>\n'
        for m in ("app", "auth", "database"))
    return f'{MARK}\n{tags}<script src="{pre}core/kz.js" data-role="{role}" data-page="{page}"></script>\n'


def wire(rel, role, page):
    p = ROOT / rel
    s = p.read_text(encoding="utf-8")
    if MARK in s:
        s = re.sub(re.escape(MARK) + r'.*?core/kz\.js[^\n]*\n', '', s, flags=re.S)
    first = SDK_TAG.search(s)
    pos = first.start() if first else None
    s = SDK_TAG.sub("", s)
    s = IMPORT.sub(lambda m: "const {" + m.group(1) + "} = window.KZM;", s)
    b = block(role, page, rel.count("/"))
    if pos is None:
        pos = s.lower().find("</head>")
    s = s[:pos] + b + s[pos:]
    p.write_text(s, encoding="utf-8")
    left = len(re.findall(r'gstatic\.com/firebasejs/(?!' + re.escape(SDK) + ')', s))
    print(f"{rel:32} {role:5} sdk-old-left={left}")


if __name__ == "__main__":
    for rel, (role, page) in PAGES.items():
        wire(rel, role, page)
