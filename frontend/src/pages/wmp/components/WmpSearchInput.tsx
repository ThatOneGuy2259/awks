import { useRef, useEffect } from 'react';
import type { WmpTab } from '../WmpPage';

interface WmpSearchInputProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  activeTab: WmpTab;
  onTabChange: (tab: WmpTab) => void;
}

export function WmpSearchInput({ query, onQueryChange, onSubmit, onClear, activeTab, onTabChange }: WmpSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = () => {
    if (activeTab !== 'library') {
      onTabChange('library');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  useEffect(() => {
    if (activeTab === 'library' && document.activeElement === inputRef.current) {
      inputRef.current?.focus();
    }
  }, [activeTab]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClear();
      inputRef.current?.blur();
    }
  };

  return (
    <div className="wmp-search">
      <input
        ref={inputRef}
        type="text"
        className="wmp-search__input"
        placeholder="Search and press Enter..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
