import React, { useEffect, useMemo, useRef, useState } from 'react';
import { handleImageError } from '../utils/fileHelpers';

interface LazyMemberAvatarProps {
  src: string;
  alt: string;
  jenisKelamin?: 'L' | 'P' | string;
  sizeClass?: string;
  className?: string;
  rootMargin?: string;
}

function getInitials(name: string): string {
  const cleaned = (name || '').trim();
  if (!cleaned) return 'PD';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

export const LazyMemberAvatar: React.FC<LazyMemberAvatarProps> = React.memo(
  ({
    src,
    alt,
    jenisKelamin,
    sizeClass = 'w-8 h-8',
    className = 'print:hidden',
    rootMargin = '180px 0px',
  }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);

    // Inline data URLs (e.g. default SVG avatar) need no network request and can display immediately
    const isInlineDataUrl = Boolean(src && src.startsWith('data:'));
    const [shouldLoad, setShouldLoad] = useState<boolean>(isInlineDataUrl);
    const [isLoaded, setIsLoaded] = useState<boolean>(isInlineDataUrl);

    const initials = useMemo(() => getInitials(alt), [alt]);

    // Observe visibility via IntersectionObserver before triggering network fetch
    useEffect(() => {
      if (isInlineDataUrl) {
        setShouldLoad(true);
        setIsLoaded(true);
        return;
      }

      if (shouldLoad) return;

      const node = containerRef.current;
      if (!node || typeof IntersectionObserver === 'undefined') {
        setShouldLoad(true);
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting || entry.intersectionRatio > 0) {
              setShouldLoad(true);
              observer.disconnect();
              break;
            }
          }
        },
        { rootMargin, threshold: 0.01 }
      );

      observer.observe(node);
      return () => observer.disconnect();
    }, [isInlineDataUrl, rootMargin, shouldLoad]);

    // Reset loading fade state when photo URL changes, while immediately showing cached images
    useEffect(() => {
      if (isInlineDataUrl) {
        setIsLoaded(true);
        return;
      }
      if (shouldLoad && imgRef.current?.complete && imgRef.current?.naturalWidth > 0) {
        setIsLoaded(true);
      } else {
        setIsLoaded(false);
      }
    }, [src, shouldLoad, isInlineDataUrl]);

    return (
      <div
        ref={containerRef}
        className={`relative ${sizeClass} rounded-full overflow-hidden shrink-0 border border-neutral-200 bg-emerald-50/80 select-none ${className}`}
      >
        {!isLoaded && (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-50 to-neutral-100 text-[10px] font-bold tracking-tight text-emerald-800/70 animate-pulse"
          >
            {initials}
          </div>
        )}
        {shouldLoad && (
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setIsLoaded(true)}
            onError={(e) => {
              handleImageError(e, jenisKelamin);
              setIsLoaded(true);
            }}
            className={`w-full h-full object-cover transition-opacity duration-200 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
      </div>
    );
  }
);

LazyMemberAvatar.displayName = 'LazyMemberAvatar';
