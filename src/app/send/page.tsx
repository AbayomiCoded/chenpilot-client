'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store';
import { getContacts } from '@/store/slices/contactsSlice';
import { ChatLayout } from '@/components/layout/ChatLayout';
import SendPaymentForm from '@/components/payment/SendPaymentForm';
import { PaymentStatusResult, PaymentSubmissionResult, SendPaymentRequest } from '@/types';
import apiService from '@/services/api';
import { StellarNetworkBadge } from '@/components/wallet/StellarNetworkBadge';
import { ArrowLeft, Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function SendPaymentPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { list: contacts, isLoading: contactsLoading } = useAppSelector((state) => state.contacts);
  const nativeBalance = useAppSelector((state) => state.wallet?.nativeBalance ?? 0);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    dispatch(getContacts());
  }, [dispatch, isAuthenticated, router]);

  const handleSendPayment = async (data: SendPaymentRequest) => {
    try {
      // In a real implementation, this would call the payment API
      console.log('Sending payment:', data);
      
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      toast.success('Payment sent successfully!');
      router.push('/transactions');
    } catch (error: any) {
      console.error('Payment error:', error);
      const message = getPaymentFailureMessage(error);
      toast.error(message || 'Failed to send payment');
    }
  };
  const handleSendPayment = (data: SendPaymentRequest, idempotencyKey: string): Promise<PaymentSubmissionResult> =>
    apiService.sendPayment(data, idempotencyKey);

  const handleCheckPaymentStatus = (idempotencyKey: string): Promise<PaymentStatusResult> =>
    apiService.getPaymentStatus(idempotencyKey);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#060816] text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ChatLayout>
      <div className="h-full flex flex-col bg-[#060816] text-white overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-800 bg-[#060816]/80 backdrop-blur-xl">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.back()}
                  className="text-gray-400 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h1 className="text-2xl font-bold">Send Payment</h1>
                  <p className="text-sm text-gray-400">
                    Send tokens to your contacts or any address
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StellarNetworkBadge />
                <div className="flex items-center space-x-2 bg-blue-500/10 px-3 py-1.5 rounded-full border border-blue-500/30">
                  <Shield className="h-4 w-4 text-blue-400" />
                  <span className="text-xs font-medium text-blue-300">Secure</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <SendPaymentForm
              onSubmit={handleSendPayment}
              onCheckStatus={handleCheckPaymentStatus}
              contacts={contacts}
              isLoading={contactsLoading}
              availableBalance={nativeBalance}
            />
          </div>
        </div>
      </div>
    </ChatLayout>
  );
}
