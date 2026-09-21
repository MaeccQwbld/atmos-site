#!/usr/bin/env bash
set -euo pipefail

HOST="kharek3"
DEST="/var/www/atmos-barnaul.ru"

cd "$(dirname "$0")"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp -R index.html privacy.html 404.html styles.css script.js robots.txt sitemap.xml images "$STAGE/"
for f in yandex_*.html google*.html; do [ -e "$f" ] && cp "$f" "$STAGE/"; done

CSS_V=$(md5 -q styles.css | cut -c1-8)
JS_V=$(md5 -q script.js | cut -c1-8)

for page in "$STAGE"/index.html "$STAGE"/privacy.html "$STAGE"/404.html; do
  [ -e "$page" ] || continue
  sed -i '' -E "s#(href=\"/?styles\.css)\"#\1?v=$CSS_V\"#g; s#(src=\"/?script\.js)\"#\1?v=$JS_V\"#g" "$page"
done

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

echo "версии: styles.css?v=$CSS_V  script.js?v=$JS_V"
curl -s -o /dev/null -w "проверка: %{http_code}\n" https://atmos-barnaul.ru/ || true
