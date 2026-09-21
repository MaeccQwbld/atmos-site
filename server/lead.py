#!/usr/bin/env python3
import json
import os
import random
import threading
import time
import urllib.parse
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get('TG_TOKEN', '')
SEED_CHAT = os.environ.get('TG_CHAT_ID', '').strip()
HOST = os.environ.get('LEAD_HOST', '127.0.0.1')
PORT = int(os.environ.get('LEAD_PORT', '8099'))
STATE_DIR = os.environ.get('STATE_DIRECTORY', '/var/lib/atmos-lead')
STATE_PATH = os.path.join(STATE_DIR, 'state.json')

MAX_BODY = 16 * 1024
WINDOW = 15 * 60
PER_IP = 5
PER_ALL = 60
CODE_TTL = 24 * 3600

TYPES = {
    'flat': 'Квартира',
    'house': 'Загородный дом',
    'commercial': 'Коммерческое помещение',
    'other': 'Другое',
}

lock = threading.Lock()
state = {'subs': [], 'codes': {}, 'offset': 0}
hits = {}
recent = deque()


def load():
    global state
    try:
        with open(STATE_PATH, encoding='utf-8') as f:
            data = json.load(f)
        state = {
            'subs': [int(x) for x in data.get('subs', [])],
            'codes': dict(data.get('codes', {})),
            'offset': int(data.get('offset', 0)),
        }
    except Exception:
        state = {'subs': [], 'codes': {}, 'offset': 0}
    if SEED_CHAT and not state['subs']:
        try:
            state['subs'] = [int(SEED_CHAT)]
        except ValueError:
            pass
    save()


def save():
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = STATE_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False)
    os.replace(tmp, STATE_PATH)


def api(method, params=None, timeout=15):
    data = urllib.parse.urlencode(params or {}).encode('utf-8')
    req = urllib.request.Request(
        'https://api.telegram.org/bot%s/%s' % (TOKEN, method),
        data=data,
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


def tell(chat_id, text):
    try:
        return api('sendMessage', {
            'chat_id': chat_id,
            'text': text,
            'disable_web_page_preview': 'true',
        }).get('ok') is True
    except urllib.error.HTTPError as err:
        if err.code in (400, 403):
            with lock:
                if chat_id in state['subs']:
                    state['subs'].remove(chat_id)
                    save()
            print('отписан недоступный чат %s' % chat_id, flush=True)
        return False
    except Exception as err:
        print('ошибка telegram: %r' % (err,), flush=True)
        return False


def broadcast(text):
    with lock:
        targets = list(state['subs'])
    if not targets:
        return False
    return any(tell(chat, text) for chat in targets)


def new_code():
    code = '%06d' % random.SystemRandom().randrange(1000000)
    now = time.time()
    with lock:
        state['codes'] = {k: v for k, v in state['codes'].items() if v > now}
        state['codes'][code] = now + CODE_TTL
        save()
    return code


def redeem(code, chat_id):
    now = time.time()
    with lock:
        state['codes'] = {k: v for k, v in state['codes'].items() if v > now}
        if code not in state['codes']:
            return False
        del state['codes'][code]
        if chat_id not in state['subs']:
            state['subs'].append(chat_id)
        save()
    return True


HELP = (
    'Это бот студии «Атмос». Сюда приходят заявки с сайта atmos-barnaul.ru.\n\n'
    'Чтобы получать их, нужен код доступа — попросите его у того, кому заявки '
    'уже приходят, и отправьте сюда:\n/claim 123456\n\n'
    '/invite — выдать код (для тех, кто уже подключён)\n'
    '/stop — отключиться от заявок'
)


def handle(message):
    chat = message.get('chat') or {}
    chat_id = chat.get('id')
    text = (message.get('text') or '').strip()
    if chat_id is None or not text.startswith('/'):
        return

    parts = text.split()
    cmd = parts[0].split('@')[0].lower()

    with lock:
        subscribed = chat_id in state['subs']

    if cmd in ('/start', '/help'):
        tell(chat_id, HELP if not subscribed else 'Заявки с сайта приходят сюда.\n\n/invite — выдать код доступа другому человеку\n/stop — отключиться')
    elif cmd == '/claim':
        if len(parts) < 2:
            tell(chat_id, 'Отправьте код вместе с командой: /claim 123456')
        elif subscribed:
            tell(chat_id, 'Вы и так получаете заявки.')
        elif redeem(parts[1].strip(), chat_id):
            tell(chat_id, 'Готово. Заявки с сайта теперь приходят сюда.')
            broadcast('К заявкам подключился: %s' % (chat.get('first_name') or chat_id))
        else:
            tell(chat_id, 'Код не подошёл: он либо уже использован, либо просрочен. Попросите новый.')
    elif cmd == '/invite':
        if not subscribed:
            tell(chat_id, 'Выдавать коды может только тот, кому уже приходят заявки.')
        else:
            code = new_code()
            tell(chat_id, 'Код доступа: %s\n\nДействует сутки, сработает один раз. Отправьте его человеку — пусть напишет боту:\n/claim %s' % (code, code))
    elif cmd == '/stop':
        if not subscribed:
            tell(chat_id, 'Вам и так ничего не приходит.')
        else:
            with lock:
                state['subs'].remove(chat_id)
                save()
            tell(chat_id, 'Отключено. Чтобы вернуться, понадобится новый код.')
    else:
        tell(chat_id, HELP)


def poll():
    while True:
        try:
            with lock:
                offset = state['offset']
            data = api('getUpdates', {'offset': offset, 'timeout': 50}, timeout=70)
            for upd in data.get('result', []):
                with lock:
                    state['offset'] = upd['update_id'] + 1
                    save()
                msg = upd.get('message')
                if msg:
                    try:
                        handle(msg)
                    except Exception as err:
                        print('ошибка обработки: %r' % (err,), flush=True)
        except Exception as err:
            print('ошибка опроса: %r' % (err,), flush=True)
            time.sleep(5)


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
            with lock:
                count = len(state['subs'])
            self.reply(200, {'ok': True, 'configured': bool(TOKEN) and count > 0, 'subs': count})
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

        if not TOKEN:
            self.reply(503, {'ok': False, 'error': 'not_configured'})
            return

        if broadcast('\n'.join(lines)):
            self.reply(200, {'ok': True})
        else:
            self.reply(502, {'ok': False, 'error': 'telegram'})


if __name__ == '__main__':
    load()
    threading.Thread(target=poll, daemon=True).start()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
