import FontAwesome from '@expo/vector-icons/FontAwesome';
import { usePathname, useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ListingMode } from '@/src/domain/types';
import { useAuthStore } from '@/src/state/authStore';
import { useSessionStore } from '@/src/state/sessionStore';

type NavItem = {
  key: string;
  icon: ComponentProps<typeof FontAwesome>['name'];
  onPress: () => void;
  active: boolean;
};

export function BottomIconBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const reset = useSessionStore((s) => s.reset);
  const authSignOut = useAuthStore((s) => s.signOut);
  const mode = useSessionStore((s) => s.mode);

  const openItemMode = (mode: Exclude<ListingMode, 'auto'>) => {
    reset();
    router.push({ pathname: '/item/capture', params: { mode } });
  };

  const items: NavItem[] = [
    {
      key: 'auto',
      icon: 'car',
      onPress: () => {
        reset();
        router.push('/vehicle/vin');
      },
      active: pathname.startsWith('/vehicle'),
    },
    {
      key: 'electronics',
      icon: 'mobile',
      onPress: () => openItemMode('electronics'),
      active: pathname.includes('/item') && mode === 'electronics',
    },
    {
      key: 'general',
      icon: 'archive',
      onPress: () => openItemMode('general'),
      active: pathname.includes('/item') && mode === 'general',
    },
    {
      key: 'profile',
      icon: 'user',
      onPress: () => router.push('/profile'),
      active: pathname === '/profile',
    },
    {
      key: 'signout',
      icon: 'sign-out',
      onPress: async () => {
        await authSignOut().catch(() => undefined);
        reset();
        router.replace('/');
      },
      active: false,
    },
  ];

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        {items.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            onPress={item.onPress}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <FontAwesome
              name={item.icon}
              size={21}
              color={item.active ? '#0B84FF' : 'rgba(255,255,255,0.78)'}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
  bar: {
    backgroundColor: 'rgba(10,12,16,0.95)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 10,
    paddingHorizontal: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconBtn: {
    width: 48,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75 },
});
