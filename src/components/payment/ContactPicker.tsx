'use client';

import React, { useState, useMemo } from 'react';
import { ContactPickerProps, ContactSelection } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import {
  Search,
  User,
  X,
  Star,
  Clock,
  ChevronRight,
  Users,
} from 'lucide-react';
import { formatAddress } from '@/utils/format';
import { cn } from '@/utils/cn';
import { LtrText } from '@/components/ui/LtrText';

export const ContactPicker: React.FC<ContactPickerProps> = ({
  contacts,
  onSelect,
  onClose,
  isOpen,
  isLoading = false,
  tokenType,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Convert contacts to ContactSelection format
  const contactSelections: ContactSelection[] = useMemo(() => {
    return contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      address: contact.address,
      tokenType: contact.tokenType as any,
      avatar: contact.avatar,
      isFavorite: contact.isFavorite,
      lastUsed: contact.lastUsed,
    }));
  }, [contacts]);

  // Filter contacts based on search term and token type
  const filteredContacts = useMemo(() => {
    let filtered = contactSelections;

    // Filter by token type if specified
    if (tokenType) {
      filtered = filtered.filter((contact) => contact.tokenType === tokenType);
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (contact) =>
          contact.name.toLowerCase().includes(term) ||
          contact.address.toLowerCase().includes(term)
      );
    }

    // Sort: favorites first, then by last used
    return filtered.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      if (a.lastUsed && b.lastUsed) {
        return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
      }
      if (a.lastUsed) return -1;
      if (b.lastUsed) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [contactSelections, searchTerm, tokenType]);

  const handleSelectContact = (contact: ContactSelection) => {
    onSelect(contact);
    onClose();
    setSearchTerm('');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500',
      'bg-orange-500',
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select Recipient">
      <div className="space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search contacts by name or address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="ps-10"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute end-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Token Type Filter Badge */}
        {tokenType && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Filtering by:</span>
            <LtrText className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
              {tokenType}
            </LtrText>
            <button
              onClick={() => setSearchTerm('')}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Clear filter
            </button>
          </div>
        )}

        {/* Contact List */}
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Loading contacts...</p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-2">
                {searchTerm || tokenType
                  ? 'No contacts match your search'
                  : 'No contacts yet'}
              </p>
              {!searchTerm && !tokenType && (
                <p className="text-sm text-gray-400">
                  Add contacts to quickly send payments
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredContacts.map((contact) => (
                <Card
                  key={contact.id}
                  className={cn(
                    'cursor-pointer hover:border-blue-500 transition-colors',
                    'p-3'
                  )}
                  onClick={() => handleSelectContact(contact)}
                >
                  <div className="flex items-center space-x-3">
                    {/* Avatar */}
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm',
                        getAvatarColor(contact.name)
                      )}
                    >
                      {contact.avatar ? (
                        <img
                          src={contact.avatar}
                          alt={contact.name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        getInitials(contact.name)
                      )}
                    </div>

                    {/* Contact Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium text-white truncate">
                          {contact.name}
                        </h4>
                        {contact.isFavorite && (
                          <Star className="h-3 w-3 text-yellow-400 fill-current" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                          <LtrText>{formatAddress(contact.address)}</LtrText>
                        </code>
                        <LtrText className="text-xs text-gray-500">{contact.tokenType}</LtrText>
                      </div>
                      {contact.lastUsed && (
                        <div className="flex items-center gap-1 mt-1">
                          <Clock className="h-3 w-3 text-gray-500" />
                          <span className="text-xs text-gray-500">
                            Used {new Date(contact.lastUsed).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Select Indicator */}
                    <ChevronRight className="h-4 w-4 text-gray-400 rtl:rotate-180" />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-700">
          <span className="text-sm text-gray-500">
            {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ContactPicker;
