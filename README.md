# Backoffice — Patoapp

Herramienta web local para que los desarrolladores puedan gestionar beneficios y ubicaciones de merchants directamente sobre Supabase.

## Levantar localmente

```bash
# Desde la raíz del repo
cd backoffice
npm install

# Copiar variables de entorno (solo la primera vez)
cp .env.example .env
# Editar .env con los valores del .env.local del repo raíz:
#   VITE_SUPABASE_URL  →  EXPO_PUBLIC_SUPABASE_URL
#   VITE_SUPABASE_ANON_KEY  →  EXPO_PUBLIC_SUPABASE_ANON_KEY
#   VITE_LOCATION_PIPELINE_SECRET  →  LOCATION_PIPELINE_SECRET

npm run dev
# Abre http://localhost:5173
```

Loguearse con el email de desarrollador (el acceso de escritura está protegido por RLS en Supabase).

## Funcionalidades

- **Beneficios**: buscar, editar, crear manualmente y eliminar beneficios
- **Ubicaciones**: editar dirección, nombre de local y coordenadas (con mapa arrastrable) de los merchants
- **Pipeline**: publicar beneficios pendientes, regenerar descripciones IA y actualizar ubicaciones scrapeadas

## Acceso autorizado

Solo los siguientes emails tienen permisos de escritura (definido en la función `is_developer_email()` de Supabase):

- c.mansillabrito@gmail.com
- nicolas.canalespm@gmail.com
- cristobal.a.garridov@gmail.com

Para agregar un nuevo desarrollador: actualizar el array en la función SQL y en la migración `supabase/migrations/20260519000001_backoffice_rls.sql`.
