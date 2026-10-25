import { describe, expect, it } from '@jest/globals';
import { html } from '@/test-utils/render';
import { PageState } from './PageState';

const labels = { loading: 'L', deniedTitle: 'D', deniedBody: 'DB', errorTitle: 'E', errorBody: 'EB', unavailableTitle: 'U', unavailableBody: 'UB', retry: 'R' };

describe('PageState', () => {
  it('renders each state with the right role', () => {
    expect(html(<PageState status="loading" labels={labels} onRetry={() => undefined} />)).toContain('aria-busy="true"');
    expect(html(<PageState status="denied" labels={labels} onRetry={() => undefined} />)).toContain('role="status"');
    const err = html(<PageState status="error" labels={labels} onRetry={() => undefined} />);
    expect(err).toContain('role="alert"');
    expect(err).toContain('R');
  });
});
