#!/bin/bash
set -euo pipefail

# Install before starting any untrusted torrent processing. Fail closed on any error.
iptables -w -P OUTPUT DROP
iptables -w -N TORRENT_EGRESS 2>/dev/null || iptables -w -F TORRENT_EGRESS
iptables -w -A TORRENT_EGRESS -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# Only the engine/proxy loopback pair and Docker's DNS stub need local access.
iptables -w -A TORRENT_EGRESS -d 127.0.0.1/32 -o lo -j ACCEPT
# Docker DNATs port 53 to its ephemeral stub port before the filter table.
iptables -w -A TORRENT_EGRESS -d 127.0.0.11/32 -p udp -m conntrack --ctorigdstport 53 -j ACCEPT
iptables -w -A TORRENT_EGRESS -d 127.0.0.11/32 -p tcp -m conntrack --ctorigdstport 53 -j ACCEPT
for network in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 \
  169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 \
  192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 \
  224.0.0.0/4 240.0.0.0/4; do
  iptables -w -A TORRENT_EGRESS -d "$network" -j REJECT
done
iptables -w -A TORRENT_EGRESS -j ACCEPT
iptables -w -C OUTPUT -j TORRENT_EGRESS 2>/dev/null || iptables -w -I OUTPUT 1 -j TORRENT_EGRESS
# IPv6 is disabled in engine settings; block it also at the network boundary.
ip6tables -w -P OUTPUT DROP
ip6tables -w -F OUTPUT
ip6tables -w -A OUTPUT -o lo -j ACCEPT
ip6tables -w -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Neither the engine, nginx nor their shell retains firewall or uid-changing powers.
exec setpriv --reuid=65532 --regid=65532 --clear-groups \
  --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs \
  /usr/local/bin/torrserver-entrypoint "$@"
