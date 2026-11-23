'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { sendPaymentSchema, validateSendPayment, sanitizePaymentInput } from '@/utils/validation';
import { SendPaymentRequest, ContactSelection } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import ContactPicker from './ContactPicker';
import {
  Send,
  User,
  X,
  ChevronDown,
  Loader2,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import toast from 'react-hot-toast';

interface SendPaymentFormProps {
  onSubmit: (data: SendPaymentRequest) => Promise<void>;
  contacts: any[];
  isLoading?: boolean;
  defaultTokenType?: 'XLM' | 'USDC' | 'USDT' | 'BTC' | 'ETH' | 'AQUA';
}

export const SendPaymentForm: React.FC<SendPaymentFormProps> = ({
  onSubmit,
  contacts,
  isOnline,
  isLoading = false,
  defaultTokenType = 'XLM',
}) => {
  const [selectedContact, setSelectedContact] = useState<ContactSelection | null>(null);
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<SendPaymentRequest>({
    resolver: zodResolver(sendPaymentSchema),
    defaultValues: {
      tokenType: defaultTokenType,
      memoType: 'none',
    },
  });

  // Preselect contact when initialContactId is provided and contacts are loaded
  useEffect(() => {
    if (!initialContactId || contacts.length === 0 || selectedContact) return;
    const match = contacts.find((c) => c.id === initialContactId);
    if (match) {
      const selection: ContactSelection = {
        id: match.id,
        name: match.name,
        address: match.address,
        tokenType: match.tokenType,
        avatar: match.avatar,
        isFavorite: match.isFavorite,
        lastUsed: match.lastUsed,
      };
      setSelectedContact(selection);
      setValue('recipientAddress', selection.address);
      setValue('tokenType', selection.tokenType);
    }
  }, [initialContactId, contacts, selectedContact, setValue]);

  const watchedToken = watch('tokenType');
  const watchedMemoType = watch('memoType');

  // Check self-transfer on every address field change
  const handleRecipientChange = (value: string) => {
    if (senderAddress && value.trim().length > 0) {
      const isSelf =
        normalizeAddress(value) === normalizeAddress(senderAddress);
      setIsSelfTransfer(isSelf);
      if (!isSelf) setSelfTransferAcknowledged(false);
    } else {
      setIsSelfTransfer(false);
      setSelfTransferAcknowledged(false);
    }
  };

  const handleContactSelect = (contact: ContactSelection) => {
    setSelectedContact(contact);
    setValue('recipientAddress', contact.address);
    setValue('tokenType', contact.tokenType);
    handleRecipientChange(contact.address);

    // Prefill memo preset only when the contact carries one.
    // The user remains free to edit or clear these values before submitting.
    if (contact.defaultMemo && contact.defaultMemoType && contact.defaultMemoType !== 'none') {
      setValue('memo', contact.defaultMemo);
      setValue('memoType', contact.defaultMemoType);
    } else {
      setValue('memo', '');
      setValue('memoType', 'none');
    }

    toast.success(`Selected ${contact.name}`);
  };

  const handleClearContact = () => {
    setSelectedContact(null);
    setValue('recipientAddress', '');
    setIsSelfTransfer(false);
    setSelfTransferAcknowledged(false);
  };

  const handleFormSubmit = async (data: SendPaymentRequest) => {
    // Guard: warn user about self-transfer but allow them to proceed after
    // acknowledging.  This is a UX safeguard only — the backend is the
    // authoritative check.
    if (isSelfTransfer && !selfTransferAcknowledged) {
      toast.error('Please read and acknowledge the self-transfer warning before sending.');
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Sanitize input
      const sanitizedData = sanitizePaymentInput(data);
      
      // Add contact reference if selected
      if (selectedContact) {
        sanitizedData.recipientContactId = selectedContact.id;
      }
      
      // Validate again (defensive programming)
      const validation = validateSendPayment(sanitizedData);
      if (!validation.isValid) {
        validation.errors.forEach((error) => toast.error(error));
        return;
      }
      
      await onSubmit(sanitizedData);
      
      // Reset form on success
      reset();
      setSelectedContact(null);
      setIsSelfTransfer(false);
      setSelfTransferAcknowledged(false);
    } catch (error: unknown) {
      console.error('Payment submission error:', error);
      toast.error(error?.message || 'Failed to send payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getContactDisplayName = () => {
    if (selectedContact) {
      return (
        <div className="flex items-center space-x-2">
          <User className="h-4 w-4 text-blue-400" />
          <span className="text-blue-400">{selectedContact.name}</span>
        </div>
      );
    }
    return 'Select from contacts';
  };

  return (
    <div className="space-y-6">
      {/* Contact Selection */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Recipient</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsContactPickerOpen(true)}
            className="text-blue-400 hover:text-blue-300"
          >
            <User className="h-4 w-4 mr-1" aria-hidden="true" />
            Select Contact
          </Button>
        </div>

        {selectedContact ? (
          <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-center space-x-3">
              <div
                aria-hidden="true"
                className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm"
              >
                {selectedContact.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-white">{selectedContact.name}</p>
                <p className="text-xs text-gray-400">{selectedContact.tokenType}</p>
                {selectedContact.defaultMemo && selectedContact.defaultMemoType && selectedContact.defaultMemoType !== 'none' && (
                  <p className="text-xs text-blue-300 mt-0.5">
                    Memo preset applied — you can edit it below
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearContact}
              className="text-gray-400 hover:text-white"
              aria-label={`Remove ${selectedContact.name} as recipient`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 text-sm">
            Select a contact or enter address manually
          </div>
        )}
      </Card>

      {/* Payment Form */}
      <Card className="p-6">
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6" noValidate>
          {/* Recipient Address */}
          <div>
            <label htmlFor="recipient-address" className="block text-sm font-medium text-gray-300 mb-2">
              Recipient Address
            </label>
            <Input
              id="recipient-address"
              {...register('recipientAddress')}
              placeholder="GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"
              className={cn(
                'font-mono text-sm',
                selectedContact && 'bg-blue-500/5 border-blue-500/30'
              )}
              disabled={!!selectedContact}
            <label
              htmlFor={recipientFieldId}
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Recipient Address
            </label>
            <Input
              {...register('recipientAddress')}
              placeholder="GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"
              className={cn(
                'font-mono text-sm',
                selectedContact && 'bg-blue-500/5 border-blue-500/30'
              )}
              disabled={!!selectedContact}
            />
            {errors.recipientAddress && (
              <p
                id={`${recipientFieldId}-error`}
                role="alert"
                className="mt-1 text-xs text-red-400"
              >
                {errors.recipientAddress.message}
              </p>
            )}

            {/* Self-transfer warning — advisory, not a hard block */}
            {isSelfTransfer && (
              <div
                id={selfTransferWarningId}
                role="alert"
                className="mt-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/40 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                  <p className="text-xs text-yellow-300">
                    <strong>Sending to yourself?</strong> The recipient address
                    matches your own wallet. Double-check before continuing — most
                    self-transfers are accidental.
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selfTransferAcknowledged}
                    onChange={(e) => setSelfTransferAcknowledged(e.target.checked)}
                    className="rounded border-yellow-500 accent-yellow-400"
                  />
                  <span className="text-xs text-yellow-300">
                    I intend to send to my own address and want to proceed.
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="send-amount" className="block text-sm font-medium text-gray-300 mb-2">
              Amount
            </label>
            <div className="flex space-x-2">
              <Input
                id="send-amount"
                {...register('amount')}
                placeholder="0.00"
                type="number"
                step="0.0000001"
                className="flex-1"
              />
              <select
                id="token-type-select"
                aria-label="Token Type"
                {...register('tokenType')}
                className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Token type"
              >
                {SUPPORTED_ASSETS.map((token) => (
                  <option key={token} value={token}>
                    {token}
                  </option>
                ))}
              </select>
            </div>
            {errors.amount && (
              <p role="alert" className="mt-1 text-xs text-red-400">
                {errors.amount.message}
              </p>
            )}
            {errors.tokenType && (
              <p role="alert" className="mt-1 text-xs text-red-400">
                {errors.tokenType.message}
              </p>
            )}
          </div>

          {/* Memo */}
          <div>
            <label htmlFor="memo-type-select" className="block text-sm font-medium text-gray-300 mb-2">
              Memo (Optional)
            </label>
            <div className="space-y-2">
              <select
                id="memo-type-select"
                aria-label="Memo Type"
                {...register('memoType')}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Memo type"
              >
                <option value="none">No Memo</option>
                <option value="text">Text Memo</option>
                <option value="id">ID Memo</option>
                <option value="hash">Hash Memo</option>
              </select>

              {watchedMemoType !== 'none' && (
                <Input
                  id="memo-value-input"
                  aria-label="Memo Value"
                  {...register('memo')}
                  placeholder={
                    watchedMemoType === 'text'
                      ? 'Enter memo text (max 28 characters)'
                      : watchedMemoType === 'id'
                      ? 'Enter numeric ID'
                      : 'Enter 64-character hex hash'
                  }
                  className={cn(
                    'font-mono text-sm',
                    watchedMemoType === 'hash' && 'uppercase'
                  )}
                  maxLength={watchedMemoType === 'hash' ? 64 : 28}
                />
              )}
            </div>
            {errors.memo && (
              <p role="alert" className="mt-1 text-xs text-red-400">
                {errors.memo.message}
              </p>
            )}
            {errors.memoType && (
              <p role="alert" className="mt-1 text-xs text-red-400">
                {errors.memoType.message}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isSubmitting || isLoading}
            className="w-full"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                Send Payment
                <Send className="h-4 w-4 mr-2" />
                Send Payment
              </>
            )}
          </Button>
        </form>
      </Card>

      {/* Contact Picker Modal */}
      <ContactPicker
        contacts={contacts}
        onSelect={handleContactSelect}
        onClose={() => setIsContactPickerOpen(false)}
        isOpen={isContactPickerOpen}
        tokenType={watchedToken}
      />
    </div>
  );
};

export default SendPaymentForm;
