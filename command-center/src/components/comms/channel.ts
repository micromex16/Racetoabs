import { Mail, Hash, MessageCircle } from "lucide-react";
export const CH = {
  EMAIL: { icon: Mail, label: "Email" },
  SLACK: { icon: Hash, label: "Slack" },
  WHATSAPP: { icon: MessageCircle, label: "WhatsApp" },
} as const;
export type ChannelKey = keyof typeof CH;
