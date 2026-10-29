"""Runs on the aicex server (piped over SSH by sync-projects-registry.yml).
Prints host:port where Caddy proxies projects.aicex.club, so the workflow can reach the
command-center API past Caddy's basic auth. Sources: Caddy admin API, then Caddyfile blocks.
An upstream named after a container (<name>:PORT) is resolved to the container IP."""
import glob
import json
import re
import subprocess
import sys
import urllib.request

HOST = "projects.aicex.club"


def walk(node, hit=False):
    if isinstance(node, dict):
        hit = hit or HOST in json.dumps(node.get("match", ""))
        if hit and node.get("handler") == "reverse_proxy":
            for u in node.get("upstreams", []):
                if u.get("dial"):
                    yield u["dial"]
        for v in node.values():
            yield from walk(v, hit)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v, hit)


ups = []
try:
    ups = list(walk(json.load(urllib.request.urlopen("http://127.0.0.1:2019/config/", timeout=5))))
except Exception as e:
    print(f"admin api: {e}", file=sys.stderr)

if not ups:
    for f in ["/etc/caddy/Caddyfile", *glob.glob("/etc/caddy/**/*.caddy", recursive=True), *glob.glob("/opt/edge/**/*.caddy", recursive=True), *glob.glob("/opt/edge/**/Caddyfile", recursive=True)]:
        try:
            text = open(f).read()
        except OSError:
            continue
        m = re.search(re.escape(HOST) + r"[^{\n]*\{(.*?)\n\}", text, re.S)
        if m:
            print(f"found in {f}", file=sys.stderr)
            ups += re.findall(r"reverse_proxy\s+(\S+)", m.group(1))

if not ups:
    sys.exit(0)

up = re.sub(r"^https?://", "", ups[0])
host, _, port = up.rpartition(":")
if host in ("", "localhost"):
    host = "127.0.0.1"
elif not re.match(r"^\d+\.\d+\.\d+\.\d+$", host):
    out = subprocess.run(
        ["docker", "inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}", host],
        capture_output=True, text=True,
    ).stdout.split()
    if out:
        host = out[0]
print(f"{host}:{port}")
