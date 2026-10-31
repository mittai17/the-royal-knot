#!/usr/bin/env bash
# Run on the air-gapped host: loads the tarball produced by offline-save.sh.
# Dokploy's own images (dokploy/dokploy, postgres:16, traefik) need the same treatment — see DEPLOYMENT.md.
set -euo pipefail
gunzip -c "${1:-royalknot-images.tar.gz}" | docker load
