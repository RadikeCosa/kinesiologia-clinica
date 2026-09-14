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

## Resultado y segunda capa

El diagnóstico de compatibilidad funcionó en Chrome de Ubuntu y Android según la prueba del profesional en la sesión anterior. Se eligieron `@simplewebauthn/server` y `@simplewebauthn/browser`; el servidor registra y verifica credenciales, conserva sesiones por navegador en SQLite y permite revocación y recuperación con códigos de un solo uso. La recuperación reemplaza las passkeys y los códigos anteriores y revoca todas las sesiones.

Queda validar con credenciales reales en ambos dispositivos:

1. registrar la primera passkey y guardar los códigos de recuperación;
2. ingresar desde teléfono y computadora, con sesiones independientes;
3. revocar una sesión y una passkey, y comprobar que el acceso deja de funcionar;
4. recuperar el acceso y comprobar que las passkeys y sesiones anteriores ya no sirven;
5. comprobar la expiración y el acceso HTTPS privado provisto por Casa.

La autenticación completa debe proteger páginas, endpoints y casos de uso antes de renderizar información clínica.
