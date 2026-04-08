import type { WmpTab as WmpTabId } from '../WmpPage';

interface WmpTabProps {
  id: WmpTabId;
  label: string;
  activeTab: WmpTabId;
  onSelect: (id: WmpTabId) => void;
}

export function WmpTab({ id, label, activeTab, onSelect }: WmpTabProps) {
  const isActive = activeTab === id;
  return (
    <button
      className={`wmp-tab ${isActive ? 'wmp-tab--active' : ''}`}
      onClick={() => onSelect(id)}
    >
      {label}
    </button>
  );
}
