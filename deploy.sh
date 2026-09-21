#!/usr/bin/env bash
set -euo pipefail

HOST="kharek3"
DEST="/var/www/atmos-barnaul.ru"

cd "$(dirname "$0")"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp -R index.html privacy.html 404.html styles.css script.js robots.txt sitemap.xml images "$STAGE/"
for f in yandex_*.html google*.html; do [ -e "$f" ] && cp "$f" "$STAGE/"; done

python3 - "$STAGE" <<'PY'
import hashlib, io, os, re, sys
stage = sys.argv[1]

def ver(path, n=8):
    with open(path, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()[:n]

css_path = os.path.join(stage, 'styles.css')
css = io.open(css_path, encoding='utf-8').read()

def stamp(m):
    rel = m.group(2)
    full = os.path.join(stage, rel)
    if not os.path.exists(full):
        return m.group(0)
    return "%s%s?v=%s%s" % (m.group(1), rel, ver(full, 6), m.group(3))

css = re.sub(r"(url\(')(images/[^')?]+)('\))", stamp, css)
io.open(css_path, 'w', encoding='utf-8').write(css)

css_v = ver(css_path)
js_v = ver(os.path.join(stage, 'script.js'))

for page in ('index.html', 'privacy.html', '404.html'):
    p = os.path.join(stage, page)
    if not os.path.exists(p):
        continue
    t = io.open(p, encoding='utf-8').read()
    t = re.sub(r'(href="/?styles\.css)"', r'\1?v=%s"' % css_v, t)
    t = re.sub(r'(src="/?script\.js)"', r'\1?v=%s"' % js_v, t)
    io.open(p, 'w', encoding='utf-8').write(t)

print("версии: styles.css?v=%s  script.js?v=%s" % (css_v, js_v))
PY

find "$STAGE" \( -name '._*' -o -name '.DS_Store' \) -delete

COPYFILE_DISABLE=1 tar -C "$STAGE" -czf - . \
  | ssh "$HOST" "
      rm -rf $DEST.new && mkdir -p $DEST.new &&
      tar -xzf - -C $DEST.new &&
      find $DEST.new \( -name '._*' -o -name '.DS_Store' \) -delete &&
      chown -R www-data:www-data $DEST.new &&
      rm -rf $DEST.old && mv $DEST $DEST.old && mv $DEST.new $DEST &&
      rm -rf $DEST.old &&
      echo \"выложено: \$(find $DEST -type f | wc -l) файлов\"
    "

curl -s -o /dev/null -w "проверка: %{http_code}\n" https://atmos-barnaul.ru/ || true
