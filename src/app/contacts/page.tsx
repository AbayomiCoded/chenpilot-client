'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  getContacts,
  createContact,
  updateContact,
  softDeleteContact,
  restoreContact,
  commitDeleteContact,
  toggleFavorite,
  optimisticToggleFavorite,
} from '@/store/slices/contactsSlice';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ChatLayout } from '@/components/layout/ChatLayout';
import {
  Users,
  Plus,
  Search,
  Edit,
  Trash2,
  Copy,
  QrCode,
  Star,
} from 'lucide-react';
import { formatAddress } from '@/utils/format';
import { Contact, CreateContactRequest } from '@/types';
import toast from 'react-hot-toast';

/** How long (ms) the undo window stays open before the delete is committed. */
const UNDO_WINDOW_MS = 5_000;

/**
 * Stable sort: favorites first, then alphabetical by name within each group.
 * Does not mutate the input array.
 */
function sortContacts(contacts: Contact[]): Contact[] {
  return [...contacts].sort((a, b) => {
    const aFav = a.isFavorite ? 0 : 1;
    const bFav = b.isFavorite ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    return a.name.localeCompare(b.name);
  });
}

export default function ContactsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { list: contacts, isLoading } = useAppSelector((state) => state.contacts);

  const [searchTerm, setSearchTerm] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState<CreateContactRequest>({
    name: '',
    address: '',
    tokenType: 'STRK',
  });

  /** Timer refs keyed by contact id so multiple undo windows can coexist. */
  const undoTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }
    dispatch(getContacts());
  }, [dispatch, isAuthenticated, router]);

  // Clean up any lingering timers on unmount.
  useEffect(() => {
    const timers = undoTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  // Filter → sort. Sort is stable so search results stay predictable.
  const displayedContacts = sortContacts(
    contacts.filter((contact) => {
      if (showFavoritesOnly && !contact.isFavorite) return false;
      const term = searchTerm.toLowerCase();
      return (
        contact.name.toLowerCase().includes(term) ||
        contact.address.toLowerCase().includes(term)
      );
    }),
  );

  const favoriteCount = contacts.filter((c) => c.isFavorite).length;

  // ─── Create / Edit ───────────────────────────────────────────────────────────

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await dispatch(createContact(formData)).unwrap();
      toast.success('Contact created successfully!');
      setIsCreateModalOpen(false);
      setFormData({ name: '', address: '', tokenType: 'STRK' });
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : String(error || 'Failed to create contact'),
      );
    }
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact) return;
    try {
      await dispatch(updateContact({ id: editingContact.id, data: formData })).unwrap();
      toast.success('Contact updated successfully!');
      setIsEditModalOpen(false);
      setEditingContact(null);
      setFormData({ name: '', address: '', tokenType: 'STRK' });
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : String(error || 'Failed to update contact'),
      );
    }
  };

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({ name: contact.name, address: contact.address, tokenType: contact.tokenType });
    setIsEditModalOpen(true);
  };

  // ─── Favorites ───────────────────────────────────────────────────────────────

  const handleToggleFavorite = async (contact: Contact) => {
    // Flip immediately in the UI.
    dispatch(optimisticToggleFavorite(contact.id));
    try {
      await dispatch(toggleFavorite(contact.id)).unwrap();
    } catch (error: unknown) {
      // The slice already reverted the optimistic flip on rejection.
      toast.error(
        error instanceof Error ? error.message : String(error || 'Failed to update favorite'),
      );
    }
  };

  // ─── Delete with undo ────────────────────────────────────────────────────────

  const openDeleteModal = (contact: Contact) => {
    setContactToDelete(contact);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!contactToDelete) return;
    const contact = contactToDelete;
    setIsDeleteModalOpen(false);
    setContactToDelete(null);

    dispatch(softDeleteContact(contact.id));

    const toastId = `undo-delete-${contact.id}`;

    toast(
      (t) => (
        <span className="flex items-center gap-3">
          <span>
            <span className="font-medium">{contact.name}</span> deleted.
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm font-semibold bg-white/10 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
            onClick={() => {
              const timer = undoTimers.current.get(contact.id);
              if (timer) {
                clearTimeout(timer);
                undoTimers.current.delete(contact.id);
              }
              dispatch(restoreContact(contact.id));
              toast.dismiss(t.id);
              toast.success(`${contact.name} restored.`);
            }}
          >
            Undo
          </button>
        </span>
      ),
      { id: toastId, duration: UNDO_WINDOW_MS },
    );

    const timer = setTimeout(async () => {
      undoTimers.current.delete(contact.id);
      toast.dismiss(toastId);
      try {
        await dispatch(commitDeleteContact(contact.id)).unwrap();
      } catch (error: unknown) {
        toast.error(
          error instanceof Error ? error.message : String(error || 'Failed to delete contact'),
        );
      }
    }, UNDO_WINDOW_MS);

    undoTimers.current.set(contact.id, timer);
  };

  // ─── Clipboard ───────────────────────────────────────────────────────────────

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  // ─── Loading gate ─────────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  const emptyTitle = showFavoritesOnly
    ? 'No favorites yet'
    : searchTerm
    ? 'No contacts found'
    : 'No contacts yet';

  const emptyDescription = showFavoritesOnly
    ? 'Star a contact to add it here.'
    : searchTerm
    ? 'Try another name or address.'
    : 'Save a contact to make future transfers easier.';

  return (
    <ChatLayout>
      <div className="h-full flex flex-col bg-black text-white overflow-hidden relative">
        {/* Background grid */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
          {/* Toolbar */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Your Contacts</h2>
                <p className="text-gray-300">
                  {contacts.length} contact{contacts.length !== 1 ? 's' : ''} total
                  {favoriteCount > 0 && (
                    <span className="ml-2 text-yellow-400">
                      · {favoriteCount} favorite{favoriteCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Favorites filter toggle */}
                <button
                  type="button"
                  onClick={() => setShowFavoritesOnly((v) => !v)}
                  aria-pressed={showFavoritesOnly}
                  aria-label={showFavoritesOnly ? 'Show all contacts' : 'Show favorites only'}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400',
                    showFavoritesOnly
                      ? 'bg-yellow-400/20 text-yellow-400 hover:bg-yellow-400/30'
                      : 'text-gray-400 hover:bg-white/10',
                  ].join(' ')}
                >
                  <Star
                    className="h-4 w-4"
                    aria-hidden="true"
                    fill={showFavoritesOnly ? 'currentColor' : 'none'}
                  />
                  Favorites
                </button>

                {/* Search */}
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                    aria-hidden="true"
                  />
                  <Input
                    placeholder="Search contacts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full sm:w-56"
                    aria-label="Search contacts"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Contacts Grid */}
          {isLoading ? (
            <div className="text-center py-12">
              <div
                className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"
                aria-label="Loading contacts"
                role="status"
              />
              <p className="mt-4 text-gray-300">Loading contacts...</p>
            </div>
          ) : displayedContacts.length === 0 ? (
            <EmptyState
              icon={<Users aria-hidden="true" className="h-8 w-8" />}
              title={emptyTitle}
              description={emptyDescription}
              action={
                !searchTerm && !showFavoritesOnly
                  ? {
                      label: 'Add your first contact',
                      onClick: () => setIsCreateModalOpen(true),
                      icon: <Plus aria-hidden="true" className="h-4 w-4" />,
                    }
                  : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedContacts.map((contact) => (
                <Card key={contact.id}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{contact.name}</h3>
                      <p className="text-sm text-gray-300">{contact.tokenType}</p>
                    </div>
                    <div className="flex items-center space-x-1">
                      {/* Favorite toggle */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleFavorite(contact)}
                        aria-pressed={!!contact.isFavorite}
                        aria-label={
                          contact.isFavorite
                            ? `Remove ${contact.name} from favorites`
                            : `Add ${contact.name} to favorites`
                        }
                        className={contact.isFavorite ? 'text-yellow-400' : 'text-gray-400 hover:text-yellow-400'}
                      >
                        <Star
                          className="h-4 w-4"
                          aria-hidden="true"
                          fill={contact.isFavorite ? 'currentColor' : 'none'}
                        />
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(contact)}
                        aria-label={`Edit ${contact.name}`}
                      >
                        <Edit className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDeleteModal(contact)}
                        className="text-red-600 hover:text-red-700"
                        aria-label={`Delete ${contact.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-300 mb-1">Address</p>
                      <div className="flex items-center space-x-2">
                        <code className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded flex-1">
                          {formatAddress(contact.address)}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(contact.address, 'Address')}
                          aria-label="Copy address"
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Added {new Date(contact.createdAt).toLocaleDateString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toast('QR code generation coming soon!')}
                        aria-label="Show QR code"
                      >
                        <QrCode className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ── Delete Confirmation Modal ── */}
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => { setIsDeleteModalOpen(false); setContactToDelete(null); }}
          title="Delete contact"
          ariaLabel="Delete contact confirmation"
        >
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            Delete{' '}
            <span className="font-semibold text-gray-900 dark:text-white">
              {contactToDelete?.name}
            </span>
            ? You&apos;ll have a few seconds to undo this.
          </p>
          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setIsDeleteModalOpen(false); setContactToDelete(null); }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmDelete}
              data-testid="confirm-delete-btn"
            >
              Delete
            </Button>
          </div>
        </Modal>

        {/* ── Create Contact Modal ── */}
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title="Add New Contact"
        >
          <form onSubmit={handleCreateContact} className="space-y-4">
            <Input
              label="Name"
              placeholder="Enter contact name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Input
              label="Address"
              placeholder="Enter Stellar address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Token Type
              </label>
              <select
                value={formData.tokenType}
                onChange={(e) => setFormData({ ...formData, tokenType: e.target.value as CreateContactRequest['tokenType'] })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              >
                <option value="STRK">STRK</option>
                <option value="ETH">ETH</option>
                <option value="DAI">DAI</option>
              </select>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Add Contact</Button>
            </div>
          </form>
        </Modal>

        {/* ── Edit Contact Modal ── */}
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Edit Contact"
        >
          <form onSubmit={handleUpdateContact} className="space-y-4">
            <Input
              label="Name"
              placeholder="Enter contact name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Input
              label="Address"
              placeholder="Enter Stellar address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Token Type
              </label>
              <select
                value={formData.tokenType}
                onChange={(e) => setFormData({ ...formData, tokenType: e.target.value as CreateContactRequest['tokenType'] })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              >
                <option value="STRK">STRK</option>
                <option value="ETH">ETH</option>
                <option value="DAI">DAI</option>
              </select>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Update Contact</Button>
            </div>
          </form>
        </Modal>
      </div>
    </ChatLayout>
  );
}
