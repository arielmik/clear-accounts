import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { useImageUrl } from '../lib/images';
import { radius, space, useTheme } from './theme';

/** Foto del ticket: ya guardada (path en Storage) o recién elegida (uri local). */
export type ReceiptSource = { path: string } | { uri: string };

function useReceiptUri(source: ReceiptSource): string | undefined {
  const url = useImageUrl('path' in source ? source.path : null);
  return 'uri' in source ? source.uri : (url.data ?? undefined);
}

/** Miniatura del ticket; al tocarla se abre a pantalla completa. */
export function ReceiptThumb({ source, size = 64, style }: { source: ReceiptSource; size?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const uri = useReceiptUri(source);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={t.expense.receiptOpen}
        onPress={() => setOpen(true)}
        style={[{ width: size, height: size * 1.25, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: theme.chip }, style]}
      >
        {uri ? <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" transition={150} /> : null}
      </Pressable>
      <ReceiptViewer uri={uri} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Ticket a pantalla completa, sobre fondo negro. */
export function ReceiptViewer({ uri, visible, onClose }: { uri: string | undefined; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {uri ? <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.common.close}
          onPress={onClose}
          hitSlop={12}
          style={{
            position: 'absolute',
            top: insets.top + space.sm,
            right: space.lg,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
        <Text style={{ position: 'absolute', bottom: insets.bottom + space.lg, alignSelf: 'center', color: '#fff', opacity: 0.7 }}>
          {t.expense.receipt}
        </Text>
      </View>
    </Modal>
  );
}
