# Ficha de Visita · NOGASA

Plataforma web móvil para digitalizar la **Ficha de Visita – Licitación Servicio de Alimentación** del Comité Evaluador NOGASA S.A.C. – Bienestar.

- **Ficha pública, sin contraseña**: el evaluador escribe su nombre, elige el postor y la fecha, y registra su ficha. Una ficha por nombre y postor.
- **Ficha paso a paso** para celular: los **6 criterios originales**, escala **Bueno (10) · Regular (5) · Malo (0)**, observación opcional por criterio y resumen.
- **Panel administrativo sin contraseña, con enlace secreto**: solo quien tiene el enlace de administración ve los resultados.
- **Cálculo automático sobre 60 puntos**, hecho y validado en la base de datos (el navegador no puede alterar el total).
- **Panel administrativo**: ranking de postores, comparación por criterio, distribución de calificaciones, avance del comité, detalle con observaciones y exportación CSV (Excel).
- **Gestión** de usuarios (autorización por correo y roles) y de empresas postoras.
- Identidad co-branded **Nogasa | Vistony** de la presentación de referencia: rojo de marca, navy `#1A2B3C`, azul `#0957C3` y tipografía **RBNo3.1**.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend y servidor | Next.js 15 (App Router, Server Actions), React 19, TypeScript |
| Base de datos y auth | Supabase (Postgres + RLS + Auth) |
| Hosting | Vercel |

## Criterios evaluados

1. Sabor y sazón
2. Presentación, variedad y porción
3. Limpieza de cocina y comedor
4. Almacén, refrigeración y equipos
5. Personal: higiene y atención
6. Organización del servicio

Los textos de cada nivel (Bueno/Regular/Malo) se guardan en la tabla `fv_criteria` y provienen literalmente del formulario original.

## Seguridad y permisos

La app no usa cuentas. Toda la autorización vive en la base de datos:

| Acción | Evaluador (enlace público) | Administrador (enlace secreto) |
|---|---|---|
| Ver postores habilitados y criterios | ✓ | ✓ |
| Registrar una ficha (una por nombre y postor) | ✓ | ✓ |
| Ver fichas, panel comparativo y exportación CSV | — | ✓ |
| Crear, renombrar, inhabilitar postores | — | ✓ |
| Eliminar fichas (p. ej. pruebas o para que alguien corrija la suya) | — | ✓ |

- Las fichas solo se escriben mediante `fv_submit_public_evaluation()` (security definer): exige nombre (3–120 caracteres), los 6 criterios, puntajes 0/5/10, fecha no futura (zona Lima), calcula el total e impide duplicados por nombre normalizado y postor.
- Los visitantes solo pueden leer postores habilitados y criterios; no pueden leer, modificar ni borrar fichas.
- **Enlace secreto del panel**: `https://<app>/panel/<clave>`. La clave (32 caracteres aleatorios) solo se guarda como hash SHA-256 en `fv_settings`. Al abrir el enlace, la clave se guarda en una cookie `httpOnly` del navegador por 60 días; “Salir” la borra. Cada función del panel (`fv_admin_panel`, `fv_admin_delete_evaluation`, `fv_admin_save_supplier`) valida la clave en la base de datos.
- **Cambiar el enlace** (si se filtra): en el SQL Editor de Supabase,
  ```sql
  insert into public.fv_settings (key, value)
  values ('admin_key_sha256', encode(sha256(convert_to('NUEVA-CLAVE-DE-AL-MENOS-24-CARACTERES', 'UTF8')), 'hex'))
  on conflict (key) do update set value = excluded.value;
  ```
  El enlace nuevo será `https://<app>/panel/NUEVA-CLAVE-…` y el anterior deja de funcionar.
- **Límites conscientes:** cualquiera con el enlace público puede registrar fichas y no se verifica la identidad del nombre escrito; quien tenga el enlace secreto tiene acceso total al panel. Compártelos solo con quien corresponda.

### Proyecto Supabase compartido

Todos los objetos llevan el prefijo **`fv_`** para convivir con otras apps en el mismo proyecto Supabase (plan gratuito). Las tablas `fv_profiles` y `fv_allowed_users` y el trigger `fv_on_auth_user_created` vienen de una versión anterior con inicio de sesión y ya no se usan.

## Puesta en marcha

### 1. Base de datos

Aplica en orden los archivos de `supabase/migrations/`. Crean tablas, políticas, funciones, los 6 criterios y los 4 postores iniciales (Almark, La Merced, Servicial Holding, Plus Aliments). Luego crea la clave del panel con el SQL de la sección anterior.

### 2. Variables de entorno

Copia `.env.example` a `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

Solo se usa la clave pública (publishable/anon).

### 3. Desarrollo

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # pruebas del cálculo de puntajes
npm run typecheck
npm run build
```

### 4. Vercel

Importa el repositorio en Vercel (framework Next.js) y define las dos variables anteriores.

## Uso

1. Comparte el enlace de la app con el comité.
2. Cada evaluador escribe su nombre, elige el postor, completa la ficha y la registra. El avance queda guardado en el celular hasta enviarla. Para corregir una ficha enviada, el administrador la elimina y la persona la vuelve a llenar.
3. El administrador abre su **enlace secreto**, revisa el **Panel comparativo**, el detalle de cada postor con sus observaciones, elimina fichas de prueba y descarga el CSV.

## Estructura

```
app/
  page.tsx, VoteForm.tsx Ficha pública paso a paso (sin cuenta)
  actions.ts             Registro de la ficha
  panel/[key]/           Enlace secreto del panel (guarda la clave en cookie)
  sin-acceso/            Pantalla para quien entra al panel sin el enlace
  admin/                 Panel comparativo, detalle por postor, postores, exportar
components/              Cabecera, lockup de marca, formularios
lib/                     Supabase, acceso al panel, cálculo de puntajes (con pruebas)
supabase/migrations/     Esquema, RLS y datos iniciales
public/brand, fonts      Logotipos oficiales y RBNo3.1
```

## Identidad corporativa

- Logotipos oficiales (versiones blancas sobre rojo) en `public/brand/`, centralizados en `lib/brand.ts`.
- Colores como variables CSS en `app/globals.css`. El rojo `#FF0000` de la plantilla se usa en superficies de marca; para botones y texto se usa `#E00000`, que cumple contraste AA con texto blanco.
- Tipografía RBNo3.1 (Light, Book, Medium, Bold) servida como WOFF2. **Pendiente de confirmar**: el archivo de la fuente proviene de un sitio de fuentes gratuitas, sin licencia de embebido web explícita; valida con Marketing que su uso web está permitido. Si no, elimina `public/fonts/` y la app usará Bahnschrift/Arial.
