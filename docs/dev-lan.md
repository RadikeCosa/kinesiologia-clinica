# Acceso de desarrollo desde Android en la red local

El comando `npm run dev:lan` expone el servidor de desarrollo por HTTPS en `https://dev-pc.local:3000`, mantiene el HAPI descartable de `8081` y configura `AUTH_ORIGIN` para ese origen. Usa una base de passkeys separada (`.local/auth-lan.sqlite`) para que las credenciales de `localhost` no interfieran con las de este sitio. El comando habitual `npm run dev` y su origen `http://localhost:3000` no cambian.

## Preparación única en Ubuntu

1. Confirmá el hostname anunciado por la computadora y que Avahi esté activo:

   ```bash
   hostnamectl --static
   systemctl is-active avahi-daemon
   getent hosts dev-pc.local
   ```

   El hostname esperado es `dev-pc`. Si Avahi no está activo o `dev-pc.local` no resuelve en Ubuntu, corregí mDNS antes de continuar. En Android, comprobá también que Chrome pueda resolver el nombre; algunas redes o dispositivos no resuelven nombres `.local`.

2. Instalá `mkcert` desde una fuente confiable si aún no está disponible, y generá un certificado con el nombre exacto como SAN:

   ```bash
   mkdir -p .local
   mkcert -install
   mkcert -cert-file .local/dev-pc.local.pem \
     -key-file .local/dev-pc.local-key.pem dev-pc.local
   ```

   Los archivos viven bajo `.local/`, que está excluido de Git. No compartas ni copies la clave privada `dev-pc.local-key.pem`.

3. Instalá la CA raíz en Android. Obtené la ruta con `mkcert -CAROOT`, transferí `rootCA.pem` al teléfono e instalalo desde **Ajustes → Seguridad → Credenciales → Instalar un certificado → Certificado de CA** (los nombres pueden variar según Android). No transfieras `rootCA-key.pem`. Luego abrí `https://dev-pc.local:3000` en Chrome y confirmá que no aparece advertencia de certificado antes de probar passkeys.

   Chrome suele confiar en CA instaladas por el usuario. Una política MDM o una configuración estricta del dispositivo puede impedirlo; si ocurre, no continúes con el flujo de passkeys hasta resolver la confianza TLS.

4. Revisá el firewall y la red antes de arrancar la app:

   ```bash
   sudo ufw status verbose
   systemctl is-active firewalld
   systemctl is-active nftables
   sudo nft list ruleset
   sudo iptables -L -n -v
   ```

   Si UFW o firewalld está activo y bloquea la conexión, permití TCP/3000 solo desde el CIDR de la LAN; por ejemplo, con UFW: `sudo ufw allow from <CIDR-LAN> to any port 3000 proto tcp`. Para nftables/iptables, revisá la política vigente y agregá una regla equivalente que limite origen a la LAN. Si no hay firewall activo ni reglas de bloqueo, no hace falta abrir un puerto. Verificá además que el router no tenga aislamiento de clientes/AP habilitado.

## Iniciar y registrar la passkey

Arrancá el servidor:

```bash
npm run dev:lan
```

En Android y Chrome, abrí `https://dev-pc.local:3000/ingresar`. Registrá la primera passkey de la base LAN usando el código inicial de `.env.local`; una passkey creada para `localhost` no sirve aquí. El RP ID es `dev-pc.local`: la configuración lo deriva de `URL.hostname`, por lo que no incluye el puerto `3000`. Guardá los códigos de recuperación fuera del teléfono.

Si `/ingresar` o los recursos de desarrollo devuelven un error 400, comprobá que Next esté permitiendo el hostname `dev-pc.local` mediante `allowedDevOrigins` en `next.config.ts`. Si el teléfono no conecta, revisá en este orden: resolución de `dev-pc.local`, firewall, aislamiento de clientes y certificado TLS.

El flujo clínico permanece limitado al HAPI descartable local y sus datos ficticios. No uses `npm run dev:fhir-real` durante esta revisión.
