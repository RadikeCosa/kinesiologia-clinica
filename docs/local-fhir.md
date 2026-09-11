# HAPI FHIR local

## Configuración canónica

La infraestructura local se administra fuera de esta aplicación:

```text
/home/ramiro/dev/fhir/hapi-local
```

No se duplican archivos Compose ni credenciales dentro de `kinesiologia-clinica`.

## Entornos

| Uso | Proyecto Compose | Archivo | Puerto | Volumen |
|---|---|---|---|---|
| Desarrollo y pruebas | `hapi-dev` | `docker-compose.fhir.dev.yml` | `8081` | `hapi-postgres-dev-data` |
| Real local | `hapi-prod` | `docker-compose.fhir.prod.yml` | `8080` | `hapi-postgres-prod-data` |

Ambos entornos usan HAPI FHIR `v8.8.0-1` y PostgreSQL 16, pero tienen contenedores, variables, bases y volúmenes diferentes.

El archivo genérico `docker-compose.yml` no se utiliza: apunta a `8080`, contiene configuración histórica y usa una imagen HAPI no fijada.

## Iniciar desarrollo

Desde `/home/ramiro/dev/fhir/hapi-local`:

```bash
docker compose -p hapi-dev -f docker-compose.fhir.dev.yml up -d
curl http://localhost:8081/fhir/metadata
```

La respuesta esperada es un `CapabilityStatement` activo con FHIR `4.0.1`.

Para detenerlo sin borrar su volumen:

```bash
docker compose -p hapi-dev -f docker-compose.fhir.dev.yml down
```

## Conectar la aplicación

```bash
# Predeterminado seguro: 8081
npm run dev

# Selección explícita del entorno real local: 8080
npm run dev:fhir-real
```

La aplicación usa un solo `FHIR_BASE_URL` server-side por ejecución. El navegador nunca recibe esa dirección.

## Guardas obligatorias

- seeds, fixtures y pruebas de integración solo pueden escribir en `8081`;
- ningún comando automático debe elegir `8080` como fallback;
- no ejecutar `down -v` sobre `hapi-prod`;
- no leer ni imprimir archivos `.env.fhir.prod*`;
- no crear screenshots, demos o exports desde `8080`;
- validar primero toda compatibilidad contra datos ficticios en `8081`.
