"""Проставляет версии файлов приложения в admin/index.html (import map + ?v= у css/js).

Зачем: GitHub Pages кэширует файлы ~10 минут. Без версий после выкладки браузер
может смешать старый и новый модуль. Запускать перед каждым коммитом:

    py tools/stamp.py
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "admin" / "index.html"


def h(p: Path) -> str:
    return hashlib.sha1(p.read_bytes()).hexdigest()[:8]


def main():
    app = ROOT / "app"
    imports = {f"../app/{p.name}": f"../app/{p.name}?v={h(p)}" for p in sorted(app.glob("*.js"))}
    s = INDEX.read_text(encoding="utf-8")
    block = '<script type="importmap">' + json.dumps({"imports": imports}, ensure_ascii=False) + "</script>"
    if '<script type="importmap">' in s:
        s = re.sub(r'<script type="importmap">.*?</script>', block, s, flags=re.S)
    else:
        s = s.replace('<script type="module"', block + '\n<script type="module"', 1)
    s = re.sub(r'href="\.\./app/app\.css(\?v=\w+)?"', f'href="../app/app.css?v={h(app / "app.css")}"', s)
    s = re.sub(r'src="\.\./core/kz\.js(\?v=\w+)?"', f'src="../core/kz.js?v={h(ROOT / "core" / "kz.js")}"', s)
    s = re.sub(r'src="\.\./app/app\.js(\?v=\w+)?"', f'src="../app/app.js?v={h(app / "app.js")}"', s)
    INDEX.write_text(s, encoding="utf-8")
    print("stamped", len(imports), "modules")


if __name__ == "__main__":
    main()
