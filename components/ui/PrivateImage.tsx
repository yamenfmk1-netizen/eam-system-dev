'use client';

import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { getSignedUrl } from '@/lib/storage/client';

export default function PrivateImage({
  bucket,
  path,
  alt,
  className,
}: {
  bucket: string;
  path: string | null;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getSignedUrl(bucket, path).then((signed) => {
      if (!cancelled) {
        setUrl(signed);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bucket, path]);

  if (!path || (!loading && !url)) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-300 ${className}`}>
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }

  if (loading) {
    return <div className={`animate-pulse bg-gray-100 ${className}`} />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url!} alt={alt} className={className} />;
}
