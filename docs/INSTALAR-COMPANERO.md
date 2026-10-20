# Pasar Sweet Flow a un compañero

Lista para que la app instalada le funcione a otra persona igual que a ti, con
sus propias cuentas.

## Antes de pasárselo (tú)

1. **Dropbox, permisos activados.** En <https://www.dropbox.com/developers/apps>,
   abre tu app y ve a la pestaña **Permissions**. Marca `account_info.read`,
   `files.metadata.read`, `files.metadata.write`, `files.content.read`,
   `files.content.write`, `sharing.read` y `sharing.write`, y pulsa **Submit**.
   Si ya estabas conectado, desconecta Dropbox en Ajustes › Almacenamiento y
   vuelve a conectarlo.
2. **Google Drive publicado.** En Google Cloud, en *Google Auth Platform ›
   Público*, el estado tiene que ser **En producción**, no *Pruebas*.
3. **Claves en `packages/app/.env.local`.** Deben estar `VITE_DROPBOX_APP_KEY`,
   `VITE_GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`. Se meten en la app al
   compilarla.
4. **Compilar en tu Mac:** `pnpm dist:mac`. Los instaladores de GitHub no llevan
   las claves.
5. **Probar tú primero.** Instala el `.dmg` en tu Mac y entra con tus cuentas.
6. **Compartir la carpeta del equipo** con su cuenta, desde Dropbox o Drive.

El instalador sale en
`apps/desktop/release/Sweetflow-<versión>-mac-universal.dmg`. Vale para Macs
con chip Apple y para Intel.

## Lo que hace tu compañero

1. Abre el `.dmg` y arrastra **Sweetflow** a *Aplicaciones*.
2. La primera vez, hace clic derecho sobre la app y pulsa **Abrir** y otra vez
   **Abrir**. Hace falta porque la app no está firmada por Apple.
3. Si macOS dice que la app «está dañada», ejecuta en Terminal:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/Sweetflow.app"
   ```

4. Pulsa **Conectarse** y entra con **su** cuenta de Magnific.
5. En **Ajustes › Almacenamiento** conecta **su** Google Drive o Dropbox y elige
   la carpeta del equipo que le has compartido.
   - Con Google sale «Google no ha verificado esta aplicación». Tiene que pulsar
     **Configuración avanzada › Ir a Sweetflow (no seguro)** y luego
     **Continuar**. Es normal.
   - El navegador mostrará «Listo. Ya puedes volver a Sweetflow»: vuelve a la
     app.

## Límites a tener en cuenta

- **Google:** como mucho 100 personas, mientras la app no esté verificada.
- **Dropbox:** a partir de 50 personas conectadas hay que pedir el paso a
  *Production* en su consola.
- **Actualizaciones:** cada vez que cambie la app hay que volver a compilar y
  pasarle el `.dmg` nuevo. En Mac no se actualiza sola mientras no esté firmada.
