import { useListenerStore } from '../../stores/listenerStore';

export function OnlineListeners() {
  const { count, listeners } = useListenerStore();
  const displayed = listeners.slice(0, 8);
  const overflow = count - displayed.length;

  return (
    <section className="bg-surface-container-low rounded-lg p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg font-headline">Online Listeners</h3>
        <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-black">
          {count} ACTIVE
        </span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 xl:grid-cols-4 gap-4">
        {displayed.map((listener, i) => (
          <div key={listener.id} className="relative group cursor-pointer">
            <div
              className={`w-full aspect-square rounded-full border-2 p-0.5 ${
                i === 0 ? 'border-secondary' : 'border-transparent hover:border-primary'
              } transition-colors`}
            >
              {listener.avatar_url ? (
                <img className="w-full h-full object-cover rounded-full" src={listener.avatar_url} alt={listener.username} />
              ) : (
                <div className="w-full h-full rounded-full bg-surface-container-high flex items-center justify-center text-xs font-bold text-primary">
                  {listener.username.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            {i === 0 && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-secondary rounded-full border-2 border-surface-container-low" />
            )}
          </div>
        ))}
        {overflow > 0 && (
          <div className="relative flex items-center justify-center w-full aspect-square rounded-full bg-surface-container-high text-on-surface-variant text-xs font-bold hover:bg-surface-variant cursor-pointer transition-colors">
            +{overflow}
          </div>
        )}
      </div>
    </section>
  );
}
