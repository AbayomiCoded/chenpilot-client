// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider, useLanguageDirection } from './LanguageProvider';
import { LtrText, BIDI_LTR_INPUT_PROPS } from '@/components/ui/LtrText';
import { ContactPicker } from '@/components/payment/ContactPicker';
import TransactionDetailsDrawer from '@/components/dashboard/TransactionDetailsDrawer';
import { CodeBlock } from '@/components/chat/CodeBlock';
import type { Language } from '@/lib/i18n/i18n';
import type { StellarTransaction } from '@/types';

let mockLanguage: Language = 'ar';

vi.mock('highlight.js/styles/atom-one-dark.css', () => ({}));

vi.mock('@/components/ui/Input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/store', () => ({
  useAppSelector: (selector: (state: { ui: { language: Language } }) => unknown) =>
    selector({ ui: { language: mockLanguage } }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/config/stellarNetwork', () => ({
  getStellarNetwork: () => 'testnet',
}));

function DirectionProbe() {
  const { language, direction, isRtl } = useLanguageDirection();
  return (
    <span data-testid="dir-probe">
      {language}|{direction}|{String(isRtl)}
    </span>
  );
}

describe('Arabic RTL layouts and mixed-direction wallet values (#293)', () => {
  beforeEach(() => {
    mockLanguage = 'ar';
    document.documentElement.lang = '';
    document.documentElement.dir = '';
    document.documentElement.className = '';
    delete document.documentElement.dataset.direction;
  });

  it('sets Arabic RTL document direction and exposes direction context via LanguageProvider', () => {
    const view = render(
      <LanguageProvider>
        <DirectionProbe />
      </LanguageProvider>,
    );

    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.dataset.direction).toBe('rtl');
    expect(document.documentElement.classList.contains('rtl')).toBe(true);
    expect(screen.getByTestId('dir-probe')).toHaveTextContent('ar|rtl|true');

    mockLanguage = 'en';
    view.rerender(
      <LanguageProvider>
        <DirectionProbe />
      </LanguageProvider>,
    );

    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.classList.contains('rtl')).toBe(false);
    expect(screen.getByTestId('dir-probe')).toHaveTextContent('en|ltr|false');
  });

  it('isolates LTR addresses and token badges in Send/Contacts ContactPicker under Arabic RTL', () => {
    const publicKey = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';

    render(
      <LanguageProvider>
        <ContactPicker
          isOpen
          onClose={vi.fn()}
          onSelect={vi.fn()}
          tokenType="XLM"
          contacts={[
            {
              id: 'c1',
              name: 'أحمد علي',
              address: publicKey,
              tokenType: 'XLM',
              createdAt: '2026-10-19T12:00:00.000Z',
              updatedAt: '2026-10-19T12:00:00.000Z',
            },
          ]}
        />
      </LanguageProvider>,
    );

    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByText('أحمد علي')).toBeInTheDocument();

    const isolatedBdis = document.querySelectorAll('bdi[dir="ltr"]');
    expect(isolatedBdis.length).toBeGreaterThanOrEqual(2);

    const addressNode = Array.from(isolatedBdis).find((el) =>
      el.textContent?.includes('GAAZ') && el.textContent?.includes('CWN7'),
    );
    expect(addressNode).toBeDefined();
    expect(addressNode).toHaveClass('bidi-ltr-isolate');
    // Semantic order preserved (prefix before suffix, never reversed)
    expect(addressNode?.textContent?.startsWith('GAAZ')).toBe(true);
    expect(addressNode?.textContent?.endsWith('CWN7')).toBe(true);
  });

  it('isolates hashes, ledger numbers, fees, amounts, and counterparty addresses in TransactionDetailsDrawer under Arabic RTL', () => {
    const txHash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
    const fromKey = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';
    const toKey = 'GBDEVU63Y6NTHJQQZIKVTC23NWLQVP3WJ2RI2OTSJTNYOIGICST6DUXR';

    const tx: StellarTransaction = {
      id: 'tx-1',
      hash: txHash,
      created_at: '2026-10-19T12:00:00.000Z',
      source_account: fromKey,
      fee_charged: '0.00001',
      ledger: 54321,
      successful: true,
      memo: 'دفعة إيجار',
      operations: [
        {
          id: 'op-1',
          type: 'payment',
          amount: '125.50',
          asset: 'XLM',
          from: fromKey,
          to: toKey,
        },
      ],
    };

    render(
      <LanguageProvider>
        <TransactionDetailsDrawer transaction={tx} onClose={vi.fn()} />
      </LanguageProvider>,
    );

    expect(document.documentElement.dir).toBe('rtl');

    const bdiElements = Array.from(document.querySelectorAll('bdi[dir="ltr"]'));
    const texts = bdiElements.map((el) => el.textContent?.trim());

    expect(texts).toContain(txHash);
    expect(texts).toContain('#54321');
    expect(texts).toContain('125.50 XLM');
    expect(texts).toContain(fromKey);
    expect(texts).toContain(toKey);
    expect(texts.some((t) => t?.includes('XLM') && t?.includes('0.00001'))).toBe(true);
  });

  it('isolates inline and block wallet values in Chat CodeBlock and mixed Arabic labels without reversing semantics', () => {
    const publicKey = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';

    render(
      <LanguageProvider>
        <div data-testid="arabic-chat-bubble">
          <p>
            تم إرسال <LtrText>-42.75 USDC</LtrText> إلى{' '}
            <CodeBlock inline>{publicKey}</CodeBlock>
          </p>
          <CodeBlock className="language-json">{'{"amount":"42.75","asset":"USDC"}'}</CodeBlock>
          <input aria-label="Stellar address" {...BIDI_LTR_INPUT_PROPS} defaultValue={publicKey} />
        </div>
      </LanguageProvider>,
    );

    expect(document.documentElement.dir).toBe('rtl');

    const amountBdi = screen.getByText('-42.75 USDC');
    expect(amountBdi.tagName).toBe('BDI');
    expect(amountBdi).toHaveAttribute('dir', 'ltr');
    expect(amountBdi).toHaveClass('bidi-ltr-isolate');

    const inlineCode = screen.getByText(publicKey);
    expect(inlineCode.tagName).toBe('CODE');
    expect(inlineCode).toHaveAttribute('dir', 'ltr');
    expect(inlineCode).toHaveClass('bidi-ltr-isolate');

    const preBlock = document.querySelector('pre');
    expect(preBlock).toHaveAttribute('dir', 'ltr');

    const addressInput = screen.getByLabelText('Stellar address');
    expect(addressInput).toHaveAttribute('dir', 'ltr');
    expect(addressInput).toHaveValue(publicKey);
  });
});
