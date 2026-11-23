import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { translateText, ui } = vi.hoisted(() => ({
  translateText: vi.fn(),
  ui: { language: 'en', translationLanguage: null as string | null },
}));

vi.mock('@/store', () => ({ useAppSelector: (select: (s: unknown) => unknown) => select({ ui }) }));
vi.mock('@/services/api', () => ({ default: { translateText } }));

import { MessageTranslation } from './MessageTranslation';

const SPANISH = '¿Cuál es el saldo de mi cartera para la semana?';

describe('MessageTranslation (#83)', () => {
  beforeEach(() => {
    translateText.mockReset();
    ui.language = 'en';
    ui.translationLanguage = null;
  });

  it('shows a translate button only on foreign-language messages', () => {
    const { container } = render(<MessageTranslation text="What is the balance of my wallet and the fees?" />);
    expect(container).toBeEmptyDOMElement();

    render(<MessageTranslation text={SPANISH} />);
    expect(screen.getByRole('button', { name: 'Translate to English' })).toBeInTheDocument();
  });

  it('shows the translation inline and keeps the original text untouched', async () => {
    translateText.mockResolvedValue({ translatedText: 'What is my wallet balance for the week?' });
    render(
      <div>
        <p>{SPANISH}</p>
        <MessageTranslation text={SPANISH} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Translate to English' }));

    expect(await screen.findByText('What is my wallet balance for the week?')).toBeInTheDocument();
    expect(screen.getByText(/Translated from Spanish/)).toBeInTheDocument();
    expect(screen.getByText(SPANISH)).toBeInTheDocument();
    expect(translateText).toHaveBeenCalledWith(SPANISH, 'en');
  });

  it('uses the configured translation language preference', () => {
    ui.translationLanguage = 'fr';
    render(<MessageTranslation text={SPANISH} />);
    expect(screen.getByRole('button', { name: 'Translate to French' })).toBeInTheDocument();
  });

  it('reports when translation is unavailable', async () => {
    translateText.mockRejectedValue({ response: { status: 501 } });
    render(<MessageTranslation text={SPANISH} />);
    fireEvent.click(screen.getByRole('button', { name: 'Translate to English' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Translation is unavailable');
  });
});
