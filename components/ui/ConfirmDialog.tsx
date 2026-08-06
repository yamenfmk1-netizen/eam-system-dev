'use client';

import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'حذف',
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        <p className="mt-1.5 text-sm text-gray-500">{message}</p>
        <div className="mt-6 flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1">
            إلغاء
          </button>
          <button onClick={onConfirm} disabled={loading} className="btn-danger flex-1">
            {loading ? 'جارٍ الحذف...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
