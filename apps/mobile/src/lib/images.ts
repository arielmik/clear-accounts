import { useQuery } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { base64ToArrayBuffer } from './base64';
import { supabase } from './supabase';

const BUCKET = 'images';
const SIZE = 512;
const URL_TTL_SECONDS = 60 * 60;

/** Ruta única dentro del bucket: groups/<id>/<archivo>.jpg o users/<id>/<archivo>.jpg */
export function newImagePath(kind: 'groups' | 'users', ownerId: string): string {
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${kind}/${ownerId}/${name}.jpg`;
}

/** Abre la galería con recorte cuadrado. Devuelve null si el usuario cancela. */
export async function pickSquareImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}

/** Recorta al centro, achica a 512×512 y comprime a JPEG. */
async function prepareImage(uri: string): Promise<ArrayBuffer> {
  const loaded = await ImageManipulator.manipulate(uri).renderAsync();
  const side = Math.min(loaded.width, loaded.height);
  const context = ImageManipulator.manipulate(uri);
  if (loaded.width !== loaded.height) {
    context.crop({ originX: (loaded.width - side) / 2, originY: (loaded.height - side) / 2, width: side, height: side });
  }
  const image = await context.resize({ width: SIZE, height: SIZE }).renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error('No se pudo procesar la imagen');
  return base64ToArrayBuffer(saved.base64);
}

/**
 * Flujo completo: elegir → procesar → subir → asignar → borrar la anterior.
 * Devuelve false si el usuario canceló.
 */
export async function replaceImage(opts: {
  kind: 'groups' | 'users';
  ownerId: string;
  currentPath: string | null;
  assign: (path: string) => Promise<void>;
}): Promise<boolean> {
  const uri = await pickSquareImage();
  if (!uri) return false;
  const data = await prepareImage(uri);
  const path = newImagePath(opts.kind, opts.ownerId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, data, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  await opts.assign(path);
  if (opts.currentPath) await removeStoredImage(opts.currentPath);
  return true;
}

/** Borra el archivo; si falla no interrumpe (queda huérfano, no visible). */
export async function removeStoredImage(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
}

/** URL firmada (el bucket es privado), cacheada casi hasta que vence. */
export function useImageUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['image-url', path],
    enabled: !!path,
    staleTime: (URL_TTL_SECONDS - 5 * 60) * 1000,
    gcTime: URL_TTL_SECONDS * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, URL_TTL_SECONDS);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
  });
}
