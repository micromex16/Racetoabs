"use client";
import { AgentPanel } from "@/components/agent/agent-panel";

export default function AgentPage() {
  return (
    <div className="glass -mx-1 overflow-hidden rounded-3xl lg:mx-auto lg:max-w-3xl">
      <AgentPanel fullscreen />
    </div>
  );
}
