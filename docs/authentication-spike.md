# Prueba técnica de autenticación

## Objetivo

Validar la compatibilidad real de passkeys en el teléfono personal y la computadora Ubuntu antes de seleccionar una librería, persistencia de sesiones o mecanismo de recuperación.

La ruta temporal `/diagnostico/passkeys` comprueba en cada navegador:

- contexto seguro HTTPS o localhost;
- presencia de la API WebAuthn;
- disponibilidad declarada de un autenticador local con verificación de usuario;
- disponibilidad de mediación condicional.

No crea credenciales, cuentas ni sesiones. Tampoco consulta FHIR, persiste resultados o transmite información sobre el dispositivo.

## Interpretación

Un autenticador local disponible permite avanzar al ensayo completo. Si WebAuthn está disponible pero el autenticador local no lo está, todavía pueden funcionar:

- passkeys sincronizadas mediante el gestor de contraseñas del navegador;
- un gestor de contraseñas con soporte de passkeys;
- una llave de seguridad FIDO2 USB;
- el teléfono como autenticador cercano cuando ambos dispositivos tienen Bluetooth.

La API del navegador no puede confirmar por sí sola que una passkey se sincronizará entre Ubuntu y el teléfono.

## Segunda capa pendiente

Después de probar la ruta en ambos dispositivos:

1. elegir el proveedor o librería WebAuthn;
2. crear una cuenta profesional provisionada sin registro público;
3. registrar y verificar criptográficamente una passkey en el servidor;
4. comprobar el acceso desde ambos dispositivos;
5. persistir una sesión independiente por dispositivo;
6. probar expiración, cierre de sesión y revocación;
7. definir una recuperación que no dependa de un único teléfono.

La autenticación completa debe proteger páginas, endpoints y casos de uso antes de renderizar información clínica.
