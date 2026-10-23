#!/bin/bash
set -euo pipefail

username=$(tr -d '\r\n' </run/secrets/torrserver_username)
password=$(tr -d '\r\n' </run/secrets/torrserver_password)

if [ -z "$username" ] || [ -z "$password" ]; then
  echo "TorrServer credentials must not be empty" >&2
  exit 1
fi

umask 077
jq --null-input --arg username "$username" --arg password "$password" \
  '{($username): $password}' >/config/accs.db.tmp
mv /config/accs.db.tmp /config/accs.db

cp /opt/torrserver/settings.json /config/settings.json.tmp
mv /config/settings.json.tmp /config/settings.json

/usr/local/bin/torrserver "$@" &
torrserver_pid=$!
nginx -g 'daemon off;' &
proxy_pid=$!

stop() {
  kill -TERM "$torrserver_pid" "$proxy_pid" 2>/dev/null || true
  wait "$torrserver_pid" "$proxy_pid" 2>/dev/null || true
}

trap stop TERM INT EXIT
wait -n "$torrserver_pid" "$proxy_pid"
