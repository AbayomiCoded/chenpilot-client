// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import RichMediaPreview from './RichMediaPreview';

describe('RichMediaPreview', () => {
  describe('URL detection', () => {
    it('detects multiple URLs in content', () => {
      const { container } = render(
        <RichMediaPreview content="Image: https://example.com/img.png and https://example.com/vid.mp4" />
      );
      expect(container.querySelectorAll('img')).toHaveLength(1);
      expect(container.querySelectorAll('video')).toHaveLength(1);
    });

    it('does not render preview when no URLs present', () => {
      const { container } = render(
        <RichMediaPreview content="Just plain text without any URLs" />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Image preview', () => {
    it('renders image with correct src', () => {
      const { container } = render(
        <RichMediaPreview content="https://example.com/photo.jpg" />
      );
      const img = container.querySelector('img') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toBe('https://example.com/photo.jpg');
    });

    it('handles image load error by hiding image', () => {
      const { container } = render(
        <RichMediaPreview content="https://example.com/broken.jpg" />
      );
      const img = container.querySelector('img') as HTMLImageElement;
      fireEvent.error(img);
      expect(img.style.display).toBe('none');
    });
  });

  describe('Video preview', () => {
    it('renders video with correct src', () => {
      const { container } = render(
        <RichMediaPreview content="https://example.com/video.mp4" />
      );
      const video = container.querySelector('video') as HTMLVideoElement;
      expect(video).toBeTruthy();
      expect(video.src).toBe('https://example.com/video.mp4');
    });

    it('has controls enabled', () => {
      const { container } = render(
        <RichMediaPreview content="https://example.com/video.mp4" />
      );
      const video = container.querySelector('video') as HTMLVideoElement;
      expect(video.controls).toBe(true);
    });
  });

  describe('Link preview', () => {
    it('renders link preview for non-media URLs', () => {
      const { container } = render(
        <RichMediaPreview content="Visit https://example.com for more info" />
      );
      const link = container.querySelector('a') as HTMLAnchorElement;
      expect(link).toBeTruthy();
      expect(link.href).toContain('example.com');
    });

    it('handles invalid URLs gracefully', () => {
      const { container } = render(
        <RichMediaPreview content="Visit not-a-valid-url" />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Dismiss functionality', () => {
    it('dismisses preview when button clicked', () => {
      const { container } = render(
        <RichMediaPreview content="https://example.com/image.jpg" />
      );
      const dismissBtn = container.querySelector('button') as HTMLButtonElement;
      expect(dismissBtn).toBeTruthy();
      fireEvent.click(dismissBtn);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('handles empty content', () => {
      const { container } = render(<RichMediaPreview content="" />);
      expect(container.firstChild).toBeNull();
    });

    it('handles content with only whitespace', () => {
      const { container } = render(<RichMediaPreview content="   " />);
      expect(container.firstChild).toBeNull();
    });

    it('handles malformed URLs', () => {
      const { container } = render(
        <RichMediaPreview content="htttp://invalid-url" />
      );
      expect(container.firstChild).toBeNull();
    });
  });
});
