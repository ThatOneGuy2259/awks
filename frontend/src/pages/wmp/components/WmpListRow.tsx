import type { ReactNode } from 'react';

interface WmpListRowProps {
  cells: ReactNode[];
  selected?: boolean;
  playing?: boolean;
  onClick?: () => void;
  isHeader?: boolean;
}

export function WmpListRow({ cells, selected, playing, onClick, isHeader }: WmpListRowProps) {
  return (
    <div
      className={`wmp-list-row ${selected ? 'wmp-list-row--selected' : ''} ${playing ? 'wmp-list-row--playing' : ''} ${isHeader ? 'wmp-list-row--header' : ''}`}
      onClick={onClick}
    >
      {cells.map((cell, i) => (
        <div key={i} className="wmp-list-row__cell">
          {cell}
        </div>
      ))}
    </div>
  );
}
