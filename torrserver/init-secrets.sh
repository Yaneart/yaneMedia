#!/bin/sh
set -eu

command -v openssl >/dev/null 2>&1 || {
  echo 'OpenSSL is required to generate TorrServer secrets.' >&2
  exit 1
}

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
secret_directory="$project_root/storage/torrent-engine/secrets"
umask 077
mkdir -p "$secret_directory"

for name in username password idempotency; do
  secret_path="$secret_directory/$name"
  if [ ! -e "$secret_path" ]; then
    if [ "$name" = username ]; then
      value=yanemedia-torrent
    else
      value=$(openssl rand -base64 32)
    fi
    printf '%s' "$value" > "$secret_path"
    # Compose bind-mounts these files; the non-root engine must be able to read them.
    # The parent directory remains private on the host.
    chmod 0444 "$secret_path"
  fi
done

echo 'TorrServer secrets are ready in the ignored storage directory.'
