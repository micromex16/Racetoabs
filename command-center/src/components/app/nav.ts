import { Sun, Target, Gauge, Kanban, MessagesSquare, Users, CalendarCheck, ParkingSquare, Settings, Sparkles, Factory, Briefcase } from "lucide-react";

export const NAV = [
  { href: "/", label: "Today", icon: Sun, key: "t" },
  { href: "/build", label: "Plant", icon: Factory, key: "b" },
  { href: "/venture", label: "Company", icon: Briefcase, key: "v" },
  { href: "/goals", label: "Goals", icon: Target, key: "g" },
  { href: "/scoreboard", label: "Scoreboard", icon: Gauge, key: "s" },
  { href: "/pipeline", label: "Pipeline", icon: Kanban, key: "p" },
  { href: "/comms", label: "Comms", icon: MessagesSquare, key: "c" },
  { href: "/accountability", label: "Accountability", icon: Users, key: "a" },
  { href: "/review", label: "Weekly Review", icon: CalendarCheck, key: "r" },
  { href: "/parking", label: "Parking Lot", icon: ParkingSquare, key: "l" },
  { href: "/settings", label: "Settings", icon: Settings, key: "," },
] as const;

export const MOBILE_TABS = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/comms", label: "Comms", icon: MessagesSquare },
  { href: "/agent", label: "Agent", icon: Sparkles },
] as const;
