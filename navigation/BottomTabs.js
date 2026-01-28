import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

// Screens
import GoalsScreen from "../screens/GoalsScreen";
import HabitsScreen from "../screens/HabitsScreen";
import HomeScreen from "../screens/HomeScreen";
import NotesScreen from "../screens/NotesScreen";
import PlannerScreen from "../screens/PlannerScreen";

const Tab = createBottomTabNavigator();

const CustomTabBar = ({ state, descriptors, navigation }) => {
  return (
    <View style={styles.tabBar}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        let icon;
        if (route.name === "Home") {
          icon = isFocused ? "home" : "home-outline";
        } else if (route.name === "Planner") {
          icon = isFocused ? "calendar" : "calendar-outline";
        } else if (route.name === "Goals") {
          icon = isFocused ? "trophy" : "trophy-outline";
        } else if (route.name === "Habits") {
          icon = isFocused ? "repeat" : "repeat-outline";
        } else if (route.name === "Notes") {
          icon = isFocused ? "document-text" : "document-text-outline";
        }

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={index}
            onPress={onPress}
            style={[styles.tabButton, isFocused && styles.activeTab]}
          >
            <Ionicons
              name={icon}
              size={22}
              color={isFocused ? "#fff" : "#555"}
            />
            <Text style={[styles.tabLabel, { color: isFocused ? "#fff" : "#555" }]}>
              {route.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default function BottomTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Planner" component={PlannerScreen} />
      <Tab.Screen name="Goals" component={GoalsScreen} />
      <Tab.Screen name="Habits" component={HabitsScreen} />
      <Tab.Screen name="Notes" component={NotesScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#fff",
    paddingVertical: 8, // Reduced from 12
    borderRadius: 25, // Reduced from 30
    marginHorizontal: 20,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 6,
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
  },
  tabButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 55, // Reduced from 65
    height: 55, // Reduced from 65
    borderRadius: 30, // Reduced from 35
    backgroundColor: "#f2f2f2",
  },
  activeTab: {
    backgroundColor: "#5564BE",
    transform: [{ scale: 1.1 }],
    shadowColor: "#5564BE",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  tabLabel: {
    fontSize: 10, // Reduced from 11
    marginTop: 4,
    fontWeight: "600",
  },
});
