import { Stack } from 'expo-router';

export default function ItemLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#050608' },
        headerTintColor: '#fff',
        contentStyle: { backgroundColor: '#050608' },
      }}>
      <Stack.Screen
        name="capture"
        options={{
          title: 'Photos & notes',
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}
