export default function Offline() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">You&apos;re offline</h1>
        <p className="mt-2 text-sm text-fg-2">Recently viewed screens are still readable. Captures queue and sync when you reconnect.</p>
      </div>
    </div>
  );
}
