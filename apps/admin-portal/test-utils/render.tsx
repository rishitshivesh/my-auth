import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/** Server-render to markup: enough to assert roles, aria wiring and absent literals. */
export function html(element: ReactElement): string {
  return renderToStaticMarkup(element);
}
