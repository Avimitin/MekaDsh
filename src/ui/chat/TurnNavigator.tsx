import { memo } from 'react';
import { IconChevronDownOutlineRegular, IconChevronUpOutlineRegular } from '../icons/index';
import css from './TurnNavigator.module.css';

/**
 * The floating turn-navigation pill: jump to the previous or next turn with a
 * "current/total" caption between the chevrons. The element only draws the
 * pill; the caller positions it (absolute inside the chat container) above
 * the composer area.
 * @param props.current - 1-based index of the turn in view.
 * @param props.total - known turn count.
 * @param props.onJump - navigate to a 1-based turn index.
 */
export const TurnNavigator = memo(function TurnNavigator({
  current,
  total,
  onJump,
}: {
  current: number;
  total: number;
  onJump: (index: number) => void;
}) {
  if (total < 2) return null;
  const clamped = Math.min(Math.max(1, current), total);
  return (
    <nav className={css.pill} aria-label="Turn navigation">
      <button
        type="button"
        className={css.jump}
        aria-label="Previous turn"
        title="Previous turn"
        disabled={clamped <= 1}
        onClick={() => onJump(clamped - 1)}
      >
        <IconChevronUpOutlineRegular size={14} />
      </button>
      <span className={css.count} aria-current="true">
        {clamped}/{total}
      </span>
      <button
        type="button"
        className={css.jump}
        aria-label="Next turn"
        title="Next turn"
        disabled={clamped >= total}
        onClick={() => onJump(clamped + 1)}
      >
        <IconChevronDownOutlineRegular size={14} />
      </button>
    </nav>
  );
});
