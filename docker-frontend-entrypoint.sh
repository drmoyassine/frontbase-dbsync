#!/bin/sh
# Frontend (nginx) container entrypoint.
#
# Standard single-host deploys: nginx.conf is baked into the image with literal
# upstream hostnames (backend:8000 / edge:3002). Nothing is mounted, so this
# script is a pass-through to nginx.
#
# Distributed multi-machine deploys: docker-compose.static-tier.yml mounts a
# templated config to /etc/nginx/conf.d/default.conf.template whose upstreams
# are ${BACKEND_HOST}:${BACKEND_PORT} / ${EDGE_HOST}:${EDGE_PORT}. We expand ONLY
# those four variables — passing the explicit list to envsubst so nginx's own
# $host / $remote_addr / $scheme etc. are left intact.
set -e

TPL=/etc/nginx/conf.d/default.conf.template
if [ -f "$TPL" ]; then
  envsubst '${BACKEND_HOST} ${BACKEND_PORT} ${EDGE_HOST} ${EDGE_PORT}' \
    < "$TPL" > /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
