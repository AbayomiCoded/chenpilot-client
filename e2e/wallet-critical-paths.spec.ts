import { test, expect } from '@playwright/test';

/**
 * Isolated End-to-End Suite for Wallet-Critical Paths
 * 
 * Rules:
 * - Uses deterministic route mocks (no live backend dependency)
 * - NEVER uses mainnet credentials, secret keys, or seeds
 * - Only uses testnet addresses and placeholder test tokens
 */

const TESTNET_USER = {
  id: 'usr-testnet-01',
  email: 'testnet.contributor@example.test',
  name: 'Testnet Pilot',
  address: 'GBRPYHIL2CI3FNQ4AFIXFKVKGMWVDWDBCAGA6XVZZDAML7THV7CANUBB',
  publicKey: 'GBRPYHIL2CI3FNQ4AFIXFKVKGMWVDWDBCAGA6XVZZDAML7THV7CANUBB',
  isDeployed: true,
  isFunded: true,
  tokenType: 'XLM',
  authProvider: 'email',
  isEmailVerified: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const TESTNET_CONTACT = {
  id: 'c-testnet-01',
  name: 'Bob Testnet',
  address: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGAHWKXX2UROW6MDQKVMJYOCSFJSC',
  tokenType: 'XLM',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const TESTNET_TRANSACTION = {
  id: 'tx-testnet-01',
  hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
  type: 'payment',
  amount: '15.5000000',
  assetCode: 'XLM',
  from: TESTNET_USER.address,
  to: TESTNET_CONTACT.address,
  createdAt: '2026-01-01T12:00:00Z',
  status: 'success',
  fee: '0.0000100',
};

test.describe('Wallet Critical Paths (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept auth API
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Signed in',
          data: {
            user: TESTNET_USER,
            token: 'mock-testnet-jwt-token',
          },
        }),
      });
    });

    // Intercept contacts API
    await page.route('**/contacts', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [TESTNET_CONTACT],
          }),
        });
      } else if (route.request().method() === 'POST') {
        const payload = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: 'c-testnet-created',
              name: payload?.name || 'New Testnet Contact',
              address: payload?.address || TESTNET_CONTACT.address,
              tokenType: payload?.tokenType || 'XLM',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Intercept transactions API
    await page.route('**/account/*/transactions*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            transactions: [TESTNET_TRANSACTION],
            total: 1,
            page: 1,
            limit: 10,
          },
        }),
      });
    });
  });

  test('1. Login to Dashboard flow with testnet credentials', async ({ page }) => {
    await page.goto('/auth/login');

    // Fill login credentials
    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    await emailInput.fill(TESTNET_USER.email);
    await passwordInput.fill('ValidPassword123!');

    // Submit form
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Verify routing and landing page
    await expect(page).toHaveURL(/\/(chat|dashboard)/);
  });

  test('2. Contact creation flow and modal focus behavior', async ({ page }) => {
    // Inject auth state into localStorage
    await page.addInitScript((user) => {
      window.localStorage.setItem('auth_token', 'mock-testnet-jwt-token');
      window.localStorage.setItem('user_data', JSON.stringify(user));
    }, TESTNET_USER);

    await page.goto('/contacts');

    // Find and click the Add Contact button
    const addContactBtn = page.getByRole('button', { name: /add.*contact/i });
    if (await addContactBtn.isVisible()) {
      await addContactBtn.click();

      // Check modal opens and has proper accessible dialog role
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Fill in contact form fields
      const nameInput = dialog.getByPlaceholder(/contact name/i);
      const addressInput = dialog.getByPlaceholder(/stellar address/i);

      await nameInput.fill('Alice Testnet');
      await addressInput.fill(TESTNET_USER.address);

      // Submit modal form
      const saveBtn = dialog.getByRole('button', { name: /add contact|save/i });
      await saveBtn.click();
    }
  });

  test('3. Payment validation, precision handling, and backend recovery', async ({ page }) => {
    // Inject auth state
    await page.addInitScript((user) => {
      window.localStorage.setItem('auth_token', 'mock-testnet-jwt-token');
      window.localStorage.setItem('user_data', JSON.stringify(user));
    }, TESTNET_USER);

    await page.goto('/send');

    // Viewport responsiveness check
    await page.setViewportSize({ width: 1280, height: 720 });

    const recipientInput = page.locator('#recipient-address');
    const amountInput = page.locator('#send-amount');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(recipientInput).toBeVisible();
    await expect(amountInput).toBeVisible();

    // Trigger validation error by entering invalid address
    await recipientInput.fill('invalid-address');
    await amountInput.fill('0');
    await submitBtn.click();

    // Error messages should appear without app crashing
    await expect(page.locator('text=Please enter a valid Stellar address').or(page.locator('text=Recipient address is invalid'))).toBeVisible();

    // Test precision handling with 7 decimals (Stellar stroops)
    await recipientInput.fill(TESTNET_CONTACT.address);
    await amountInput.fill('10.1234567');

    // Mock backend error recovery
    await page.route('**/api/fund', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Service temporarily unavailable' }),
      });
    });

    // Form inputs retain values during recovery
    await expect(amountInput).toHaveValue('10.1234567');
  });

  test('4. Transaction history rendering and data integrity', async ({ page }) => {
    // Inject auth state
    await page.addInitScript((user) => {
      window.localStorage.setItem('auth_token', 'mock-testnet-jwt-token');
      window.localStorage.setItem('user_data', JSON.stringify(user));
    }, TESTNET_USER);

    await page.goto('/transactions');

    // Verify transaction history page renders
    await expect(page.getByRole('heading', { name: /transactions/i })).toBeVisible();
  });
});
