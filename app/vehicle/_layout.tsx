import { Stack } from 'expo-router';

export default function VehicleLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#050608' },
        headerTintColor: '#fff',
        contentStyle: { backgroundColor: '#050608' },
      }}>
      <Stack.Screen name="vin" options={{ title: 'VIN' }} />
      <Stack.Screen name="confirm" options={{ title: 'Confirm vehicle' }} />
      <Stack.Screen name="capture" options={{ headerShown: false }} />
      <Stack.Screen name="condition" options={{ title: 'Condition' }} />
    </Stack>
  );
}
