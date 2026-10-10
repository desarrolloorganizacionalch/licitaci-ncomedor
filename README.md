# Ficha de Visita · NOGASA

Plataforma web móvil para digitalizar la **Ficha de Visita – Licitación Servicio de Alimentación** del Comité Evaluador NOGASA S.A.C. – Bienestar.

- **Ficha pública, sin contraseña**: el evaluador escribe su nombre, elige el postor y la fecha, y registra su ficha. Una ficha por nombre y postor.
- **Ficha paso a paso** para celular: los **6 criterios originales**, escala **Bueno (10) · Regular (5) · Malo (0)**, observación opcional por criterio y resumen.
- **Panel administrativo protegido** con correo y contraseña: solo los administradores autorizados ven los resultados.
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

Toda la autorización vive en la base de datos (Row Level Security), no solo en la interfaz:

| Acción | Evaluador (sin cuenta) | Administrador |
|---|---|---|
| Ver postores habilitados y criterios | ✓ | ✓ |
| Registrar una ficha (una por nombre y postor) | ✓ | ✓ |
| Ver fichas registradas | — | ✓ |
| Panel comparativo y exportación | — | ✓ |
| Autorizar administradores | — | ✓ |
| Crear, renombrar, inhabilitar postores | — | ✓ |
| Eliminar fichas (p. ej. para que alguien corrija la suya) | — | ✓ |

- Las fichas solo se escriben mediante la función `fv_submit_public_evaluation()` (security definer): exige nombre (3–120 caracteres), los 6 criterios, puntajes 0/5/10, fecha no futura (zona Lima), calcula el total e impide duplicados por nombre normalizado y postor.
- Los visitantes solo pueden leer postores habilitados y criterios; no pueden leer, modificar ni borrar fichas.
- Una cuenta de administrador solo está activa si su correo está **confirmado** y figura en `fv_allowed_users`.
- **Límite del voto sin contraseña:** cualquiera con el enlace puede registrar fichas y no se verifica la identidad del nombre escrito. El administrador revisa el “Avance del comité” y elimina las fichas que no correspondan.
- Un administrador no puede quitarse su propio rol ni desactivarse.
- Cabeceras de seguridad (`X-Frame-Options`, `nosniff`, etc.) y exportación CSV protegida contra inyección de fórmulas.

### Proyecto Supabase compartido

Todos los objetos llevan el prefijo **`fv_`** para poder convivir con otras apps en el mismo proyecto Supabase (plan gratuito). El trigger de registro solo crea perfiles para cuentas autorizadas o registradas desde esta app y nunca bloquea el registro de las demás aplicaciones. Ten en cuenta que **la autenticación (auth.users) es común a todo el proyecto**: una persona registrada aquí también existe para las otras apps del proyecto, con los permisos por defecto que estas den.

## Puesta en marcha

### 1. Base de datos

Aplica en orden `supabase/migrations/20261010000000_init.sql` y `20261010010000_voto_publico.sql` en el proyecto (SQL Editor o `supabase db push`). Crea tablas, políticas, funciones, los 6 criterios y los 4 postores iniciales (Almark, La Merced, Servicial Holding, Plus Aliments).

Autoriza al primer administrador (desde el SQL Editor):

```sql
insert into public.fv_allowed_users (email, full_name, role)
values ('correo@empresa.com', 'Nombre Apellido', 'admin');
```

Si esa persona ya tiene cuenta en el proyecto, queda habilitada al instante; si no, crea su cuenta en **Administración → Crear cuenta** con ese correo.

### 2. Configuración de Auth (panel de Supabase)

Solo afecta a los administradores: en **Authentication → URL Configuration → Redirect URLs** agrega la URL de la app, por ejemplo `https://<tu-app>.vercel.app/**`, para que los enlaces de confirmación y de recuperación de contraseña regresen a esta app.

### 3. Variables de entorno

Copia `.env.example` a `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
NEXT_PUBLIC_SITE_URL=https://<tu-app>.vercel.app
```

Solo se usa la clave pública (publishable/anon). No se necesita la service role key.

### 4. Desarrollo

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # pruebas del cálculo de puntajes
npm run typecheck
npm run build
```

### 5. Vercel

Importa el repositorio en Vercel (framework Next.js) y define las tres variables anteriores.

## Uso

1. Comparte el enlace de la app con el comité.
2. Cada evaluador escribe su nombre, elige el postor, completa la ficha y la registra. El avance queda guardado en el celular hasta enviarla. Para corregir una ficha enviada, el administrador la elimina y la persona la vuelve a llenar.
3. El administrador entra por **Administración**, revisa el **Panel comparativo**, el detalle de cada postor con sus observaciones y descarga el CSV.

## Estructura

```
app/
  page.tsx, VoteForm.tsx Ficha pública paso a paso (sin cuenta)
  actions.ts             Registro de la ficha
  login/                 Acceso de administradores
  auth/                  Callback de confirmación y cierre de sesión
  admin/                 Panel comparativo, detalle por postor, usuarios, postores, exportar
components/              Cabecera, lockup de marca, formularios
lib/                     Supabase, autorización, cálculo de puntajes (con pruebas)
supabase/migrations/     Esquema, RLS y datos iniciales
public/brand, fonts      Logotipos oficiales y RBNo3.1
```

## Identidad corporativa

- Logotipos oficiales (versiones blancas sobre rojo) en `public/brand/`, centralizados en `lib/brand.ts`.
- Colores como variables CSS en `app/globals.css`. El rojo `#FF0000` de la plantilla se usa en superficies de marca; para botones y texto se usa `#E00000`, que cumple contraste AA con texto blanco.
- Tipografía RBNo3.1 (Light, Book, Medium, Bold) servida como WOFF2. **Pendiente de confirmar**: el archivo de la fuente proviene de un sitio de fuentes gratuitas, sin licencia de embebido web explícita; valida con Marketing que su uso web está permitido. Si no, elimina `public/fonts/` y la app usará Bahnschrift/Arial.
