#!/usr/bin/env python3
import json
import os
import time
import urllib.parse
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get('TG_TOKEN', '')
CHAT_ID = os.environ.get('TG_CHAT_ID', '')
HOST = os.environ.get('LEAD_HOST', '127.0.0.1')
PORT = int(os.environ.get('LEAD_PORT', '8099'))

MAX_BODY = 16 * 1024
WINDOW = 15 * 60
PER_IP = 5
PER_ALL = 60

TYPES = {
    'flat': 'Квартира',
    'house': 'Загородный дом',
    'commercial': 'Коммерческое помещение',
    'other': 'Другое',
}

hits = {}
recent = deque()


def allowed(ip):
    now = time.time()
    while recent and now - recent[0] > WINDOW:
        recent.popleft()
    if len(recent) >= PER_ALL:
        return False
    q = hits.setdefault(ip, deque())
    while q and now - q[0] > WINDOW:
        q.popleft()
    if len(q) >= PER_IP:
        return False
    q.append(now)
    recent.append(now)
    if len(hits) > 5000:
        for k in [k for k, v in hits.items() if not v]:
            hits.pop(k, None)
    return True


def clean(value, limit):
    text = str(value or '').replace('\r', ' ').strip()
    text = ''.join(ch for ch in text if ch == '\n' or ch >= ' ')
    return text[:limit]


def send(text):
    data = urllib.parse.urlencode({
        'chat_id': CHAT_ID,
        'text': text,
        'disable_web_page_preview': 'true',
    }).encode('utf-8')
    req = urllib.request.Request(
        'https://api.telegram.org/bot%s/sendMessage' % TOKEN,
        data=data,
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    with urllib.request.urlopen(req, timeout=12) as resp:
        return json.loads(resp.read().decode('utf-8')).get('ok') is True


class Handler(BaseHTTPRequestHandler):
    server_version = 'atmos-lead'
    sys_version = ''

    def log_message(self, fmt, *args):
        print('%s %s' % (self.address_string(), fmt % args), flush=True)

    def reply(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def client_ip(self):
        return self.headers.get('X-Real-IP') or self.client_address[0]

    def do_GET(self):
        if self.path == '/api/lead/health':
            self.reply(200, {'ok': True, 'configured': bool(TOKEN and CHAT_ID)})
        else:
            self.reply(404, {'ok': False})

    def do_POST(self):
        if self.path != '/api/lead':
            self.reply(404, {'ok': False})
            return

        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self.reply(400, {'ok': False, 'error': 'bad_size'})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
            if not isinstance(payload, dict):
                raise ValueError
        except Exception:
            self.reply(400, {'ok': False, 'error': 'bad_json'})
            return

        if clean(payload.get('website'), 40):
            self.reply(200, {'ok': True})
            return

        name = clean(payload.get('name'), 100)
        contact = clean(payload.get('contact'), 100)
        if len(name) < 2 or len(contact) < 3:
            self.reply(422, {'ok': False, 'error': 'bad_fields'})
            return

        if not allowed(self.client_ip()):
            self.reply(429, {'ok': False, 'error': 'too_many'})
            return

        lines = ['Заявка с сайта atmos-barnaul.ru', '', 'Имя: ' + name, 'Контакт: ' + contact]

        kind = TYPES.get(clean(payload.get('type'), 20))
        if kind:
            lines.append('Тип объекта: ' + kind)

        area = clean(payload.get('area'), 10)
        if area.isdigit():
            lines.append('Площадь: %s м²' % area)

        comment = clean(payload.get('comment'), 1500)
        if comment:
            lines += ['', 'Комментарий:', comment]

        if not TOKEN or not CHAT_ID:
            print('НЕ НАСТРОЕН: нет TG_TOKEN или TG_CHAT_ID', flush=True)
            self.reply(503, {'ok': False, 'error': 'not_configured'})
            return

        try:
            ok = send('\n'.join(lines))
        except Exception as err:
            print('ошибка telegram: %r' % (err,), flush=True)
            ok = False

        if ok:
            self.reply(200, {'ok': True})
        else:
            self.reply(502, {'ok': False, 'error': 'telegram'})


if __name__ == '__main__':
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
