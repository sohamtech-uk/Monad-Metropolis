import { useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import SupplierApp from "./App";
import { AuroraIntentsCard } from "./src/aurora/AuroraIntentsCard";
import { ConsumerPayments } from "./src/consumer/ConsumerPayments";
import { EnvioLiveScreen } from "./src/envio/LiveHyperSyncCard";

type Surface = "supplier" | "aurora" | "consumer" | "envio";

/** Keep the original supplier app mounted, preserving its working payment state. */
export default function ConsumerApp() {
  const [surface, setSurface] = useState<Surface>("supplier");

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.nav}>
        <Tab
          active={surface === "supplier"}
          label="Supplier payments"
          onPress={() => setSurface("supplier")}
        />
        <Tab
          active={surface === "aurora"}
          label="Pay from any chain"
          onPress={() => setSurface("aurora")}
        />
        <Tab
          active={surface === "consumer"}
          label="Earnings · Rewards · Gifts"
          onPress={() => setSurface("consumer")}
        />
        <Tab
          active={surface === "envio"}
          label="Envio Live"
          onPress={() => setSurface("envio")}
        />
      </View>

      <View style={surface === "supplier" ? styles.pane : styles.hidden}>
        <SupplierApp active={surface === "supplier"} />
      </View>

      <View style={surface === "aurora" ? styles.pane : styles.hidden}>
        <ScrollView contentContainerStyle={styles.content}>
          <AuroraIntentsCard />
        </ScrollView>
      </View>

      <View style={surface === "consumer" ? styles.pane : styles.hidden}>
        <ScrollView contentContainerStyle={styles.content}>
          <ConsumerPayments />
        </ScrollView>
      </View>

      <View style={surface === "envio" ? styles.pane : styles.hidden}>
        <EnvioLiveScreen active={surface === "envio"} />
      </View>
    </SafeAreaView>
  );
}

function Tab({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.button, active && styles.buttonActive]}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f7f8fa" },
  nav: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#e4e8ee",
  },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#edf4f0",
  },
  buttonActive: { backgroundColor: "#183127" },
  label: { fontWeight: "700", color: "#183127" },
  labelActive: { color: "#fff" },
  pane: { flex: 1 },
  hidden: { display: "none" },
  content: {
    width: "100%",
    maxWidth: 1100,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 60,
  },
});
