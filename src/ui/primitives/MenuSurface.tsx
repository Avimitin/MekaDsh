/** Shared menu material: the translucent, blurred fill every menu surface paints. */
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import clsx from 'clsx';
import css from './MenuSurface.module.css';

/** Menu containers preserve native div props and refs. */
export interface MenuSurfaceProps extends ComponentPropsWithoutRef<'div'> {
  /** Match the shared compact menu's smaller outer radius. */
  compact?: boolean;
}

/**
 * Paint a menu surface: the token-filled, backdrop-blurred material behind the content.
 * @param props - Div content and placement, and compact geometry.
 * @param ref - The visible menu div.
 * @returns Menu content on the shared material.
 */
export const MenuSurface = forwardRef<HTMLDivElement, MenuSurfaceProps>(function MenuSurface({
  compact = false,
  className,
  children,
  ...props
}, ref) {
  return (
    <div
      {...props}
      ref={ref}
      data-menu-material="translucent"
      className={clsx(css.surface, compact && css.compact, className)}
    >
      <div aria-hidden="true" className={css.material} />
      {children}
    </div>
  );
});
