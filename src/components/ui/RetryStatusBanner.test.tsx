import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { ui } = vi.hoisted(() => ({ ui: { retryStatus: null as null | Record<string, unknown> } }));
vi.mock('@/store', () => ({ useAppSelector: (select: (s: unknown) => unknown) => select({ ui }) }));

import RetryStatusBanner from './RetryStatusBanner';

describe('RetryStatusBanner announcements (#307)', () => {
  it('announces the attempt, not the ticking countdown', () => {
    ui.retryStatus = { label: 'GET /balance', attempt: 2, maxAttempts: 3, nextRetryAt: Date.now() + 5000 };
    render(<RetryStatusBanner />);

    const live = screen.getByRole('status');
    expect(live).toHaveTextContent('Retrying GET /balance, attempt 2 of 3');
    expect(live.textContent).not.toMatch(/\(in \d+s\)/);
    // The visible countdown text is hidden from assistive technology
    expect(screen.getByText(/attempt 2 of 3/, { selector: '[aria-hidden="true"]' })).toBeInTheDocument();
  });
});
