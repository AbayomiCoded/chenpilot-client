'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  getContacts,
  createContact,
  updateContact,
  deleteContact,
  importContacts,
  paginateContacts,
  filterContacts,
} from '@/store/slices/contactsSlice';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ChatLayout } from '@/components/layout/ChatLayout';
import { ImportPreviewModal } from '@/components/contacts/ImportPreviewModal';
import { Users, Plus, Search, Edit, Trash2, Copy, QrCode, Upload } from 'lucide-react';
import { formatAddress } from '@/utils/format';
import { validateContactAddress, normalizeContactAddress } from '@/utils/validation';
import { parseImportFile } from '@/utils/contactsImport';
import type { ContactsImportPreview, ValidImportRow } from '@/utils/contactsImport';
import { Contact, CreateContactRequest } from '@/types';
import { PAGINATION } from '@/constants';
import { buildClipboardFallbackMessage, copyTextToClipboard } from '@/utils/clipboard';
import toast from 'react-hot-toast';

const createEmptyContactForm = (): CreateContactRequest => ({
  name: '',
  address: '',
  tokenType: 'STRK',
  note: '',
});

export default function ContactsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { list: contacts, isLoading } = useAppSelector((state) => state.contacts);

  const [searchTerm, setSearchTerm] = useState('');
  const [contactsPage, setContactsPage] = useState(1);

  // Create modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  // Edit modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddressChangeConfirmationOpen, setIsAddressChangeConfirmationOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState<CreateContactRequest>(createEmptyContactForm());
  const [addressError, setAddressError] = useState<string | null>(null);

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<ContactsImportPreview | null>(null);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }
    void dispatch(getContacts());
  }, [dispatch, isAuthenticated, router]);

  const filteredContacts = filterContacts(contacts, searchTerm);
  const pageCount = Math.ceil(filteredContacts.length / PAGINATION.CONTACTS_PAGE_SIZE);
  const currentContactsPage = Math.min(contactsPage, Math.max(1, pageCount));
  const visibleContacts = paginateContacts(filteredContacts, currentContactsPage);

  // ── Create ────────────────────────────────────────────────────────────────
  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const addrErr = validateContactAddress(formData.address);
    if (addrErr) { setAddressError(addrErr); return; }
    setAddressError(null);
    try {
      await dispatch(createContact({ ...formData, note: formData.note?.trim() || undefined })).unwrap();
      toast.success('Contact created successfully!');
      setIsCreateModalOpen(false);
      setFormData(createEmptyContactForm());
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error ?? 'Failed to create contact');
      if (typeof msg === 'string' && msg.includes('already uses this address')) {
        setAddressError(msg);
      } else {
        toast.error(msg);
      }
    }
  };

  // ── Update ────────────────────────────────────────────────────────────────
  const persistContactUpdate = async () => {
    if (!editingContact) return;
    const addrErr = validateContactAddress(formData.address);
    if (addrErr) { setAddressError(addrErr); return; }
    setAddressError(null);
    try {
      await dispatch(updateContact({
        id: editingContact.id,
        data: { ...formData, note: formData.note?.trim() || undefined },
      })).unwrap();
      toast.success('Contact updated successfully!');
      setIsEditModalOpen(false);
      setIsAddressChangeConfirmationOpen(false);
      setEditingContact(null);
      setFormData(createEmptyContactForm());
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error ?? 'Failed to update contact');
      toast.error(msg);
    }
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact) return;
    if (formData.address.trim() !== editingContact.address) {
      setIsAddressChangeConfirmationOpen(true);
      return;
    }
    await persistContactUpdate();
  };

  const cancelAddressChange = () => {
    if (editingContact) {
      setFormData((current) => ({ ...current, address: editingContact.address }));
    }
    setIsAddressChangeConfirmationOpen(false);
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDeleteContact = async (contact: Contact) => {
    if (!window.confirm(`Are you sure you want to delete ${contact.name}?`)) return;
    try {
      await dispatch(deleteContact(contact.id)).unwrap();
      toast.success('Contact deleted successfully!');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error ?? 'Failed to delete contact');
      toast.error(msg);
    }
  };

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setAddressError(null);
    setFormData({ name: contact.name, address: contact.address, tokenType: contact.tokenType, note: contact.note ?? '' });
    setIsEditModalOpen(true);
    setIsAddressChangeConfirmationOpen(false);
  };

  // ── Clipboard ─────────────────────────────────────────────────────────────
  const copyToClipboard = async (text: string, label: string) => {
    const result = await copyTextToClipboard(text, label);
    if (result.ok) { toast.success(`${label} copied to clipboard`); return; }
    toast.error(result.fallbackMessage || buildClipboardFallbackMessage(label));
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected after closing
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== 'string') {
        toast.error('Could not read file.');
        return;
      }
      const result = parseImportFile(text, contacts);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setImportPreview(result.preview);
      setIsImportPreviewOpen(true);
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = async () => {
    if (!importPreview) return;
    const validRows = importPreview.rows
      .filter((r): r is ValidImportRow => r.status === 'valid')
      .map((r) => r.data);

    setIsImporting(true);
    try {
      const result = await dispatch(importContacts(validRows)).unwrap();
      const { succeeded, failures } = result;
      if (failures.length === 0) {
        toast.success(`Imported ${succeeded.length} contact${succeeded.length !== 1 ? 's' : ''}.`);
      } else {
        toast.success(`Imported ${succeeded.length}, failed ${failures.length}.`);
      }
      setIsImportPreviewOpen(false);
      setImportPreview(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? 'Import failed');
      toast.error(msg);
    } finally {
      setIsImporting(false);
    }
  };

  // ── Auth guard ────────────────────────────────────────────────────────────
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
