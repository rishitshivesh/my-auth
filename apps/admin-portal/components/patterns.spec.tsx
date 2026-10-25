import { describe, expect, it } from '@jest/globals';
import {
  FormField, LinkLanding, ProposedCapability, ResourceTable, SecretReveal, StateView, StepFlow,
  brandStyle, sanitizeBrandColor,
} from '@repo/ui';
import { html } from '@/test-utils/render';
import { ProposedCapabilityView } from '@/features/capabilities/views/ProposedCapabilityView';
import { NavList } from '@/features/shell/components/NavList';
import { tenantNav } from '@/constants/navigation';
import { groupBySection } from '@/features/shell/model/nav';

describe('StateView', () => {
  it('uses alert for failures and status for neutral states', () => {
    expect(html(<StateView kind="error" title="Oops" />)).toContain('role="alert"');
    expect(html(<StateView kind="empty" title="None" />)).toContain('role="status"');
    expect(html(<StateView kind="denied" title="No" />)).toContain('data-state="denied"');
  });
  it('marks loading as busy with an accessible title', () => {
    const out = html(<StateView kind="loading" title="Loading data" />);
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('Loading data');
  });
  it('renders a retry action', () => {
    expect(html(<StateView kind="error" title="x" action={{ label: 'Retry', onClick: () => undefined }} />)).toContain('Retry');
  });
});

describe('FormField', () => {
  it('wires label, description and invalid state', () => {
    const out = html(
      <FormField label="Email" hint="Work email" error="Bad" required>
        {(c) => <input {...c} />}
      </FormField>,
    );
    expect(out).toMatch(/<label[^>]+for="/);
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('aria-required="true"');
    expect(out).toContain('role="alert"');
    expect(out).toMatch(/aria-describedby="[^"]+-error"/);
  });
  it('keeps an empty live region when valid', () => {
    const out = html(<FormField label="Name">{(c) => <input {...c} />}</FormField>);
    expect(out).not.toContain('aria-invalid');
    expect(out).toContain('sr-only');
  });
});

describe('LinkLanding', () => {
  const copy = { title: 'Title', description: 'Desc', action: 'Go', secondaryAction: 'Stop' };
  it.each(['expired', 'used', 'invalid', 'wrong-account'] as const)('%s is announced as an alert', (status) => {
    expect(html(<LinkLanding status={status} copy={copy} />)).toContain('role="alert"');
  });
  it('requires an explicit action in the valid state', () => {
    const out = html(<LinkLanding status="valid" copy={copy} />);
    expect(out).toContain('>Go<');
    expect(out).toContain('role="status"');
  });
  it('hides actions while pending', () => {
    const out = html(<LinkLanding status="pending" copy={{ title: 'T', description: 'D' }} />);
    expect(out).toContain('aria-busy="true"');
    expect(out).not.toContain('<button');
  });
});

describe('StepFlow', () => {
  it('marks the current step', () => {
    const out = html(
      <StepFlow
        steps={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]}
        currentId="b"
        progressLabel="Step 2 of 2"
        stepLabel={(s, i) => `Step ${i + 1}: ${s.label}`}
      >
        body
      </StepFlow>,
    );
    expect(out.match(/aria-current="step"/g)).toHaveLength(1);
    expect(out).toContain('Step 2 of 2');
  });
});

describe('SecretReveal', () => {
  it('does not render the secret until revealed', () => {
    const out = html(
      <SecretReveal
        secret="s3cr3t-value"
        fieldLabel="Client secret"
        onAcknowledge={() => undefined}
        labels={{ warning: 'W', copy: 'Copy', copied: 'C', copyFailed: 'F', show: 'Show', hide: 'Hide', hiddenValue: '••••', acknowledge: 'Done' }}
      />,
    );
    expect(out).not.toContain('s3cr3t-value');
    expect(out).toContain('aria-pressed="false"');
  });
});

describe('ProposedCapability', () => {
  it('has a Planned badge, TODO block and no interactive controls', () => {
    const out = html(
      <ProposedCapability
        title="Groups" summary="s" badgeLabel="Planned" intro="i" todoHeading="TODO" requirements={['r1']}
        contractHeading="Contract" missingContract="none"
      />,
    );
    expect(out).toContain('Planned');
    expect(out).toContain('r1');
    expect(out).not.toMatch(/<(button|input|a) /);
  });
  it('renders catalogue handoff copy through the view', () => {
    const out = html(<ProposedCapabilityView id="groups" />);
    expect(out).toContain('Planned');
    expect(out).toContain('No group endpoints exist yet');
  });
});

describe('ResourceTable', () => {
  const labels = {
    searchLabel: 'Search', searchPlaceholder: 'Find', previous: 'Prev', next: 'Next', pageStatus: 'Page 1',
    rowActions: (r: { id: string }) => `Actions ${r.id}`,
    loading: { title: 'Loading' }, empty: { title: 'Nothing' }, filteredEmpty: { title: 'No match' },
    error: { title: 'Failed' }, denied: { title: 'Denied' }, unavailable: { title: 'Down' },
  };
  const columns = [{ header: 'Name', accessorKey: 'id' as const }];
  it('shows filtered-empty only when filters are active', () => {
    expect(html(<ResourceTable columns={columns} rows={[]} status="ready" labels={labels} />)).toContain('data-state="empty"');
    expect(html(<ResourceTable columns={columns} rows={[]} status="ready" labels={labels} isFiltered />)).toContain('data-state="filtered-empty"');
  });
  it.each([['error', 'Failed'], ['denied', 'Denied'], ['loading', 'Loading']] as const)('renders %s', (status, text) => {
    expect(html(<ResourceTable columns={columns} rows={[]} status={status} labels={labels} />)).toContain(text);
  });
  it('renders rows with a labelled search landmark and row action button', () => {
    const out = html(
      <ResourceTable
        columns={columns} rows={[{ id: 'r1' }]} status="ready" labels={labels}
        onSearchChange={() => undefined} rowActions={() => [{ id: 'x', label: 'Delete', onSelect: () => undefined }]}
        pagination={{ page: 1, hasPrevious: false, hasNext: true, onPrevious: () => undefined, onNext: () => undefined }}
      />,
    );
    expect(out).toContain('role="search"');
    expect(out).toContain('aria-label="Actions r1"');
    expect(out).toContain('type="search"');
  });
});

describe('NavList', () => {
  it('renders real links from the route constants', () => {
    const out = html(<NavList sections={groupBySection(tenantNav('acme'))} />);
    expect(out).toContain('href="/t/acme/users"');
    expect(out).toContain('People');
  });
});

describe('brand colour', () => {
  it('accepts hex only', () => {
    expect(sanitizeBrandColor('#2ABF6C')).toBe('#2abf6c');
    expect(sanitizeBrandColor('red; background:url(x)')).toBeUndefined();
  });
  it('drops colours without readable contrast', () => {
    expect(brandStyle('#2563eb')['--accent']).toBe('#2563eb');
    expect(brandStyle('#808080')).toEqual({});
  });
});
