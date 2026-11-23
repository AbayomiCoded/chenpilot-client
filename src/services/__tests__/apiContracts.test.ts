import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockAxiosInstance, mockBareAxios } = vi.hoisted(() => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    defaults: {
      baseURL: 'http://localhost:2333',
      headers: { 'Content-Type': 'application/json' },
    },
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };

  const mockBareAxios = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    create: vi.fn(() => mockAxiosInstance),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    isAxiosError: vi.fn((err: unknown) => !!(err && typeof err === 'object' && 'isAxiosError' in err)),
  };

  return { mockAxiosInstance, mockBareAxios };
});

vi.mock('axios', () => ({
  default: mockBareAxios,
  ...mockBareAxios,
}));

import { ApiService, requestAccountFunding } from '../api';
import { CreateContactRequest, UpdateContactRequest, Contact, StellarTransaction } from '@/types';

describe('ApiService - Contact & Transaction API Contracts', () => {
  let apiService: ApiService;
  const sampleAddress = 'GBRPYHIL2CI3FNQ4AFIXFKVKGMWVDWDBCAGA6XVZZDAML7THV7CANUBB';

  beforeEach(() => {
    vi.clearAllMocks();
    mockBareAxios.create.mockReturnValue(mockAxiosInstance);
    apiService = new ApiService();
  });

  describe('Contact Endpoints Contract', () => {
    const mockContact: Contact = {
      id: 'c-101',
      name: 'Ada Lovelace',
      address: sampleAddress,
      tokenType: 'XLM',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      isFavorite: true,
    };

    describe('getContacts()', () => {
      it('asserts GET request path is /contacts without payload and returns contract shape', async () => {
        const responseData = {
          success: true,
          data: [mockContact],
          message: 'Contacts retrieved successfully',
        };
        mockAxiosInstance.get.mockResolvedValueOnce({ data: responseData, status: 200 });

        const result = await apiService.getContacts();

        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/contacts');
        expect(result).toEqual(responseData);
      });

      it('handles 404 response with graceful fallback envelope', async () => {
        const error404 = {
          response: {
            status: 404,
            data: { message: 'Not Found' },
          },
        };
        mockAxiosInstance.get.mockRejectedValueOnce(error404);

        const result = await apiService.getContacts();

        expect(result).toEqual({
          success: true,
          data: [],
          message: 'Contact management is available through the chat interface',
        });
      });

      it('propagates non-404 error responses (e.g. 500, 401, 403, 400)', async () => {
        const serverError = {
          response: {
            status: 500,
            data: { message: 'Internal Server Error' },
          },
        };
        mockAxiosInstance.get.mockRejectedValueOnce(serverError);

        await expect(apiService.getContacts()).rejects.toEqual(serverError);
      });

      it('propagates network disconnect error without swallowing', async () => {
        const networkError = new Error('Network Error');
        mockAxiosInstance.get.mockRejectedValueOnce(networkError);

        await expect(apiService.getContacts()).rejects.toThrow('Network Error');
      });
    });

    describe('createContact()', () => {
      const payload: CreateContactRequest = {
        name: 'Ada Lovelace',
        address: sampleAddress,
        tokenType: 'XLM',
      };

      it('asserts POST path /contacts and request payload matches contract', async () => {
        const responseData = {
          success: true,
          data: mockContact,
          message: 'Contact created successfully',
        };
        mockAxiosInstance.post.mockResolvedValueOnce({ data: responseData, status: 201 });

        const result = await apiService.createContact(payload);

        expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/contacts', payload);
        expect(result).toEqual(responseData);
      });

      it('handles 404 response with fallback error envelope', async () => {
        const error404 = {
          response: {
            status: 404,
            data: { message: 'Route not found' },
          },
        };
        mockAxiosInstance.post.mockRejectedValueOnce(error404);

        const result = await apiService.createContact(payload);

        expect(result).toEqual({
          success: false,
          status: 404,
          message: expect.stringContaining('Contact creation is available through the chat interface'),
        });
      });

      it('propagates validation/server errors (e.g. 400 Bad Request, 500)', async () => {
        const badRequestError = {
          response: {
            status: 400,
            data: { message: 'Validation failed: Invalid address' },
          },
        };
        mockAxiosInstance.post.mockRejectedValueOnce(badRequestError);

        await expect(apiService.createContact(payload)).rejects.toEqual(badRequestError);
      });
    });

    describe('updateContact()', () => {
      const updatePayload: UpdateContactRequest = {
        name: 'Ada Lovelace-Updated',
        tokenType: 'USDC',
      };

      it('asserts PUT path /contacts/:id and payload match contract', async () => {
        const updatedContact = { ...mockContact, ...updatePayload };
        const responseData = {
          success: true,
          data: updatedContact,
        };
        mockAxiosInstance.put.mockResolvedValueOnce({ data: responseData, status: 200 });

        const result = await apiService.updateContact('c-101', updatePayload);

        expect(mockAxiosInstance.put).toHaveBeenCalledTimes(1);
        expect(mockAxiosInstance.put).toHaveBeenCalledWith('/contacts/c-101', updatePayload);
        expect(result).toEqual(responseData);
      });

      it('handles 404 response with fallback error envelope', async () => {
        const error404 = {
          response: {
            status: 404,
            data: { message: 'Not Found' },
          },
        };
        mockAxiosInstance.put.mockRejectedValueOnce(error404);

        const result = await apiService.updateContact('c-nonexistent', updatePayload);

        expect(result).toEqual({
          success: false,
          status: 404,
          message: 'Contact updates are available through the chat interface',
        });
      });

      it('propagates non-404 errors', async () => {
        const serverError = {
          response: {
            status: 503,
            data: { message: 'Service Unavailable' },
          },
        };
        mockAxiosInstance.put.mockRejectedValueOnce(serverError);

        await expect(apiService.updateContact('c-101', updatePayload)).rejects.toEqual(serverError);
      });
    });

    describe('deleteContact()', () => {
      it('asserts DELETE path /contacts/:id without payload', async () => {
        const responseData = {
          success: true,
          data: { message: 'Contact deleted' },
        };
        mockAxiosInstance.delete.mockResolvedValueOnce({ data: responseData, status: 200 });

        const result = await apiService.deleteContact('c-101');

        expect(mockAxiosInstance.delete).toHaveBeenCalledTimes(1);
        expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/contacts/c-101');
        expect(result).toEqual(responseData);
      });

      it('handles 404 response with fallback error envelope', async () => {
        const error404 = {
          response: {
            status: 404,
            data: { message: 'Not Found' },
          },
        };
        mockAxiosInstance.delete.mockRejectedValueOnce(error404);

        const result = await apiService.deleteContact('c-101');

        expect(result).toEqual({
          success: false,
          status: 404,
          message: expect.stringContaining('Contact deletion is available through the chat interface'),
        });
      });

      it('propagates non-404 errors', async () => {
        const serverError = {
          response: {
            status: 500,
            data: { message: 'Database failure' },
          },
        };
        mockAxiosInstance.delete.mockRejectedValueOnce(serverError);

        await expect(apiService.deleteContact('c-101')).rejects.toEqual(serverError);
      });
    });
  });

  describe('Transaction Endpoints Contract', () => {
    const mockTransaction: StellarTransaction = {
      id: 'tx-001',
      hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      type: 'payment',
      amount: '50.0000000',
      assetCode: 'XLM',
      from: sampleAddress,
      to: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGAHWKXX2UROW6MDQKVMJYOCSFJSC',
      createdAt: '2026-01-01T12:00:00Z',
      status: 'success',
      fee: '0.0000100',
    };

    describe('getAccountTransactions()', () => {
      it('asserts path /account/:userId/transactions and default pagination query params', async () => {
        const responseData = {
          success: true,
          data: {
            transactions: [mockTransaction],
            total: 1,
            page: 1,
            limit: 10,
          },
        };
        mockAxiosInstance.get.mockResolvedValueOnce({ data: responseData, status: 200 });

        const result = await apiService.getAccountTransactions('usr-42');

        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/account/usr-42/transactions', {
          params: { page: 1, limit: 10 },
        });
        expect(result).toEqual(responseData);
      });

      it('asserts custom pagination query parameters are passed correctly', async () => {
        const responseData = {
          success: true,
          data: {
            transactions: [mockTransaction],
            total: 55,
            page: 3,
            limit: 25,
          },
        };
        mockAxiosInstance.get.mockResolvedValueOnce({ data: responseData, status: 200 });

        const result = await apiService.getAccountTransactions('usr-42', 3, 25);

        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/account/usr-42/transactions', {
          params: { page: 3, limit: 25 },
        });
        expect(result.data.page).toBe(3);
        expect(result.data.limit).toBe(25);
      });

      it('handles empty transaction list contract', async () => {
        const responseData = {
          success: true,
          data: {
            transactions: [],
            total: 0,
            page: 1,
            limit: 10,
          },
        };
        mockAxiosInstance.get.mockResolvedValueOnce({ data: responseData, status: 200 });

        const result = await apiService.getAccountTransactions('usr-empty');

        expect(result.data.transactions).toEqual([]);
        expect(result.data.total).toBe(0);
      });

      it('propagates error responses (404 User Not Found, 500, network error)', async () => {
        const notFoundError = {
          response: {
            status: 404,
            data: { success: false, status: 404, message: 'User account not found' },
          },
        };
        mockAxiosInstance.get.mockRejectedValueOnce(notFoundError);

        await expect(apiService.getAccountTransactions('usr-unknown')).rejects.toEqual(notFoundError);
      });
    });

    describe('requestAccountFunding()', () => {
      it('returns immediately without HTTP call if balance already meets required amount', async () => {
        const result = await requestAccountFunding(sampleAddress, 10, 15, true);

        expect(result.success).toBe(true);
        expect(result.message).toContain('already sufficiently funded');
        expect(mockBareAxios.post).not.toHaveBeenCalled();
        expect(mockBareAxios.get).not.toHaveBeenCalled();
      });

      it('asserts POST /api/fund path and payload when funding needed', async () => {
        mockBareAxios.post.mockResolvedValueOnce({
          data: { txHash: 'tx-backend-fund-hash' },
        });

        const result = await requestAccountFunding(sampleAddress, 10, 2, false);

        expect(mockBareAxios.post).toHaveBeenCalledTimes(1);
        expect(mockBareAxios.post).toHaveBeenCalledWith('/api/fund', {
          publicKey: sampleAddress,
          requiredAmount: 10,
        });
        expect(result).toEqual({
          success: true,
          message: 'Account funded successfully via backend service.',
          txHash: 'tx-backend-fund-hash',
        });
      });

      it('falls back to Stellar Friendbot on testnet when backend service fails', async () => {
        mockBareAxios.post.mockRejectedValueOnce(new Error('Backend down'));
        mockBareAxios.get.mockResolvedValueOnce({
          data: { hash: 'friendbot-tx-hash' },
        });

        const result = await requestAccountFunding(sampleAddress, 10, 0, true);

        expect(mockBareAxios.post).toHaveBeenCalledTimes(1);
        expect(mockBareAxios.get).toHaveBeenCalledTimes(1);
        expect(mockBareAxios.get).toHaveBeenCalledWith(`https://friendbot.stellar.org/?addr=${sampleAddress}`);
        expect(result).toEqual({
          success: true,
          message: 'Account funded successfully via Stellar Testnet Friendbot fallback.',
          txHash: 'friendbot-tx-hash',
        });
      });

      it('throws actionable error on 429 rate limit when backend fails without fallback', async () => {
        const error429 = {
          response: { status: 429 },
        };
        mockBareAxios.post.mockRejectedValueOnce(error429);

        await expect(requestAccountFunding(sampleAddress, 10, 0, false)).rejects.toThrow(
          'Funding rate limit exceeded. Required: 10 XLM. Please try again later.'
        );
      });

      it('throws actionable error on 400 invalid request when backend fails without fallback', async () => {
        const error400 = {
          response: { status: 400 },
        };
        mockBareAxios.post.mockRejectedValueOnce(error400);

        await expect(requestAccountFunding(sampleAddress, 10, 0, false)).rejects.toThrow(
          'Invalid funding request. Required balance: 10 XLM, Current: 0 XLM.'
        );
      });

      it('throws fallback failure error when both backend and friendbot fail on testnet', async () => {
        mockBareAxios.post.mockRejectedValueOnce(new Error('Backend down'));
        mockBareAxios.get.mockRejectedValueOnce(new Error('Friendbot timeout'));

        await expect(requestAccountFunding(sampleAddress, 10, 0, true)).rejects.toThrow(
          'Funding failed: Backend service unavailable and Friendbot fallback failed. Required: 10 XLM, Current: 0 XLM.'
        );
      });
    });
  });
});
