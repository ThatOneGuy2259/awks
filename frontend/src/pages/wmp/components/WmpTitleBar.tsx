interface WmpTitleBarProps {
  onExit: () => void;
}

export function WmpTitleBar({ onExit }: WmpTitleBarProps) {
  return (
    <div className="wmp-title-bar">
      <div className="wmp-title-bar__left">
        <span className="wmp-title-bar__icon" />
        <span className="wmp-title-bar__text">Windows Media Player</span>
      </div>
      <div className="wmp-title-bar__controls">
        <button type="button" className="wmp-title-bar__btn wmp-title-bar__btn--min" aria-label="Minimize" onClick={(e) => e.preventDefault()}><span>_</span></button>
        <button type="button" className="wmp-title-bar__btn wmp-title-bar__btn--max" aria-label="Maximize" onClick={(e) => e.preventDefault()}><span>□</span></button>
        <button type="button" className="wmp-title-bar__btn wmp-title-bar__btn--close" aria-label="Close" onClick={onExit}><span>×</span></button>
      </div>
    </div>
  );
}
