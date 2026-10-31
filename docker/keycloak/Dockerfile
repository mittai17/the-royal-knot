# Keycloak 26 pre-built for `start --optimized` with the royalknot realm baked in for --import-realm.
FROM quay.io/keycloak/keycloak:26.0 AS builder
ENV KC_DB=postgres KC_HEALTH_ENABLED=true KC_METRICS_ENABLED=false
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.0
COPY --from=builder /opt/keycloak/ /opt/keycloak/
COPY royalknot-realm.json /opt/keycloak/data/import/royalknot-realm.json
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--import-realm", "--optimized"]
