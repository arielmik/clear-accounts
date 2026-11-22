import { useMemo } from 'react';
import { View } from 'react-native';
import { darkRuns, qrMatrix } from '../lib/qr';

/**
 * Código QR dibujado con vistas (sin librerías nativas: llega por actualización OTA).
 * Siempre negro sobre blanco, con margen ("quiet zone") de 4 módulos, para que
 * cualquier cámara lo lea aunque la app esté en modo oscuro.
 */
export function QrCode({ value, size = 240 }: { value: string; size?: number }) {
  const matrix = useMemo(() => qrMatrix(value), [value]);
  const quiet = 4;
  const cell = size / (matrix.length + quiet * 2);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Código QR: ${value}`}
      testID="invite-qr"
      style={{ width: size, height: size, backgroundColor: '#FFFFFF', padding: cell * quiet }}
    >
      {matrix.map((row, r) => (
        <View key={r} style={{ height: cell, flexDirection: 'row' }}>
          {darkRuns(row).map((run) => (
            <View
              key={run.start}
              style={{ position: 'absolute', left: run.start * cell, width: run.length * cell + 0.5, height: cell + 0.5, backgroundColor: '#000000' }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
