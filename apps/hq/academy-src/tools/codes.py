"""Коды учеников академии: имя-XXXXXX, как проверяет worker.js и считает academy-codes.html.

    ACADEMY_SECRET=... python3 tools/codes.py Анна "Борис Петров"
"""
import base64, hashlib, hmac, os, re, sys

TR = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
              'a b v g d e e zh z i y k l m n o p r s t u f h ts ch sh sch _ y _ e yu ya'.split()))

def label(name):
    s = ''.join(TR.get(c, c) for c in name.lower()).replace('_', '')
    return re.sub(r'[^a-z0-9]', '', s)[:24]

def code(secret, name):
    n = label(name)
    mac = hmac.new(secret.encode(), n.encode(), hashlib.sha256).digest()
    return f'{n}-{base64.b32encode(mac).decode()[:6]}'

if __name__ == '__main__':
    secret = os.environ['ACADEMY_SECRET'].strip()
    for name in sys.argv[1:]:
        print(name, '—', code(secret, name) if len(label(name)) >= 2 else 'слишком короткое имя')
