'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getSignedUrl } from '@/lib/storage/client';
import toast from 'react-hot-toast';

export default function PrivateFileLink({
  bucket,
  path,
  mode,
  className,
  children,
}: {
  bucket: string;
  path: string;
  mode: 'view' | 'download';
  className?: string;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const url = await getSignedUrl(bucket, path);
    setLoading(false);
    if (!url) {
      toast.error('تعذر الوصول إلى الملف');
      return;
    }
    if (mode === 'download') {
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={loading} className={className}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}
