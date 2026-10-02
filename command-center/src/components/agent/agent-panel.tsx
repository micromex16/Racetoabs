"use client";
export function AgentPanel({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-full flex-col p-6 text-sm text-fg-2">
      <button onClick={onClose} className="self-end text-muted">Close</button>
      <p className="mt-10 text-center">The agent arrives in build step 4.</p>
    </div>
  );
}
