import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import SupplierApp from './App';
import { ConsumerPayments } from './src/consumer/ConsumerPayments';

/** Keep the original supplier app mounted, preserving its working payment state. */
export default function ConsumerApp() {
  const [consumer, setConsumer] = useState(false);
  return <SafeAreaView style={styles.root}>
    <View style={styles.nav}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: !consumer }} onPress={() => setConsumer(false)} style={styles.button}><Text style={styles.label}>Supplier payments</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: consumer }} onPress={() => setConsumer(true)} style={styles.button}><Text style={styles.label}>Earnings · Rewards · Gifts</Text></Pressable>
    </View>
    <View style={consumer ? styles.hidden : styles.pane}><SupplierApp /></View>
    <View style={consumer ? styles.pane : styles.hidden}>
      <ScrollView contentContainerStyle={styles.content}><ConsumerPayments /></ScrollView>
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f8fa' },
  nav: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, borderBottomWidth: 1, borderColor: '#e4e8ee' },
  button: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: '#edf4f0' },
  label: { fontWeight: '700', color: '#183127' },
  pane: { flex: 1 }, hidden: { display: 'none' },
  content: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 20, paddingBottom: 60 },
});
