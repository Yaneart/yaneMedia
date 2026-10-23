FROM debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587

ARG TORRSERVER_URL
ARG TORRSERVER_SHA256

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl jq nginx-light \
    && curl --fail --location --silent --show-error \
        --output /usr/local/bin/torrserver "$TORRSERVER_URL" \
    && echo "$TORRSERVER_SHA256  /usr/local/bin/torrserver" | sha256sum --check --strict - \
    && chmod 0555 /usr/local/bin/torrserver \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /config /cache /tmp/torrserver /opt/torrserver \
    && chmod 0555 /opt/torrserver \
    && chown -R 65532:65532 /config /cache /tmp/torrserver

RUN apt-get update \
    && apt-get install -y --no-install-recommends iptables util-linux \
    && rm -rf /var/lib/apt/lists/*

COPY --chmod=0555 entrypoint.sh /usr/local/bin/torrserver-entrypoint
COPY --chmod=0555 firewall.sh /usr/local/bin/torrserver-firewall
COPY --chmod=0444 settings.json /opt/torrserver/settings.json
COPY --chmod=0444 nginx.conf /etc/nginx/nginx.conf

USER 0:0
ENTRYPOINT ["/usr/local/bin/torrserver-firewall"]
