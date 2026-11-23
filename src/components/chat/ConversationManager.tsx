'use client';

import React, { useState, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { addTag, removeTag, setSelectedTags, toggleConversationPin } from '@/store/slices/chatSlice';
import { Conversation } from '@/types';
import { X, Plus, Tag, Trash2 } from 'lucide-react';

interface ConversationManagerProps {
  onSelectConversation?: (conversation: Conversation) => void;
  /** Request deletion; the parent confirms and cancels in-flight work (#269). */
  onDeleteConversation?: (conversation: Conversation) => void;
}

export const ConversationManager: React.FC<ConversationManagerProps> = ({ onSelectConversation, onDeleteConversation }) => {
  const dispatch = useAppDispatch();
  const { conversations, selectedTags, currentConversation } = useAppSelector((state) => state.chat);
  const [newTag, setNewTag] = useState('');
  const [editingConvId, setEditingConvId] = useState<string | null>(null);

  // Get all unique tags from conversations
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    conversations.forEach(conv => {
      conv.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [conversations]);

  // Filter conversations by selected tags
  const filteredConversations = useMemo(() => {
    const matching = selectedTags.length === 0
      ? conversations
      : conversations.filter(conv =>
        selectedTags.some(tag => conv.tags?.includes(tag))
      );
    return [...matching].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      if (a.pinned && b.pinned) {
        return new Date(b.pinnedAt ?? b.updatedAt).getTime() - new Date(a.pinnedAt ?? a.updatedAt).getTime();
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [conversations, selectedTags]);

  const handleAddTag = (conversationId: string, tag: string) => {
    if (tag.trim()) {
      dispatch(addTag({ conversationId, tag: tag.trim() }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (conversationId: string, tag: string) => {
    dispatch(removeTag({ conversationId, tag }));
  };

  const toggleTagFilter = (tag: string) => {
    if (selectedTags.includes(tag)) {
      dispatch(setSelectedTags(selectedTags.filter(t => t !== tag)));
    } else {
      dispatch(setSelectedTags([...selectedTags, tag]));
    }
  };

  return (
    <div className="space-y-6">
      {/* Tag Filter Section */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center mb-3">
          <Tag className="h-4 w-4 text-gray-400 mr-2" />
          <h3 className="text-sm font-medium text-white">Filter by Tags</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {allTags.length === 0 ? (
            <p className="text-xs text-gray-500">No tags yet. Create one below.</p>
          ) : (
            allTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTagFilter(tag)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedTags.includes(tag)
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
              >
                {tag}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Conversations List */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-white">
          Conversations {selectedTags.length > 0 && `(${filteredConversations.length})`}
        </h3>
        {filteredConversations.length === 0 ? (
          <div className="bg-gray-800/30 rounded-lg p-4 text-center">
            <p className="text-sm text-gray-400">
              {selectedTags.length > 0 ? 'No conversations match these tags.' : 'No conversations yet.'}
            </p>
          </div>
        ) : (
          <ul aria-label="Conversations" className="space-y-2 max-h-96 overflow-y-auto">
            {filteredConversations.map(conversation => (
              <li
                key={conversation.id}
                className="bg-gray-800/40 rounded-lg p-3 border border-gray-700 hover:border-gray-600 transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <button
                    onClick={() => onSelectConversation?.(conversation)}
                    aria-current={conversation.id === currentConversation?.id ? "page" : undefined}
                    className="text-left flex-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                  >
                    <h4 className="text-sm font-medium text-white hover:text-purple-400 transition-colors truncate">
                      {conversation.title}
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">{conversation.messageCount} messages</p>
                  </button>
                  <button
                    type="button"
                    aria-label={conversation.pinned ? `Unpin ${conversation.title}` : `Pin ${conversation.title}`}
                    aria-pressed={Boolean(conversation.pinned)}
                    onClick={() => dispatch(toggleConversationPin(conversation.id))}
                    className="ml-2 rounded p-1 text-gray-400 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                  >
                    <Star className={`h-4 w-4 ${conversation.pinned ? "fill-amber-300 text-amber-300" : ""}`} />
                  </button>
                  {onDeleteConversation && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conversation);
                      }}
                      aria-label={`Delete ${conversation.title}`}
                      className="ml-2 rounded p-1 text-gray-500 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* Tags Display */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {conversation.tags?.map(tag => (
                    <div
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-purple-600/20 border border-purple-500/30 rounded text-xs text-purple-300"
                    >
                      {tag}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveTag(conversation.id, tag);
                        }}
                        className="hover:text-purple-200"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Tag Input */}
                {editingConvId === conversation.id ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      placeholder="New tag..."
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAddTag(conversation.id, newTag);
                          setEditingConvId(null);
                        } else if (e.key === 'Escape') {
                          setEditingConvId(null);
                          setNewTag('');
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        handleAddTag(conversation.id, newTag);
                        setEditingConvId(null);
                      }}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded text-xs font-medium"
                    >
                      Add
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingConvId(conversation.id)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-400 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Add tag
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
