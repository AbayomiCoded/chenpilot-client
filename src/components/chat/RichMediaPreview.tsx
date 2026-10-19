
"use client";

import React, { useState } from "react";
import { ExternalLink, X } from "lucide-react";

interface RichMediaPreviewProps {
  content: string;
}

interface MediaInfo {
  type: 'image' | 'video' | 'link';
  url: string;
  title?: string;
}

const URL_PATTERNS = {
  image: /\.(?:jpeg|jpg|gif|png|webp|svg|bmp)(?:\?.*)?$/i,
  video: /\.(?:mp4|webm|ogg|mov|avi|mkv)(?:\?.*)?$/i,
  url: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi,
};

const detectMedia = (content: string): MediaInfo[] => {
  const media: MediaInfo[] = [];
  const urls = content.match(URL_PATTERNS.url) || [];

  urls.forEach((url) => {
    if (URL_PATTERNS.image.test(url)) {
      media.push({ type: 'image', url });
    } else if (URL_PATTERNS.video.test(url)) {
      media.push({ type: 'video', url });
    } else {
      // Extract domain for link preview
      try {
        const urlObj = new URL(url);
        const title = urlObj.hostname;
        media.push({ type: 'link', url, title });
      } catch {
        media.push({ type: 'link', url, title: url });
      }
    }
  });

  return media;
};

export default function RichMediaPreview({ content }: RichMediaPreviewProps) {
  const [dismissed, setDismissed] = useState(false);
  const mediaItems = detectMedia(content);

  if (dismissed || mediaItems.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      {mediaItems.map((media, index) => (
        <div
          key={`${media.type}-${index}`}
          className="relative group rounded-lg overflow-hidden bg-gray-800/50 border border-gray-700/50"
        >
          <button
            onClick={() => setDismissed(true)}
            className="absolute top-2 right-2 z-10 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            title="Dismiss preview"
          >
            <X className="h-3 w-3 text-white" />
          </button>

          {media.type === 'image' && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={media.url}
                alt="Preview"
                className="max-h-64 w-full object-cover rounded-lg"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <a
                href={media.url}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-2 right-2 p-2 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4 text-white" />
              </a>
            </div>
          )}

          {media.type === 'video' && (
            <div className="relative">
              <video
                src={media.url}
                controls
                className="max-h-64 w-full rounded-lg"
                preload="metadata"
              />
            </div>
          )}

          {media.type === 'link' && (
            <a
              href={media.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 hover:bg-gray-700/50 transition-colors"
            >
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <ExternalLink className="h-4 w-4 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {media.title}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {media.url}
                </p>
              </div>
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
