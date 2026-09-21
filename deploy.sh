#!/usr/bin/env bash
set -euo pipefail

HOST="kharek3"
DEST="/var/www/atmos-barnaul.ru"

cd "$(dirname "$0")"

COPYFILE_DISABLE=1 tar --exclude='.htaccess' --exclude='.DS_Store' --exclude='._*' -czf - \
  index.html privacy.html 404.html styles.css script.js robots.txt sitemap.xml images \
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
