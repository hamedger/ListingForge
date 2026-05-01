import { SafeAreaView, StyleSheet, View, type ViewProps } from 'react-native';

import { BottomIconBar } from '@/src/ui/components/BottomIconBar';

type ScreenProps = ViewProps & {
  showBottomBar?: boolean;
};

export function Screen({ style, children, showBottomBar = true, ...rest }: ScreenProps) {
  return (
    <SafeAreaView style={[styles.root, style]} {...rest}>
      <View style={[styles.content, showBottomBar && styles.contentWithBottomBar]}>{children}</View>
      {showBottomBar ? <BottomIconBar /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050608' },
  content: { flex: 1 },
  contentWithBottomBar: { paddingBottom: 92 },
});
